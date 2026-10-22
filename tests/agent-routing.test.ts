import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Mastra } from '@mastra/core';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { createLegacySalesProposalAgent as createSalesProposalAgent } from '../src/mastra/agents/legacy-proposal.js';
import { ProposalService } from '../src/assistant/service.js';
import { WorkspaceStore } from '../src/assistant/store.js';
import { loadFixture } from '../src/proposal/fixtures.js';
import { customTurns, draftOperation } from './helpers/conversation.js';

// Mock only the provider and PDF bytes. Real Mastra prompts, tool choice, tool execution,
// validators, pricing, persistence, Elements renderers and artifact writes run below.
const pdfStub = async () => Buffer.from('%PDF-1.7\nTEST STORAGE ONLY\n%%EOF');
const options = { memory: { thread: 'routing-test', resource: 'local-owner' } };
async function fixture(run: (s: ProposalService) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'agent-routing-'));
  try { await run(new ProposalService(new WorkspaceStore(root), pdfStub)); }
  finally { await rm(root, {recursive:true, force:true}); }
}
function agent(s: ProposalService, respond: (input: Parameters<MastraLanguageModelV2Mock['doGenerate']>[0]) => { name: string; input: unknown } | string | Promise<{ name: string; input: unknown } | string>) {
  let calls = 0;
  const model = new MastraLanguageModelV2Mock({doGenerate: async input => {
    const reply = await respond(input);
    return {content: typeof reply === 'string' ? [{type:'text' as const,text:reply}] : [{type:'tool-call' as const,toolCallId:`call-${++calls}`,toolName:reply.name,input:JSON.stringify(reply.input)}], finishReason:typeof reply === 'string'?'stop' as const:'tool-calls' as const,usage:{inputTokens:1,outputTokens:1,totalTokens:2},warnings:[]};
  }});
  const a = createSalesProposalAgent(s, model);
  new Mastra({agents:{a},logger:false});
  return a;
}
async function verify(s: ProposalService, sample: 'saas'|'consulting'|'agency') {
  const state = await s.run({action:'read'},'',options.memory.thread);
  assert.equal(state.artifacts?.completeness,'complete');
  const expected = loadFixture(sample);
  const p = JSON.parse(await readFile(state.files!['proposal.json']!, 'utf8'));
  assert.equal(p.seller.name, expected.commercial.seller.name);
  assert.equal(p.customer.company, expected.discovery.customer.company);
  const monthly = expected.draft.recommendations.reduce((sum,r)=>{const product=expected.commercial.catalog.products.find(p=>p.id===r.productId)!;return sum+(product.billing==='monthly'?r.quantity*product.unitPriceCents:0)},0);
  const once = expected.draft.recommendations.reduce((sum,r)=>{const product=expected.commercial.catalog.products.find(p=>p.id===r.productId)!;return sum+(product.billing==='once'?r.quantity*product.unitPriceCents:0)},0);
  assert.deepEqual(p.totals,{monthlyCents:monthly,oneTimeCents:once,firstMonthCents:monthly+once,firstYearCents:12*monthly+once});
  for (const filename of ['email.html','proposal.html','design.json']) {
    const text = await readFile(state.files![filename]!, 'utf8');
    assert.ok(text.includes(p.seller.name) && text.includes(p.customer.company),filename);
  }
  assert.ok((await readFile(state.files!['proposal.pdf']!)).length);
  return state;
}
for (const [request, sample] of [
  ['Generate a sample SaaS proposal.','saas'],['Try with sample data.','saas'],['Create a SaaS proposal now.','saas'],
  ['Generate a consulting sample proposal.','consulting'],['Create a marketing agency sample proposal.','agency'],['Actually, choose consulting.','consulting'],
] as const) test(`actual Mastra routing generates artifacts in one turn: ${request}`, async () => fixture(async s => {
  let count=0;
  const a=agent(s,input=>{
    if (++count===1) { assert.deepEqual(input.toolChoice,{type:'tool',toolName:'generateSample'}); return {name:'generateSample',input:{sample}}; }
    assert.equal(input.toolChoice?.type,'auto','Forced tool choice must not leak into subsequent steps');
    return 'Draft generated. The tool supplies the artifact paths.';
  });
  const response=await a.generate(request,options);
  assert.equal(response.steps.flatMap(step=>step.toolCalls).length,1,'No read/confirmation loop');
  await verify(s,sample);
}));
for (const reply of ['Yes.','Go ahead.','Use the first option.']) test(`short reply restores context across agent instances: ${reply}`, async () => fixture(async s => {
  const sample = reply === 'Go ahead.' ? 'consulting' : 'saas';
  const question = sample === 'consulting' ? 'Shall I generate the consulting sample proposal?' : 'Would you like to try with sample data or create your own proposal?';
  await agent(s,()=> question).generate('Hi',options);
  const restored=new ProposalService(new WorkspaceStore(s.store.root),pdfStub);
  let count=0;
  await agent(restored,input=>{
    if (++count===1) {
      assert.ok(JSON.stringify(input.prompt).includes(question));
      assert.deepEqual(input.toolChoice,{type:'tool',toolName:'generateSample'});
      return {name:'generateSample',input:{sample:'saas'}};
    }
    return 'Generated.';
  }).generate(reply,options);
  await verify(restored,sample); // Context overrides even a model-defaulted SaaS argument.
  assert.equal((await restored.run({action:'read'},'','other-thread')).mode,undefined);
}));
test('one-message custom onboarding extracts multiple facts and generates; revisions persist and regenerate via Mastra',async()=>fixture(async s=>{
  const turns=customTurns();
  const message=turns.map(t=>t.text).join('\n');
  const operations: Record<string,unknown>[] = turns.flatMap<Record<string,unknown>>(t=>t.operations);
  let phase=0;
  const a=agent(s,async input=>{
    assert.notEqual(input.toolChoice?.type,'tool','Custom content must not be forced into samples');
    const state=await s.run({action:'read'},'',options.memory.thread);
    let operation=operations.shift();
    if (!operation && phase++===0) operation=await draftOperation(s,false,options.memory.thread);
    else if (!operation && phase===2) operation={action:'generate'};
    return operation ? {name:'proposalWorkspace',input:{operation:{...operation,revision:state.revision}}} : 'Draft generated.';
  });
  // Custom extraction and subsequent revisions retain original user evidence even
  // when the tool's history/snapshot views are absent, as in the Studio regression.
  const workspaceTool=(await a.listTools()).proposalWorkspace!;
  const execute=workspaceTool.execute!;
  workspaceTool.execute=async(input,context)=>{
    assert.ok(context?.agent);
    return execute(input,{...context,agent:{...context.agent,messages:[],getMessages:()=>[]}});
  };
  await a.generate(message,options);
  let state=await s.run({action:'read'},'',options.memory.thread);
  assert.equal(state.artifacts?.completeness,'complete');
  assert.equal(state.seller.name,'Example Harbor Tools');
  const original=state.artifacts!.directory;
  operations.push({action:'customer',fields:[{field:'name',value:'Morgan Example',quote:'Morgan Example'}]}, {action:'select',productId:'planning-seat',quantity:15,quote:'Increase licenses to 15'}, {action:'remove',productId:'migration',quote:'Remove the migration session'});
  phase=0;
  await a.generate('Change the customer name to Morgan Example. Increase licenses to 15. Remove the migration session.',options);
  state=await s.run({action:'read'},'',options.memory.thread);
  assert.equal(state.artifacts?.completeness,'complete');
  assert.notEqual(state.artifacts!.directory,original);
  assert.equal(state.customer.name,'Morgan Example');
  assert.equal(state.customer.company,'Example Ridge Guild');
  assert.equal(state.products[0]!.unitPriceCents,2500);
  assert.deepEqual(state.review!.proposal.totals,{monthlyCents:37500,oneTimeCents:0,firstMonthCents:37500,firstYearCents:450000});
  for (const filename of ['email.html','proposal.html','design.json','proposal.json']) {
    const text=await readFile(state.files![filename]!,'utf8');
    assert.ok(text.includes('Morgan Example') && text.includes('Example Harbor Tools'));
    assert.ok(!text.includes('Migration session'));
  }
}));
test('changing direction to custom is not intercepted by demo routing',async()=>fixture(async s=>{
  await agent(s,()=> 'Would you like sample data or your own proposal?').generate('Hi',options);
  let count=0;
  await agent(s,input=>{
    assert.notEqual(input.toolChoice?.type,'tool');
    return ++count===1?{name:'proposalWorkspace',input:{operation:{action:'start',mode:'custom',revision:0}}}:'What is your company name and email?';
  }).generate('No, create my own.',options);
  assert.equal((await s.run({action:'read'},'',options.memory.thread)).mode,'custom');
}));

