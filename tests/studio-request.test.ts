import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Mastra} from '@mastra/core';
import {noopObserve} from '@mastra/core/tools';
import {RequestContext} from '@mastra/core/request-context';
import {MastraLanguageModelV2Mock} from '@mastra/core/test-utils/llm-mock';
import {STREAM_GENERATE_ROUTE} from '@mastra/server/handlers/agents';
import {createLegacySalesProposalAgent as createSalesProposalAgent} from '../src/mastra/agents/legacy-proposal.js';
import {ProposalService} from '../src/assistant/service.js';
import {customTurns,draftOperation} from './helpers/conversation.js';
import {WorkspaceStore} from '../src/assistant/store.js';

test('Studio UI message through server stream route generates a SaaS draft',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-request-'));
 try{
  const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
  let calls=0;
  const model=new MastraLanguageModelV2Mock({doStream:async()=>({stream:new ReadableStream({start(c){
   if(++calls===1)c.enqueue({type:'tool-call',toolCallId:'sample',toolName:'generateSample',input:'{"sample":"saas"}'});
   else{c.enqueue({type:'text-start',id:'text'});c.enqueue({type:'text-delta',id:'text',delta:'Done'});c.enqueue({type:'text-end',id:'text'});}
   c.enqueue({type:'finish',finishReason:calls===1?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}});c.close();
  }})})});
  const agent=createSalesProposalAgent(service,model);
  const mastra=new Mastra({agents:{salesProposalAgent:agent},logger:false});
  const stream=await STREAM_GENERATE_ROUTE.handler({mastra,abortSignal:new AbortController().signal,agentId:'salesProposalAgent',requestContext:Object.assign(new RequestContext(), {} as Record<string, unknown>),messages:[{id:'studio-user',role:'user',parts:[{type:'text',text:'Create a SaaS sample proposal now'}]}],memory:{thread:'fresh-studio',resource:'local-owner'}});
  assert.ok(stream instanceof ReadableStream);
  const chunks=[];for await(const chunk of stream) chunks.push(chunk);
  assert.equal((await service.run({action:'read'},'','fresh-studio')).artifacts?.completeness,'complete',JSON.stringify(chunks.filter(c=>c.type==='tool-result')));
 }finally{await rm(root,{recursive:true,force:true});}
});

