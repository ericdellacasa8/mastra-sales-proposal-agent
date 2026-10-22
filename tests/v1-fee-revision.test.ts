import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import type {ProposalInput} from '../src/assistant/proposal-input.js';
test('captured MapleCloud/Ironbridge review: omitted fee, sparse confirmation, monetary description',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fee-replay-'));let service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));
 let id=0;
 const turn=async(text:string,input:ProposalInput)=>{const identity={messageId:`turn-${++id}`,resource:'owner'};await service.capture(identity,text,'chevron');return service.submitInput(input,text,'chevron',identity,(await service.run({action:'read'},'','chevron')).revision);};
 try{
  await turn('I work on the sales team at MapleCloud and I am looking to put together a sales proposal for Ironbridge.',{intent:'proposal',seller:'MapleCloud',customer:'Ironbridge'});
  await turn("1000 Orbin licenses for all the employees at Ironbridge's HQ",{intent:'conversation',offerings:[{name:'Orbin licenses',quantity:1000}]});
  await turn('$10/per month per Orbine license',{intent:'conversation',offerings:[{name:'Orbin licenses',unitPrice:10,currency:'USD',billing:'monthly'}]});
  await turn('yes, 12 months',{intent:'conversation',termMonths:12});
  const goal='boost operational efficiency at the HQ; render the workforce at the office more AI savvy; implements AI agents where appropriate across internal processes';
  await turn(goal,{intent:'conversation',customerGoal:goal});
  // Actual failed call repeated only the existing subscription, omitting the requested fee.
  const review=await turn('apply one time fees of $100',{intent:'revision',offerings:[{name:'Orbin licenses',quantity:1000,unitPrice:10,currency:'USD',billing:'monthly'}],termMonths:12,customerGoal:goal});
  assert.match(review.text,/one-time fees: \$100/);assert.match(review.text,/120,100/);
  assert.equal((await service.run({action:'read'},'','chevron')).artifacts,undefined);
  service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));
  // Recorded continuation supplied a monetary description and empty optional fields.
  const complete=await turn('confirm',{intent:'revision',offerings:[{name:'One-time fee',description:'One-time fee of $100',quantity:1,unitPrice:100,currency:'USD',billing:'once'}],termMonths:undefined,noFixedCommitment:undefined,customerGoal:undefined,summary:undefined,scope:undefined});
  assert.equal(complete.status,'complete',complete.text);
  const saved=await service.run({action:'read'},'','chevron');const p=saved.review!.proposal;
  assert.equal(p.totals.monthlyCents,1000000);assert.equal(p.totals.oneTimeCents,10000);assert.equal(p.totals.annualizedRecurringCents,12000000);assert.equal(p.totals.committedCents,12010000);assert.equal(p.totals.firstMonthCents,1010000);
  assert.match(saved.draft!.summary,/12 months/);assert.match(saved.draft!.summary,/operational efficiency/);
  assert.equal(saved.products[0]!.name,'Orbin licenses');
  for(const r of saved.draft!.recommendations)assert.doesNotMatch(r.rationale,/\$100/);
  for(const name of ['proposal.pdf','proposal.html','email.html'])assert.ok((await readFile(saved.files![name]!)).length);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('fee recovery does not overwrite an existing named charge or accept conflicting extraction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'fee-conflict-'));const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTUB'));
 let id=0;
 const turn=async(text:string,input:ProposalInput,thread='conflict')=>{const identity={messageId:`turn-${++id}`,resource:'owner'};await service.capture(identity,text,thread);return service.submitInput(input,text,thread,identity,0);};
 try{
  await turn('Help put together an estimate.',{intent:'proposal',seller:'Cedar',customer:'Fern',offerings:[{name:'Audit',quantity:1,unitPrice:800,currency:'USD',billing:'once'}]});
  await assert.rejects(turn('apply one time fees of $100',{intent:'revision'}),/Which one-time charge/);
  await assert.rejects(turn('add one-time fee of $100',{intent:'revision',offerings:[{name:'Fee',quantity:1,unitPrice:200,currency:'USD',billing:'once'}]},'new'),/conflicts/);
  const pending=(await service.store.read()).v1Turns[service.store.sessionKey('conflict')]!.candidate;
  assert.equal((pending.offerings as Array<{unitPrice:number}>)[0]!.unitPrice,800);
 }finally{await rm(root,{recursive:true,force:true});}
});