test('Studio streaming path initializes samples and revisions regenerate without unrelated changes',async()=>fixture(async s=>{
  const {runSampleConversation}=await import('./helpers/agent-conversation.js');
  const before=await runSampleConversation(s,'saas');
  const operations: Record<string,unknown>[]=[{action:'select',productId:'editor-license',quantity:15,quote:'Increase licenses to 15'}, {action:'remove',productId:'migration-session',quote:'Remove the migration session'}];
  let phase=0;
  await agent(s,async()=>{
    const state=await s.run({action:'read'},'','saas');
    let operation=operations.shift();
    if (!operation && phase++===0) {
      const draft=structuredClone(loadFixture('saas').draft);
      draft.needs=[{text:'Named access for the selected editors.',evidenceQuote:'Increase licenses to 15'}];
      draft.recommendations=state.selections.map(v=>({...v,rationale:v.productId==='editor-license'?'Provide named access for the selected editors.':'Coordinate the shared release checklist.'}));
      operation={action:'draft',draft};
    }else if(!operation && phase===2)operation={action:'generate'};
    return operation?{name:'proposalWorkspace',input:{operation:{...operation,revision:state.revision}}}:'Draft regenerated.';
  }).generate('Increase licenses to 15. Remove the migration session.',{memory:{thread:'saas',resource:'test-owner'}});
  const after=await s.run({action:'read'},'','saas');
  assert.notEqual(after.artifacts!.directory,before.artifacts!.directory);
  assert.deepEqual(after.seller,before.seller);assert.deepEqual(after.customer,before.customer);assert.deepEqual(after.products,before.products);
  assert.deepEqual(after.review!.proposal.totals,{monthlyCents:42485,oneTimeCents:0,firstMonthCents:42485,firstYearCents:509820});
  for(const file of ['email.html','proposal.html','design.json','proposal.json']) {
    const text=await readFile(after.files![file]!,'utf8');
    assert.ok(!text.includes('Migration session'));
  }
}));

