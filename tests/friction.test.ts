import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';

import {acmeMessage,acmeChanges} from './helpers/acme.js';
test('Acme facts leave only onboarding quantity to clarify, not optional fields',async()=>{
 const root=await mkdtemp(join(tmpdir(),'acme-friction-'));
 try{
 const service=new ProposalService(new WorkspaceStore(root));
 for(const [revision,operation] of acmeChanges.entries()) await service.run({...operation,revision},acmeMessage);
 const state=await service.run({action:'read'},'');
 assert.doesNotMatch(state.nextQuestion,/email|contact|description|terms|requirements/i);
 assert.match(state.nextQuestion,/onboarding.*quantity|quantity.*onboarding/i);
 }finally{await rm(root,{recursive:true,force:true});}
});

import {readFile} from 'node:fs/promises';
import {studioSignals} from './helpers/studio-signals.js';
import {acmeDraft} from './helpers/acme.js';

test('Acme through Studio signals: two batch calls, one essential question, previews and revisions', {timeout:30000},async t=>{
 const root=await mkdtemp(join(tmpdir(),'acme-signal-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
 const studio=await studioSignals(service);
 try{
  const first=await studio.turn(acmeMessage,[{action:'batch',revision:0,changes:acmeChanges,generate:false}]);
  let state=await service.run({action:'read'},'','acme');
  assert.match(state.nextQuestion,/quantity of onboarding/);
  assert.equal(state.seller.name,'Acme Projects');assert.equal(state.customer.company,'Brightside Technologies');
  assert.match(state.notes,/coordinating projects across multiple teams/);
  assert.equal(state.selections[0]?.quantity,20);
  const second=await studio.turn('1 onboarding package.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'onboarding',quantity:1,quote:'1 onboarding package.'},{action:'draft',draft:acmeDraft}],generate:true}]);
  state=await service.run({action:'read'},'','acme');
  assert.equal(state.artifacts?.completeness,'complete');
  assert.deepEqual(state.review?.proposal.totals,{monthlyCents:50000,oneTimeCents:50000,firstMonthCents:100000,firstYearCents:650000});
  assert.equal(state.seller.email,undefined);assert.equal(state.customer.email,undefined);assert.deepEqual(state.terms,[]);
  for(const file of ['email.html','proposal.html','design.json','proposal.json','proposal.pdf']){
   const link=state.previews![file]!;
   const response=await studio.app.request(new URL(link).pathname);
   assert.equal(response.status,200,link);
   assert.equal(response.headers.get('cache-control'),'no-store');
   const content=await response.text();
   if(file!=='proposal.pdf'){
    assert.match(content,/Acme Projects/);assert.match(content,/Brightside Technologies/);
    assert.doesNotMatch(content,/mailto:undefined|Prepared for undefined/);
   }
  }
  const oldLinks=state.previews!;
  const third=await studio.turn('Increase licenses to 25.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'licenses',quantity:25,quote:'Increase licenses to 25.'},{action:'draft',draft:{...acmeDraft,recommendations:acmeDraft.recommendations.map(r=>r.productId==='licenses'?{...r,quantity:25}:r)}}],generate:true}]);
  state=await service.run({action:'read'},'','acme');
  assert.equal(state.review?.proposal.totals.monthlyCents,62500);
  assert.equal((await studio.app.request(new URL(oldLinks['email.html']!).pathname)).status,404,'Stale artifacts are not presented as current');
  for(const file of ['email.html','proposal.html','design.json'])assert.match(await readFile(join(state.artifacts!.directory,file),'utf8'),/\$625/);
  assert.deepEqual([first.toolCalls,second.toolCalls,third.toolCalls],[1,1,1]);
  t.diagnostic(JSON.stringify({scenario:'Acme',provider:'scripted',pdf:'storage stub',initialCalls:first.toolCalls+second.toolCalls,clarifications:1,revisionCalls:third.toolCalls,latencyMs:[first.latencyMs,second.latencyMs,third.latencyMs]}));
  assert.equal((await studio.app.request('/proposal-previews/bad/id/workspace.json')).status,404);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('batch validation rolls back all changes, preserves authority and flags unusual quantities',async()=>{
 const root=await mkdtemp(join(tmpdir(),'acme-atomic-'));const service=new ProposalService(new WorkspaceStore(root));
 try{
  await assert.rejects(service.run({action:'batch',revision:0,changes:[...acmeChanges,{action:'product',id:'licenses',price:{value:'99',quote:'$25'}}]},acmeMessage),/unit price/);
  assert.equal((await service.run({action:'read'},'')).revision,0);
  await service.run({action:'batch',revision:0,changes:acmeChanges},acmeMessage);
  let state=await service.run({action:'read'},'');
  await assert.rejects(service.run({action:'batch',revision:0,changes:[{action:'notes',text:'new'}]},'new'),/State changed/);
  await assert.rejects(service.run({action:'batch',revision:state.revision,changes:[{action:'select',productId:'onboarding',quantity:1,quote:'onboarding support'}]},'onboarding support'),/explicit quantity/);
  state=await service.run({action:'select',revision:state.revision,productId:'onboarding',quantity:15,quote:'15 onboarding packages'},'15 onboarding packages');
  assert.match(state.quantityWarnings.join(' '),/15 units of onboarding/);
  assert.equal(state.products.find(p=>p.id==='onboarding')?.unitPriceCents,50000);
  await assert.rejects(service.run({action:'batch',revision:state.revision,changes:[{action:'send'}]},'Send it'),/Invalid discriminator value/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('unusual one-time quantity stays explicit in pricing and warning clears after correction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'acme-quantity-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
 try {
  await service.run({action:'batch',revision:0,changes:acmeChanges},acmeMessage);
  let state=await service.run({action:'read'},'');
  state=await service.run({action:'batch',revision:state.revision,changes:[{action:'select',productId:'onboarding',quantity:15,quote:'15 onboarding packages'},{action:'draft',draft:{...acmeDraft,recommendations:acmeDraft.recommendations.map(r=>r.productId==='onboarding'?{...r,quantity:15}:r)}}],generate:true},'15 onboarding packages');
  assert.equal(state.review?.proposal.totals.oneTimeCents,750000);
  assert.match(state.review!.proposal.content.assumptions.join(' '),/Quantity check/);
  const draft=state.review!.proposal.content;
  state=await service.run({action:'batch',revision:state.revision,changes:[{action:'select',productId:'onboarding',quantity:1,quote:'Use 1 onboarding package'},{action:'draft',draft:{...draft,recommendations:draft.recommendations.map(r=>r.productId==='onboarding'?{...r,quantity:1}:r)}}],generate:true},'Use 1 onboarding package');
  assert.equal(state.review?.proposal.totals.oneTimeCents,50000);
  assert.deepEqual(state.quantityWarnings,[]);
  assert.doesNotMatch(state.review!.proposal.content.assumptions.join(' '),/Quantity check/);
 }finally{await rm(root,{recursive:true,force:true});}
});
