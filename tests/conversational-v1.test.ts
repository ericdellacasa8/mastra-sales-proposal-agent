import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
const real=process.env.PROPOSAL_TEST_REAL_PDF==='1',live=process.env.PROPOSAL_TEST_LIVE==='1';
const pdf=real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB');
const consulting={intent:'proposal',seller:'Birchpath Advisory',customer:'Copperbank Logistics',offerings:[{name:'Discovery',quantity:1,unitPrice:3000,currency:'EUR',billing:'once'},{name:'Implementation',quantity:1,unitPrice:12000,currency:'EUR',billing:'once'},{name:'Support',unitPrice:1500,currency:'EUR',billing:'monthly',included:false}],scope:'Three milestones over eight weeks.'};
const saas={intent:'proposal',seller:'Northstar Software',customer:'Copperbank Logistics',termMonths:12,offerings:[{name:'Pro',quantity:100,unitPrice:75,currency:'EUR',billing:'monthly'},{name:'Onboarding',quantity:1,unitPrice:2500,currency:'EUR',billing:'once'}]};
for(const kind of ['consulting','saas'] as const)test(`V1 ${kind} creation and revisions`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'v1-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const studio=await studioSignals(service,live,false,kind,undefined,'v1');
 try{
  const text=kind==='consulting'?'I run Birchpath Advisory. Prepare a proposal for Copperbank Logistics: one Discovery at €3,000 and one Implementation at €12,000, both one-time fees. Implementation takes eight weeks across three milestones. Include optional Support at €1,500/month excluded from committed totals. Generate the proposal.':'Northstar Software proposes 100 Pro seats at €75 per seat per month for 12 months plus one Onboarding at €2,500 one-time for Copperbank Logistics. Generate the proposal.';
  const result=await studio.turn(text,[{candidate:kind==='consulting'?consulting:saas}],true);
  let state=await service.run({action:'read'},'',kind);
  if(real&&state.files){const dir=resolve('data/qa/v1-conversational',kind);await mkdir(dir,{recursive:true});for(const [name,file] of Object.entries(state.files))await copyFile(file,join(dir,name));}
  assert.equal(result.results[0]?.status,'complete',result.results[0]?.text);
  assert.equal(state.review!.proposal.totals.firstYearCents,kind==='consulting'?1500000:9250000);
  if(kind==='saas'){assert.equal(state.review!.proposal.totals.committedCents,9250000);for(const file of ['proposal.html','email.html'])assert.match(await readFile(state.files![file]!,'utf8'),/Committed contract total/);}
  for(const file of ['proposal.pdf','proposal.html','email.html'])assert.ok((await readFile(state.files![file]!)).length);
  if(kind==='saas'){
   await studio.turn('Change Pro to 150 seats and regenerate.',[{candidate:{intent:'revision',offerings:[{name:'Pro',quantity:150}]}}],true);
   state=await service.run({action:'read'},'',kind);assert.equal(state.review!.proposal.totals.monthlyCents,1125000);assert.equal(state.review!.proposal.totals.firstYearCents,13750000);assert.equal(state.review!.proposal.totals.committedCents,13750000);
   await studio.turn('Change the Pro unit price to EUR 80 per month and regenerate.',[{candidate:{intent:'revision',offerings:[{name:'Pro',unitPrice:80}]}}],true);
   state=await service.run({action:'read'},'',kind);assert.equal(state.review!.proposal.totals.monthlyCents,1200000);
  }
  const totals=state.review!.proposal.totals;
  await studio.turn('Shorten the executive summary without changing commercial terms.',[{candidate:{intent:'revision',summary:'A concise proposal for the requested scope.'}}],true);
  assert.deepEqual((await service.run({action:'read'},'',kind)).review!.proposal.totals,totals);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('V1 missing price survives restart; research and legacy evidence cannot interfere',async()=>{
 const root=await mkdtemp(join(tmpdir(),'v1-pending-'));let service=new ProposalService(new WorkspaceStore(root),pdf);let studio=await studioSignals(service,false,false,'pending',undefined,'v1');
 try{
  const a=await studio.turn('Cedar offers one Audit, a one-time service in EUR, to Fern. Create a proposal.',[{candidate:{intent:'proposal',seller:'Cedar',customer:'Fern',offerings:[{name:'Audit',quantity:1,currency:'EUR',billing:'once'}]}}]);assert.match(a.results[0].text,/unit price/);
  await studio.close();service=new ProposalService(new WorkspaceStore(root),pdf);studio=await studioSignals(service,false,false,'pending',undefined,'v1');
  const b=await studio.turn('The unit price is EUR 800.',[{candidate:{intent:'conversation',offerings:[{name:'Audit',unitPrice:800}]}}],true);assert.equal(b.results[0].status,'clarification_required');
  const review=await studio.turn('Improve audit readiness.',[{candidate:{intent:'conversation',customerGoal:'Improve audit readiness.'}}]);assert.equal(review.results[0].status,'confirmation_required');
  const confirmed=await studio.turn('Confirm.',[{candidate:{intent:'conversation'}}],true);assert.equal(confirmed.results[0].status,'complete');assert.match((await service.run({action:'read'},'','pending')).draft!.summary,/Improve audit readiness/);
  const other=await studioSignals(service,false,false,'research',async()=>{throw new Error('Fetching is forbidden');},'v1');try{const r=await other.turn('Research https://example.com only.',[{candidate:{intent:'research'}}]);assert.equal(r.results[0].status,'research');assert.equal((await service.run({action:'read'},'','research')).artifacts,undefined);}finally{await other.close();}
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('V1 PDF failure is incomplete, retry preserves commercial input; stale writes reject',async()=>{
 const root=await mkdtemp(join(tmpdir(),'v1-retry-'));let calls=0;const service=new ProposalService(new WorkspaceStore(root),async()=>{if(++calls===1)throw new Error('PDF unavailable');return Buffer.from('%PDF-1.7\nSTUB');});const studio=await studioSignals(service,false,false,'retry',undefined,'v1');
 try{
  assert.deepEqual(Object.keys(await studio.agent.listTools()),['submitCandidate']);
  const a=await studio.turn('Create the supplied consulting proposal.',[{candidate:consulting}],true);assert.equal(a.results[0].status,'rendering_failed');assert.doesNotMatch(a.results[0].text,/\[PDF proposal\]/);
  const before=await service.run({action:'read'},'','retry');const b=await studio.turn('Regenerate the proposal.',[{candidate:{intent:'proposal'}}],true);assert.equal(b.results[0].status,'complete');const after=await service.run({action:'read'},'','retry');assert.deepEqual(after.products,before.products);
  await assert.rejects(service.submitInput({intent:'revision',summary:'Changed'},'Change summary','retry',{messageId:'stale',resource:'local-owner'},0),/concurrently/);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('progressive term, optional discovery, restart review, correction and confirmation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'v1-review-'));let service=new ProposalService(new WorkspaceStore(root),pdf);let studio=await studioSignals(service,false,false,'review',undefined,'v1');
 try{
  await studio.turn('Prepare a proposal from Silverquill to Rivergate.',[{candidate:{intent:'proposal',seller:'Silverquill',customer:'Rivergate'}}]);
  await studio.turn('QuillChat Enterprise.',[{candidate:{intent:'conversation',offerings:[{name:'QuillChat Enterprise'}]}}]);
  await studio.turn('100 seats.',[{candidate:{intent:'conversation',offerings:[{name:'QuillChat Enterprise',quantity:100}]}}]);
  const term=await studio.turn('Use illustrative EUR 105 per seat per month.',[{candidate:{intent:'conversation',offerings:[{name:'QuillChat Enterprise',unitPrice:105,currency:'EUR',billing:'monthly'}]}}]);assert.match(term.results[0].text,/fixed contract term/);assert.equal((await service.run({action:'read'},'','review')).artifacts,undefined);
  const goal=await studio.turn('12 months.',[{candidate:{intent:'conversation',termMonths:12}}]);assert.match(goal.results[0].text,/main outcome.*skip/);
  const review=await studio.turn('Skip.',[{candidate:{intent:'conversation'}}]);assert.equal(review.results[0].status,'confirmation_required');assert.match(review.results[0].text,/126,000/);assert.equal((await service.run({action:'read'},'','review')).artifacts,undefined);
  await studio.close();service=new ProposalService(new WorkspaceStore(root),pdf);studio=await studioSignals(service,false,false,'review',undefined,'v1');
  const correction=await studio.turn('Change to 150 seats.',[{candidate:{intent:'revision',offerings:[{name:'QuillChat Enterprise',quantity:150}]}}]);assert.equal(correction.results[0].status,'confirmation_required');assert.match(correction.results[0].text,/189,000/);assert.doesNotMatch(correction.results[0].text,/main outcome/);assert.equal((await service.run({action:'read'},'','review')).artifacts,undefined);
  const done=await studio.turn('Confirm.',[{candidate:{intent:'conversation'}}],true);assert.equal(done.results[0].status,'complete',done.results[0].text);const state=await service.run({action:'read'},'','review');assert.equal(state.review!.proposal.totals.committedCents,18900000);assert.doesNotMatch(state.draft!.summary,/Customer goal/);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('no fixed commitment labels in both HTML formats; fixed mixed totals remain deterministic',async()=>{
 const root=await mkdtemp(join(tmpdir(),'v1-no-term-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const studio=await studioSignals(service,false,false,'no-term',undefined,'v1');
 try{
  const inferred=await studio.turn('Cedar to Fern: 100 Pro at EUR105 per month, annualized run-rate EUR126,000. Generate.',[{candidate:{intent:'proposal',seller:'Cedar',customer:'Fern',termMonths:12,offerings:[{name:'Pro',quantity:100,unitPrice:105,currency:'EUR',billing:'monthly'}]}}]);assert.match(inferred.results[0].text,/fixed contract term/);assert.equal((await service.run({action:'read'},'','no-term')).artifacts,undefined);
  const done=await studio.turn('Generate immediately: Cedar to Fern, 100 Pro at EUR 105 per month, no fixed commitment.',[{candidate:{intent:'proposal',seller:'Cedar',customer:'Fern',noFixedCommitment:true,offerings:[{name:'Pro',quantity:100,unitPrice:105,currency:'EUR',billing:'monthly'}]}}],true);assert.equal(done.results[0].status,'complete');
  const state=await service.run({action:'read'},'','no-term');assert.equal(state.review!.proposal.totals.annualizedRecurringCents,12600000);assert.equal(state.review!.proposal.totals.committedCents,undefined);
  for(const file of ['proposal.html','email.html']){const html=await readFile(state.files![file]!,'utf8');assert.match(html,/Annualized recurring run-rate/);assert.match(html,/No fixed commitment/);assert.doesNotMatch(html,/First-year estimate/);}
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('V1 exact live partial-help messages advance despite conversation intent',async()=>{
 const root=await mkdtemp(join(tmpdir(),'v1-partial-help-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const studio=await studioSignals(service,live,false,'partial-help',undefined,'v1');
 try{
  const first=await studio.turn("I work on the sales team at Silverquill, and we're preparing a commercial proposal for Rivergate. Can you help me put it together?",[{candidate:{intent:'conversation',seller:'Silverquill',customer:'Rivergate',offerings:null,termMonths:null,noFixedCommitment:null,customerGoal:null,summary:null,scope:null}}]);
  assert.match(first.results[0]?.text??first.text,/What offering/);assert.doesNotMatch(first.text,/Describe the proposal in text/);
  const second=await studio.turn("We're proposing QuillChat Enterprise licenses. What else do you need from me to prepare the proposal?",[{candidate:{intent:'conversation',seller:'Silverquill',customer:'Rivergate',offerings:[{name:'QuillChat Enterprise licenses',description:null,quantity:null,unitPrice:null,currency:null,billing:null,included:null}],termMonths:null,noFixedCommitment:null,customerGoal:null,summary:null,scope:null}}]);
  assert.match(second.results[0]?.text??second.text,/quantity/i);
  const w=await service.store.read(),pending=w.v1Turns[service.store.sessionKey('partial-help')]!;assert.equal(pending.candidate.seller,'Silverquill');assert.equal(pending.candidate.customer,'Rivergate');assert.equal((pending.candidate.offerings as {name:string}[])[0]?.name,'QuillChat Enterprise licenses');assert.equal((await service.run({action:'read'},'','partial-help')).artifacts,undefined);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