test('seller names and business facts containing scenario words never trigger sample replacement',async()=>fixture(async s=>{
  const {requestedSample}=await import('../src/assistant/conversation.js');
  for(const text of ['Seller: Example Consulting. Contact hello@example.com.','Our company is Example SaaS','Change customer to Sample Agency','Increase SaaS licenses to 15','Generate a proposal for our company: Sample Agency'])assert.equal(requestedSample(text),undefined,text);
  await agent(s,input=>{assert.notEqual(input.toolChoice?.type,'tool');return 'What is your company contact email?';}).generate('Our company is Example SaaS',options);
  assert.equal((await s.run({action:'read'},'',options.memory.thread)).mode,undefined);
}));

test('actual Mastra tool execution rejects an invented price and preserves the generated scope',async()=>fixture(async s=>{
  const {runSampleConversation}=await import('./helpers/agent-conversation.js');
  const before=await runSampleConversation(s,'saas');
  let calls=0;
  const response=await agent(s,()=>++calls===1?{name:'proposalWorkspace',input:{operation:{action:'product',revision:before.revision,id:'editor-license',price:{value:'0',quote:'Increase licenses to 15'}}}}:'The catalog price is unchanged.').generate('Increase licenses to 15',{memory:{thread:'saas',resource:'test-owner'}});
  assert.match(JSON.stringify(response.steps.flatMap(step=>step.toolResults)),/unit price/);
  const after=await s.run({action:'read'},'','saas');
  assert.deepEqual(after.products,before.products);
  assert.equal(after.revision,before.revision);
  assert.equal(after.artifacts!.directory,before.artifacts!.directory);
}));