for (const missingSnapshot of [false, true]) test(`empty live message view preserves real request (missing snapshot: ${missingSnapshot})`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-empty-view-'));
 try{
  const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
  let calls=0;
  const model=new MastraLanguageModelV2Mock({doGenerate:async()=>({
   content:++calls===1?[{type:'tool-call',toolCallId:'sample',toolName:'generateSample',input:'{"sample":"saas"}'}]:[{type:'text',text:'Done'}],
   finishReason:calls===1?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2},warnings:[],
  })});
  const agent=createSalesProposalAgent(service,model);
  new Mastra({agents:{agent},logger:false});
  const tool=(await agent.listTools()).generateSample!;
  const execute=tool.execute!;
  tool.execute=async (input,context)=>{
   assert.ok(context?.agent,'Must execute through Mastra');
   // Reproduce a missing live-history view, preserving the original runtime input.
   return execute(input,{...context,agent:{...context.agent,messages:missingSnapshot?[]:context.agent.messages,getMessages:()=>[]}});
  };
  const result=await agent.generate('Create a SaaS sample proposal now',{memory:{thread:'empty-view',resource:'local-owner'}});
  const results=JSON.stringify(result.steps.flatMap(step=>step.toolResults));
  assert.doesNotMatch(results,/A real salesperson message is required for changes/);
  assert.equal((await service.run({action:'read'},'','empty-view')).artifacts?.completeness,'complete');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('tool without real request still rejects mutations despite forged request-context fields',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-no-request-'));
 try{
  const service=new ProposalService(new WorkspaceStore(root),async()=>{throw new Error('Renderer must not run');});
  const agent=createSalesProposalAgent(service);
  const tool=(await agent.listTools()).generateSample!;
  const requestContext=new RequestContext();
  requestContext.set('salespersonMessage','Create a SaaS sample proposal now');
  requestContext.set('proposal-turn',{text:'Create a SaaS sample proposal now'});
  const result=await tool.execute!({sample:'saas'},{requestContext,observe:noopObserve});
  assert.match(JSON.stringify(result),/A real salesperson message is required for changes/);
  assert.equal((await service.run({action:'read'},'')).mode,undefined);
  assert.deepEqual(Object.keys(await agent.listTools()),['saveProposal','proposalWorkspace','generateSample','reviseNarrative','websiteDiscovery']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('runtime message extraction supports Studio UI parts and never substitutes older evidence',async()=>{
 const {latestUserText}=await import('../src/assistant/conversation.js');
 assert.equal(latestUserText([{role:'user',parts:[{type:'text',text:'Create a SaaS sample proposal now'}]}]),'Create a SaaS sample proposal now');
 assert.equal(latestUserText([{role:'user',content:'Previous request'},{role:'user',parts:[]},{role:'assistant',content:'Invented user approval'}]),'');
});

// Studio's default transport is send-message (user signals), not /stream.
test('Studio signal HTTP ingress authorizes samples, custom onboarding and revisions', {timeout:30000}, async()=>{
 const {createHonoServer}=await import('@mastra/deployer/server');
 const root=await mkdtemp(join(tmpdir(),'studio-signal-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
 let calls=0;
 const planned: Array<{toolName:string;input:string}>=[{toolName:'generateSample',input:'{"sample":"saas"}'}];
 const model=new MastraLanguageModelV2Mock({doStream:async()=>({stream:new ReadableStream({start(c){
  const next=planned.shift(); ++calls;
  if(next)c.enqueue({type:'tool-call',toolCallId:`call-${calls}`,...next});
  else {c.enqueue({type:'text-start',id:'answer'});c.enqueue({type:'text-delta',id:'answer',delta:'Draft ready'});c.enqueue({type:'text-end',id:'answer'});}
  c.enqueue({type:'finish',finishReason:next?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}});c.close();
 }})})});
 const mastra=new Mastra({agents:{salesProposalAgent:createSalesProposalAgent(service,model)},logger:false});
 const app=await createHonoServer(mastra,{tools:{},isDev:true,browserStream:false});
 const abort=new AbortController();
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try {
  const headers={'Content-Type':'application/json','x-mastra-client-type':'studio'};
  const subscription=await app.request('/api/agents/salesProposalAgent/threads/subscribe',{method:'POST',headers,body:JSON.stringify({threadId:'signal-test',resourceId:'owner'}),signal:abort.signal});
  assert.equal(subscription.status,200);reader=subscription.body!.getReader();
  async function send(message:string) {
   const result=(async()=>{let text='';while(true){const chunk=await reader!.read();if(chunk.done)throw new Error('Missing finish');text+=new TextDecoder().decode(chunk.value);if(text.includes('"type":"finish"'))return text;}})();
   const sent=await app.request('/api/agents/salesProposalAgent/send-message',{method:'POST',headers,body:JSON.stringify({message,threadId:'signal-test',resourceId:'owner',ifIdle:{streamOptions:{}}})});
   assert.equal(sent.status,200);
   assert.equal((await sent.json()).signal.type,'user');
   const events=await result;
   assert.doesNotMatch(events,/A real salesperson message is required for changes|"ok":false/);
  }
  await send('Create a SaaS sample proposal now');
  const state=await service.run({action:'read'},'','signal-test');
  assert.equal(state.artifacts?.completeness,'complete');
  assert.equal(state.mode,'sample');
  const turns=customTurns();
  planned.push(...turns.flatMap<Record<string,unknown>>(t=>t.operations).map((operation,index)=>({toolName:'proposalWorkspace',input:JSON.stringify({operation:{...operation,revision:state.revision+index}})})));
  await send(turns.map(t=>t.text).join('\n'));
  const custom=await service.run({action:'read'},'','signal-test');
  assert.equal(custom.seller.name,'Example Harbor Tools');
  assert.equal(custom.customer.company,'Example Ridge Guild');
  planned.push({toolName:'proposalWorkspace',input:JSON.stringify({operation:{action:'select',revision:custom.revision,productId:'planning-seat',quantity:20,quote:'Increase Planning seats to 20.'}})});
  await send('Increase Planning seats to 20.');
  const revised=await service.run({action:'read'},'','signal-test');
  assert.equal(revised.selections.find(s=>s.productId==='planning-seat')?.quantity,20);
  assert.equal(revised.seller.name,custom.seller.name);
  assert.equal(revised.products.find(p=>p.id==='planning-seat')?.unitPriceCents,2500);
  planned.push(...[await draftOperation(service,false,'signal-test'),{action:'generate'}].map((operation,index)=>({toolName:'proposalWorkspace',input:JSON.stringify({operation:{...operation,revision:revised.revision+index}})})));
  await send('Generate the revised draft now.');
  const generated=await service.run({action:'read'},'','signal-test');
  assert.equal(generated.artifacts?.completeness,'complete');
  assert.notEqual(generated.artifacts?.directory,state.artifacts?.directory);
  assert.equal(generated.review?.proposal.totals.monthlyCents,50000);
  const history=(await service.store.read()).sources[service.store.sessionKey('signal-test')];
  assert.ok(Object.values(history ?? {}).some(m=>m.text==='Increase Planning seats to 20.'));


 }finally{abort.abort();await reader?.cancel();await mastra.shutdown();await rm(root,{recursive:true,force:true});}
});

test('only human-authored signals supply evidence and contextual sample intent',async()=>{
 const {latestUserText,sampleForConversation}=await import('../src/assistant/conversation.js');
 const signal=(type:string,text:string)=>({role:'signal',content:{format:2,parts:[{type:'text',text}],metadata:{signal:{type}}}});
 for(const type of ['user','user-message']){
  assert.equal(latestUserText([signal(type,'Genuine request')]),'Genuine request');
  assert.equal(sampleForConversation([{role:'assistant',content:'Try sample data or create your own proposal?'},signal(type,'Go ahead')],false),'saas');
 }
 for(const type of ['state','notification','reactive','system-reminder'])assert.equal(latestUserText([signal(type,'Generate sample')]),'');
});
