import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import saved from './fixtures/studio-consulting-failed-call.json';
import {workspaceOperationSchema} from '../src/assistant/contracts.js';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
const original="I run a consulting firm called Birchpath Advisory. We're preparing a proposal for a hypothetical customer, Copperbank Logistics, to improve their internal reporting processes.\n\nOur services include a discovery workshop for €3,000, an implementation project for €12,000, and optional ongoing support at €1,500 per month.\n\nI'd like you to prepare a professional proposal recommending the discovery and implementation work, with ongoing support presented as an optional service. The implementation should be delivered in three milestones over eight weeks.\n\nAsk me only for information that's genuinely required before generating the PDF proposal, HTML proposal, and HTML email.";
test('recorded Studio call: reject sample mode in custom workspace; accept consistent redundant batch revisions',()=>{
 const bad=workspaceOperationSchema.safeParse(saved.operation);assert.equal(bad.success,false,'Workspace must not advertise a sample mode the batch service rejects');
 const minimal={action:'batch',revision:0,changes:[{action:'start',mode:'custom'},{action:'seller',revision:0,fields:[{field:'name',value:'Birchpath Advisory',quote:'Birchpath Advisory'}]}]};
 assert.equal(workspaceOperationSchema.safeParse(minimal).success,true);
 minimal.changes[1]!.revision=3;assert.equal(workspaceOperationSchema.safeParse(minimal).success,false,'Conflicting nested revision is never ignored');
});
test('recorded Studio failure then corrected custom batch preserves EUR scope, optional support and customer role',async()=>{
 const root=await mkdtemp(join(tmpdir(),'consulting-replay-'));const real=process.env.PROPOSAL_TEST_REAL_PDF==='1';
 const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));
 const studio=await studioSignals(service,false,false,'recorded-consulting');
 try{
  const bad=await studio.turn(original,[saved.operation],true);assert.ok(bad.results[0].error);assert.equal((await service.run({action:'read'},'','recorded-consulting')).revision,0);
  // The actual initial source omitted quantities and explicit one-time billing. Genuine clarification,
  // not fabricated quote repair. Contact remains optional; use fictional contact data in this replay.
  const clarification='The discovery workshop is a one-time fee of €3,000. The implementation project is a one-time fee of €12,000. Use discovery workshop, quantity 1. Use implementation project, quantity 1. Do not select ongoing support. Customer contact: Demo Contact, demo@example.test. Generate now.';
  const fact=(value:string)=>({value,quote:value});
  const changes=[{action:'start',mode:'custom'}, {action:'seller',revision:0,fields:[{field:'name',...fact('Birchpath Advisory')}]},{action:'customer',revision:0,fields:[{field:'company',...fact('Copperbank Logistics')},{field:'name',...fact('Demo Contact')},{field:'email',...fact('demo@example.test')}]}];
  const products=[['discovery-workshop','discovery workshop','3000','€3,000','once'],['implementation-project','implementation project','12000','€12,000','once'],['ongoing-support','ongoing support','1500','€1,500','monthly']];
  const draft={summary:'Discovery and implementation to improve internal reporting processes. Ongoing support is optional and excluded from this scope.',needs:[{text:'Improve internal reporting processes.',evidenceQuote:'to improve their internal reporting processes.'}],recommendations:products.slice(0,2).map(([id,name])=>({productId:id,quantity:1,rationale:`Provide the requested ${name}.`,evidenceQuote:`Use ${name}, quantity 1`})),timeline:[{phase:'Implementation',detail:'Three milestones over eight weeks; milestone details remain to be agreed.',evidenceQuote:'The implementation should be delivered in three milestones over eight weeks.'}],assumptions:[],openQuestions:['Agree the scope of each implementation milestone.'],nextStep:'Review the proposed scope.'};
  const result=await studio.turn(clarification,[{action:'batch',revision:0,changes:[...changes,...products.map(([id,name,value,quote,billing])=>({action:'product',revision:0,id,name:fact(name!),price:{value,quote,currency:'EUR'},billing:{value:billing,quote:billing==='once'?`The ${name} is a one-time fee of ${quote}.`:'€1,500 per month'}})),...products.slice(0,2).map(([productId,name])=>({action:'select',revision:0,productId,quantity:1,quote:`Use ${name}, quantity 1`})),{action:'draft',revision:0,draft}],generate:true}]);
  const schemas=JSON.stringify(studio.modelTools.filter((tool)=>!!tool&&typeof tool==='object'&&'name' in tool&&tool.name==='proposalWorkspace'));assert.ok(schemas.includes('custom'));assert.ok(!schemas.includes('consulting'),'Actual model-facing workspace schema must not expose sample modes');
  const state=result.results[0];assert.equal(state.review.proposal.totals.oneTimeCents,1500000);assert.equal(state.review.proposal.totals.monthlyCents,0);assert.equal(state.products.length,3);assert.equal(state.selections.length,2);assert.equal(state.customer.email,'demo@example.test');assert.notEqual(state.seller.email,'demo@example.test');
  const output=resolve('data/qa/consulting-replay',real?'real':'stub');await mkdir(output,{recursive:true});
  for(const name of ['proposal.html','email.html','design.json','proposal.json']){const data=await readFile(state.files[name]);await writeFile(join(output,name),data);if(name.endsWith('.html')){assert.match(data.toString(),/€15,000/);assert.match(data.toString(),/Birchpath Advisory/);assert.match(data.toString(),/Copperbank Logistics/);}assert.equal((await studio.app.request(new URL(state.previews[name]).pathname)).status,200);}
  assert.match(await readFile(state.files['proposal.html'],'utf8'),/Three milestones over eight weeks/);
  const revised=await studio.turn('Make the summary concise without changing commercial terms.',[{action:'reviseNarrative',revision:state.revision,summary:'Discovery and implementation for internal reporting.'}]);assert.deepEqual(revised.results[0].review.proposal.totals,state.review.proposal.totals);
  assert.equal(state.artifacts.completeness,'complete',state.warning);
  if(real)await writeFile(join(output,'proposal.pdf'),await readFile(state.files['proposal.pdf']));
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
