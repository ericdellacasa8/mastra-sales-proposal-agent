import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
import messages from './fixtures/hubspot-human-messages.json';import failures from './fixtures/hubspot-failed-operations.json';
import {saveProposal} from '../src/assistant/save-proposal.js';
const real=process.env.PROPOSAL_TEST_REAL_PDF==='1';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQKWgAAAHQARXs5nCTAAAAAElFTkSuQmCC';
test('synthetic Rivergate failed calls remain invalid; flat save uses captured facts, 100/1000 quantities and hypothetical authority',async()=>{
 const root=await mkdtemp(join(tmpdir(),'save-proposal-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const studio=await studioSignals(service,false,false,'hubspot');
 try{
  await studio.turn(messages[0]!,[]);await studio.turn(messages[1]!,[],false,'Image received',[{data:png,mediaType:'image/png'}]);
  const key=service.store.sessionKey('hubspot');const attachment=Object.keys((await service.store.read()).attachments[key]!)[0]!;
  await studio.turn('Record the screenshot observation only.',[{action:'observeImage',revision:0,attachmentId:attachment,text:'Premium seat €105 / month. Unverified screenshot.'}]);
  await studio.turn(messages[2]!,[]);await studio.turn(messages[3]!,[]);
  const before=await studio.turn('Generate the proposal now.',[failures[0],failures.at(-1)],true);assert.ok(before.results.every(r=>r.ok!==true));assert.equal((await service.run({action:'read'},'','hubspot')).products.length,0);
  const input={seller:'Silverquill',customer:'Rivergate',offerings:[{name:'Premium',quantity:100,unitPrice:'105',currency:'EUR',billing:'monthly',description:'Unsubstantiated workflow automation capability'}]};
  const done=await studio.turn('Generate the proposal now.',[{save:input}]);let state=done.results[0];assert.equal(state.review.proposal.totals.monthlyCents,1050000);assert.equal(state.review.proposal.totals.firstYearCents,12600000);assert.equal(state.products[0].description,'Premium');assert.equal(state.products[0].priceBasis,'hypothetical');
  const out=resolve('data/qa/save-proposal',real?'real':'stub');await mkdir(out,{recursive:true});for(const name of ['proposal.html','email.html','design.json']){const content=await readFile(state.files[name]);await writeFile(join(out,name),content);assert.match(content.toString(),/Hypothetical|hypothetical/);assert.ok(content.toString().includes('€10,500'));}
  const next=await studio.turn('Increase Premium to 1000 seats and regenerate.',[{save:{offerings:[{name:'Premium',quantity:1000}]}}]);state=next.results[0];assert.equal(state.review.proposal.totals.monthlyCents,10500000);assert.equal(state.review.proposal.totals.firstYearCents,126000000);
  const copy=await studio.turn('Make the proposal concise.',[{save:{offerings:[{name:'Premium',quantity:1000}],summary:'A concise proposal for the requested scope.'}}]);assert.deepEqual(copy.results[0].review.proposal.totals,state.review.proposal.totals);
  const fresh=await studioSignals(service,false,false,'isolated');try{const read=await fresh.turn('Hello',[{action:'read'}]);assert.equal(read.results[0].customer.company,undefined);}finally{await fresh.close();}
  assert.equal(done.results[0].artifacts.completeness,'complete',done.results[0].warning);if(real)await writeFile(join(out,'proposal.pdf'),await readFile(done.results[0].files['proposal.pdf']));
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('flat consulting save, optional support, milestones; research and stale updates cannot generate or overwrite',async()=>{
 const root=await mkdtemp(join(tmpdir(),'save-consulting-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const studio=await studioSignals(service,false,false,'consulting');
 const input={seller:'Aster Advisory',customer:'Beacon Freight',offerings:[{name:'Discovery',quantity:1,unitPrice:'3000',currency:'EUR',billing:'once'},{name:'Implementation',quantity:1,unitPrice:'12000',currency:'EUR',billing:'once'},{name:'Support',included:false,unitPrice:'1500',currency:'EUR',billing:'monthly'}]};
 const text='Aster Advisory proposes one Discovery at €3,000 one-time and one Implementation at €12,000 one-time for Beacon Freight. Implementation has three milestones over eight weeks. Support at €1,500/month is optional and excluded. Generate a proposal.';
 try{
  const research=await studio.turn('Research only. Do not generate a proposal.',[{save:input}],true);assert.equal(research.results[0].ok,false);
  const created=await studio.turn(text,[{save:input}]);const state=created.results[0];assert.equal(state.review.proposal.totals.oneTimeCents,1500000);assert.equal(state.review.proposal.totals.monthlyCents,0);assert.equal(state.review.proposal.content.timeline.length,1);
  await assert.rejects(saveProposal(service,input,'Generate again','consulting',{messageId:'stale-request',resource:'local-owner'},0),/State changed/);
  assert.equal((await service.run({action:'read'},'','consulting')).revision,state.revision);
  const wrong=await studio.turn('Make it cheaper.',[{save:{offerings:[{name:'Discovery',quantity:1,unitPrice:'1',currency:'EUR',billing:'once'}]}}],true);assert.equal(wrong.results[0].ok,false);
  assert.equal(state.artifacts.completeness,'complete',state.warning);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

import cadenceTrace from './fixtures/shared-cadence-live.json';
test('recorded Studio shared cadence creates all artifacts without clarification',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cadence-live-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const studio=await studioSignals(service,process.env.PROPOSAL_TEST_LIVE==='1',false,'cadence');
 try{const result=await studio.turn(cadenceTrace.message,[{save:cadenceTrace.calls[0]}]);const state=result.results[0];assert.equal(state.review.proposal.totals.oneTimeCents,1500000);assert.equal(state.review.proposal.totals.monthlyCents,0);assert.equal(state.products.length,3);assert.equal(state.selections.length,2);assert.match(JSON.stringify(state.review.proposal.content.timeline),/eight weeks across three milestones/);
 for(const name of ['proposal.html','email.html'])assert.match(await readFile(state.files[name],'utf8'),/15,000/);
 if(real){const out=resolve('data/qa/shared-cadence');await mkdir(out,{recursive:true});for(const name of ['proposal.html','email.html',...(state.artifacts.completeness==='complete'?['proposal.pdf']:[])])await writeFile(join(out,name),await readFile(state.files[name]));}
 assert.equal(state.artifacts.completeness,'complete',state.warning);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
for(const replay of [true,false])test(`pending billing clarification survives restart (${replay?'recorded call':'empty continuation'})`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'cadence-resume-'));const render=real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB');let service=new ProposalService(new WorkspaceStore(root),render);let studio=await studioSignals(service,false,false,'pending');
 try{
  const incomplete=cadenceTrace.message.replace('€12,000, both one-time fees','€12,000 one-time');
  const failed=await studio.turn(incomplete,[{save:cadenceTrace.calls[0]}],true);assert.match(failed.results[0].error,/Missing explicit billing/);
  const key=service.store.sessionKey('pending');assert.ok((await service.store.read()).pendingProposals[key]);assert.equal((await service.run({action:'read'},'','pending')).products.length,0);
  await studio.close();service=new ProposalService(new WorkspaceStore(root),render);studio=await studioSignals(service,false,false,'pending');
  const result=await studio.turn(cadenceTrace.reply,[{save:replay?cadenceTrace.calls[3]:{}}]);assert.equal(result.results[0].review.proposal.totals.oneTimeCents,1500000);assert.equal(result.results[0].review.proposal.totals.monthlyCents,0);assert.equal(result.results[0].artifacts.completeness,'complete',result.results[0].warning);assert.equal((await service.store.read()).pendingProposals[key],undefined);
  const isolated=await studioSignals(service,false,false,'other');try{const rejected=await isolated.turn(cadenceTrace.reply,[{save:cadenceTrace.calls[3]}],true);assert.match(rejected.results[0].error,/No proposal creation/);}finally{await isolated.close();}
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('unseen shared cadence; contradictory billing and malformed prices remain rejected',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cadence-generic-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const studio=await studioSignals(service,false,false,'unseen');
 const input={seller:'Cobalt Training',customer:'Fern Systems',offerings:[{name:'Safety Class',quantity:1,unitPrice:'400',currency:'USD'},{name:'Team Seminar',quantity:1,unitPrice:'900',currency:'USD'}]};
 const message='Cobalt Training proposes one Safety Class at $400 and one Team Seminar at $900, both one-time fees, for Fern Systems. Generate the proposal.';
 try{
  const bad=await studio.turn(message.replace('$400 and','$400 monthly and'),[{save:input}],true);assert.match(bad.results[0].error,/Conflicting billing/);
  const good=await studio.turn(message,[{save:input}]);assert.equal(good.results[0].review.proposal.totals.oneTimeCents,130000);assert.equal(good.results[0].artifacts.completeness,'complete',good.results[0].warning);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

import {unitPrice} from '../src/assistant/price.js';
test('price punctuation is not a malformed numeric separator',()=>{
 assert.equal(unitPrice('12000','€12,000','€12,000, both one-time fees',false,'EUR'),1200000);
 assert.throws(()=>unitPrice('12000','€12,000','€12,000,50',false,'EUR'));
 assert.throws(()=>unitPrice('12000','€12,000','€12,0000',false,'EUR'));
});
test('missing quantity resumes pending creation without repeating seller or prices',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pending-quantity-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const studio=await studioSignals(service,false,false,'quantity');
 try{
  const first=await studio.turn('Cedar Software sells Dispatch at $32 per seat per month. Prepare a proposal for Otter Freight.',[{save:{seller:'Cedar Software',customer:'Otter Freight',offerings:[{name:'Dispatch',unitPrice:'32',currency:'USD',billing:'monthly'}]}}],true);assert.match(first.results[0].error,/quantity/);
  const next=await studio.turn('100 seats.',[{save:{offerings:[{name:'Dispatch',quantity:100}]}}]);assert.equal(next.results[0].review.proposal.totals.monthlyCents,320000);assert.equal(next.results[0].review.proposal.totals.firstYearCents,3840000);assert.equal(next.results[0].artifacts.completeness,'complete',next.results[0].warning);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('pending missing price accepts a scoped human clarification, never image or invented price',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pending-price-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const studio=await studioSignals(service,false,false,'price');
 try{
  const first=await studio.turn('Cobalt Advisory offers one Audit for Fern Systems. Create the proposal.',[{save:{seller:'Cobalt Advisory',customer:'Fern Systems',offerings:[{name:'Audit',quantity:1}]}}],true);assert.equal(first.results[0].ok,false);
  const next=await studio.turn('USD 800 one-time.',[{save:{offerings:[{name:'Audit',unitPrice:'800',currency:'USD',billing:'once'}]}}]);assert.equal(next.results[0].review.proposal.totals.oneTimeCents,80000);assert.equal(next.results[0].artifacts.completeness,'complete',next.results[0].warning);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
