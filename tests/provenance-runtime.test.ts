import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
import {flowMessage,flowChanges,flowDraft} from './helpers/flowsync.js';
test('Studio signal FlowSync: observed paraphrased notes cannot poison the batch or become evidence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'flow-provenance-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE STUB'));
 const studio=await studioSignals(service);
 try {
  const created=await studio.turn(flowMessage,[{action:'batch',revision:0,changes:[...flowChanges,{action:'draft',draft:flowDraft}],generate:true}]);
  for(const name of ['PDF proposal','HTML proposal','HTML email'])assert.ok(created.results.at(-1).previewMarkdown.includes(`[${name}](http`));
  const state=await service.run({action:'read'},'','acme');
  assert.equal(state.review?.proposal.totals.monthlyCents,206000);
  assert.equal(state.products.find(p=>p.id==='standard')?.unitPriceCents,2900);
  assert.equal(state.products.find(p=>p.id==='enterprise')?.unitPriceCents,5900);
  assert.equal(state.selections.find(p=>p.productId==='standard')?.quantity,10);
  assert.equal(state.selections.find(p=>p.productId==='enterprise')?.quantity,30);
  assert.equal(state.review?.proposal.totals.firstYearCents,2472000);
  assert.ok(state.notes.includes('Their main priorities are'));
  assert.ok(!state.notes.includes('Request:'));
  for(const file of ['email.html','proposal.html','design.json']) {
   const text=await readFile(join(state.artifacts!.directory,file),'utf8');
   for(const expected of ['FlowSync','Northstar Logistics','$2,060'])assert.ok(text.includes(expected));
  }
  assert.ok((await readFile(join(state.artifacts!.directory,'proposal.pdf'))).length);
 }finally {await studio.close();await rm(root,{recursive:true,force:true});}
});

test('server resolves source identity; fabricated quotations and missing thread facts still fail closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'flow-source-'));
 const service=new ProposalService(new WorkspaceStore(root));
 const studio=await studioSignals(service);
 try {
  const changes=flowChanges.map(change=>change.action==='seller' && 'fields' in change?{...change,fields:change.fields!.map(f=>({...f,sourceMessageId:'model-invented-id'}))}:change);
  await studio.turn(flowMessage,[{action:'batch',revision:0,changes}]);
  let state=await service.run({action:'read'},'','acme');
  assert.notEqual(state.provenance['seller.name']?.sourceMessageId,'model-invented-id');
  const failures=await studio.turn('Generate using the supplied facts.',[{action:'seller',revision:state.revision,fields:[{field:'name',value:'Fabricated',quote:'I run Fabricated',sourceMessageId:state.provenance['seller.name']?.sourceMessageId}]}],true);
  assert.equal(failures.results[0].ok,false);
  assert.match(failures.results[0].error,/Field: seller.name/);
  assert.equal((await service.run({action:'read'},'','acme')).seller.name,'FlowSync');
  await studio.turn('Use the discovery information already provided.',[{action:'notes',revision:state.revision,text:'Invented guaranteed savings'}]);
  state=await service.run({action:'read'},'','acme');
  assert.ok(state.notes.includes('Their main priorities are'));
  assert.ok(!state.notes.includes('Invented guaranteed savings'),'Model prose is never promoted to captured notes');

  const separate=await studioSignals(service,false,false,'incomplete');
  try {
   const incomplete=flowMessage.slice(flowMessage.indexOf('FlowSync Enterprise:'));
   const result=await separate.turn(incomplete,[{action:'batch',revision:0,changes:flowChanges}],true);
   assert.equal(result.results[0].ok,false,'Cannot borrow Standard pricing from another thread');
   state=await service.run({action:'read'},'','incomplete');
   assert.equal(state.artifacts,undefined);
   assert.equal(state.products.length,0,'Failed batch remains atomic');
  } finally {await separate.close();}
 }finally {await studio.close();await rm(root,{recursive:true,force:true});}
});

test('FlowSync copy revision after 45-license revision preserves authority and regenerates artifacts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'flow-copy-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE STUB'));
 const studio=await studioSignals(service);
 try {
  const created=await studio.turn(flowMessage,[{action:'batch',revision:0,changes:[...flowChanges,{action:'draft',draft:flowDraft}],generate:true}]);
  for(const name of ['PDF proposal','HTML proposal','HTML email'])assert.ok(created.results.at(-1).previewMarkdown.includes(`[${name}](http`));
  let state=await service.run({action:'read'},'','acme');
  await studio.turn('Increase Enterprise licenses to 45.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'enterprise',quantity:45,quote:'Increase Enterprise licenses to 45.'},{action:'draft',draft:{...flowDraft,recommendations:flowDraft.recommendations.map(r=>r.productId==='enterprise'?{...r,quantity:45}:r)}}],generate:true}]);
  const before=await service.run({action:'read'},'','acme');
  const summary='FlowSync for Northstar Logistics: focus on reducing manual processes, improving operational visibility, and coordinating workflows between teams.';
  const edit={action:'reviseNarrative',revision:before.revision,summary,benefits:[{productId:'enterprise',rationale:'Enterprise licenses support the requested cross-team workflow scope.'},{productId:'standard',rationale:'Standard licenses address the requested operational workflow needs.'}]};
  // The old full-replacement shape is rejected; the model retries valid prose within the same turn.
  const result=await studio.turn('Rewrite the executive summary and benefits around our three priorities. Do not change products, quantities or pricing.',[{...edit,summary:'x'.repeat(1452)},edit],true);
  assert.ok(result.results.some(r=>r.ok===true));
  for(const name of ['PDF proposal','HTML proposal','HTML email'])assert.ok(result.results.at(-1).previewMarkdown.includes(`[${name}](http`));
  assert.match(JSON.stringify(result.results[0]),/600/,'Dedicated tool exposes the actual summary limit for safe retry');
  state=await service.run({action:'read'},'','acme');
  for(const field of ['seller','customer','products','selections','notes','terms','provenance'] as const)assert.deepEqual(state[field],before[field]);
  assert.deepEqual(state.draft?.needs,before.draft?.needs);
  assert.equal(state.draft?.summary,summary);
  assert.equal(state.review?.proposal.totals.monthlyCents,294500);
  assert.equal(state.review?.proposal.totals.firstYearCents,3534000);
  assert.notEqual(state.artifacts!.directory,before.artifacts!.directory);
  for(const file of ['email.html','proposal.html','design.json'])assert.ok((await readFile(join(state.artifacts!.directory,file),'utf8')).includes(summary));
  for(const file of ['email.html','proposal.html','proposal.pdf'])assert.equal((await studio.app.request(new URL(state.previews![file]!).pathname)).status,200);
  await assert.rejects(service.run({...edit,revision:state.revision,summary:'Guaranteed results.'},'Revise summary','acme'),/Unsupported assurance/);
  assert.equal((await service.run({action:'read'},'','acme')).draft?.summary,summary);
 }finally {await studio.close();await rm(root,{recursive:true,force:true});}
});
