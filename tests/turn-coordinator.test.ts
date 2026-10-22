import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
import trace from './fixtures/shared-cadence-live.json';
const real=process.env.PROPOSAL_TEST_REAL_PDF==='1',live=process.env.PROPOSAL_TEST_LIVE==='1';
const pdf=real?undefined:async()=>Buffer.from('%PDF-1.7\nTEST STORAGE STUB');
test('coordinator exact consulting request: single extraction, authoritative response, three artifacts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const studio=await studioSignals(service,live,false,'consulting',undefined,true);
 try{
  assert.deepEqual(Object.keys(await studio.agent.listTools()),['submitCandidate']);
  const result=await studio.turn(trace.message,[{candidate:{...trace.calls[0],intent:'proposal'}}]);
  if(real){const state=await service.run({action:'read'},'','consulting');const out=resolve('data/qa/coordinator');await mkdir(out,{recursive:true});for(const name of ['proposal.pdf','proposal.html','email.html']){const file=state.files?.[name];if(file)await writeFile(join(out,name),await readFile(file));}}
  const outcome=result.results[0];assert.equal(outcome.status,'complete',outcome.text);assert.equal(result.toolCalls,1);if(!live)assert.equal(studio.prompts.length,1);const memory=await studio.agent.getMemory();await memory!.settled();assert.match(JSON.stringify((await memory!.recall({threadId:'consulting',perPage:false})).messages),/Proposal for Copperbank Logistics/);
  assert.match(result.text,/Proposal for Copperbank Logistics/);assert.doesNotMatch(result.text,/Scripted model: inspect/);
  const state=await service.run({action:'read'},'','consulting');assert.equal(state.review!.proposal.totals.oneTimeCents,1500000);assert.equal(state.review!.proposal.totals.monthlyCents,0);
  for(const name of ['proposal.pdf','proposal.html','email.html']){assert.ok((await readFile(state.files![name]!)).length);assert.equal((await studio.app.request(new URL(outcome.previews[name]).pathname)).status,200);}
  if(real){const out=resolve('data/qa/coordinator');await mkdir(out,{recursive:true});for(const name of ['proposal.pdf','proposal.html','email.html'])await writeFile(join(out,name),await readFile(state.files![name]!));}
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('coordinator persists incomplete identity across restart; ordinary conversation never finalizes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-pending-'));let service=new ProposalService(new WorkspaceStore(root),pdf);let studio=await studioSignals(service,false,false,'pending',undefined,true);
 try{
  const a=await studio.turn('Cobalt Advisory offers one Audit at USD 800 one-time. Prepare a proposal.',[{candidate:{intent:'proposal',seller:'Cobalt Advisory',offerings:[{name:'Audit',quantity:1,unitPrice:'800',currency:'USD',billing:'once'}]}}]);assert.equal(a.results[0].status,'clarification_required');assert.equal((await service.run({action:'read'},'','pending')).artifacts,undefined);
  await studio.close();service=new ProposalService(new WorkspaceStore(root),pdf);studio=await studioSignals(service,false,false,'pending',undefined,true);
  const b=await studio.turn('The customer is Fern Systems.',[{candidate:{intent:'proposal',customer:'Fern Systems'}}]);assert.equal(b.results[0].status,'complete',b.results[0].text);
  const before=await service.run({action:'read'},'','pending');
  const chat=await studio.turn('Thanks.',[{candidate:{intent:'conversation'}}]);assert.equal(chat.results[0].status,'research');assert.equal((await service.run({action:'read'},'','pending')).revision,before.revision);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('coordinator automatically fetches URLs; approval and generation use the same context',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-web-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const urls:string[]=[];
 const studio=await studioSignals(service,false,false,'web',async url=>{urls.push(url);if(url.includes('buyer'))throw new Error('Website returned HTTP 403.');return {url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h1>Slate Software</h1><h2>Team Plan</h2><p>USD 32 per subscription per month.</p>'};},true);
 try{
  const a=await studio.turn('Seller Slate Software: https://slate.example/pricing. Customer Buyer Company: https://buyer.example/products. Research only; do not generate.',[{candidate:{intent:'research',seller:'Slate Software',customer:'Buyer Company',websiteProducts:[{name:'Team Plan',url:'https://slate.example/pricing'}]}}]);assert.equal(urls.length,2);assert.equal(a.results[0].status,'approval_required');assert.match(a.results[0].text,/HTTP 403/);assert.equal((await service.run({action:'read'},'','web')).products.length,0);
  const b=await studio.turn('Approve Team Plan.',[{candidate:{intent:'conversation'}}]);assert.equal(b.results[0].status,'research');assert.equal((await service.run({action:'read'},'','web')).products[0]?.unitPriceCents,3200);
  const c=await studio.turn('Use 1 Team Plan and generate the proposal.',[{candidate:{intent:'proposal',offerings:[{name:'Team Plan',quantity:1}]}}]);assert.equal(c.results[0].status,'complete',c.results[0].text);assert.equal(c.results[0].investment.monthlyCents,'$32');assert.equal(urls.length,2);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQKWgAAAHQARXs5nCTAAAAAElFTkSuQmCC';
test('coordinator screenshot authorization, 100/1000 seats, narrative and commercial revisions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-image-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const studio=await studioSignals(service,false,false,'image',undefined,true);
 try{
  const first=await studio.turn('Seller Example Software. Customer Example Buyer. Inspect this screenshot; research only.',[{candidate:{intent:'research',seller:'Example Software',customer:'Example Buyer',imageObservations:[{index:0,text:'Premium EUR 105 per seat per month.'}]}}],false,'',[{data:png,mediaType:'image/png'}]);assert.equal(first.results[0].status,'research');assert.equal((await service.run({action:'read'},'','image')).products.length,0);
  const done=await studio.turn('I authorize a hypothetical estimate for Premium at EUR 105 per seat per month. Use 100 Premium seats and generate a proposal.',[{candidate:{intent:'proposal',offerings:[{name:'Premium',quantity:100,unitPrice:'105',currency:'EUR',billing:'monthly',basis:'hypothetical'}]}}]);assert.equal(done.results[0].status,'complete',done.results[0].text);
  let state=await service.run({action:'read'},'','image');assert.equal(state.review!.proposal.totals.monthlyCents,1050000);assert.equal(state.products[0]!.priceBasis,'hypothetical');
  const next=await studio.turn('Increase Premium to 1000 seats and regenerate.',[{candidate:{intent:'revision',offerings:[{name:'Premium',quantity:1000}]}}]);assert.equal(next.results[0].status,'complete',next.results[0].text);state=await service.run({action:'read'},'','image');assert.equal(state.review!.proposal.totals.firstYearCents,126000000);
  const narrative=await studio.turn('Shorten the summary without changing commercial terms.',[{candidate:{intent:'revision',summary:'A concise proposal for the requested scope.'}}]);assert.equal(narrative.results[0].status,'complete');assert.deepEqual((await service.run({action:'read'},'','image')).review!.proposal.totals,state.review!.proposal.totals);
  const fresh=await studioSignals(service,false,false,'other',undefined,true);try{await fresh.turn('Hello',[{candidate:{intent:'conversation'}}]);assert.equal((await service.run({action:'read'},'','other')).customer.company,undefined);}finally{await fresh.close();}
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
test('coordinator rendering failure is not complete; retry does not replay commercial edits',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-retry-'));let calls=0;const service=new ProposalService(new WorkspaceStore(root),async()=>{if(++calls===1)throw new Error('Temporary PDF failure');return Buffer.from('%PDF-1.7\nSTUB');});const studio=await studioSignals(service,false,false,'retry',undefined,true);
 try{
  const a=await studio.turn(trace.message,[{candidate:{...trace.calls[0],intent:'proposal'}}]);assert.equal(a.results[0].status,'rendering_failed');assert.doesNotMatch(a.text,/PDF proposal\]\(/);const before=await service.run({action:'read'},'','retry');
  const b=await studio.turn('Retry.',[{candidate:{intent:'proposal'}}]);assert.equal(b.results[0].status,'complete',b.results[0].text);const after=await service.run({action:'read'},'','retry');assert.deepEqual(after.products,before.products);assert.deepEqual(after.selections,before.selections);assert.equal(calls,2);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
import {TurnCoordinator} from '../src/assistant/turn-coordinator.js';
test('coordinator rejects stale turns and invented screenshot prices; duplicate submission is idempotent',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-safety-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const coordinator=new TurnCoordinator(service);
 try{
  const first=await coordinator.begin(trace.message,'safe',{messageId:'one',resource:'owner'});
  const second=await coordinator.begin(trace.message,'safe',{messageId:'two',resource:'owner'});
  const candidate=JSON.parse(JSON.stringify(trace.calls[0]),(_key,value)=>value===null?undefined:value);
  const a=await coordinator.accept({...candidate,intent:'proposal'},first.turn);assert.equal(a.status,'complete');
  assert.deepEqual(await coordinator.accept({...candidate,intent:'proposal'},first.turn),a);
  const stale=await coordinator.accept({...candidate,intent:'proposal'},second.turn);assert.equal(stale.status,'clarification_required');assert.match(stale.text,/changed/);
  const unsupported=await coordinator.begin('Seller Cedar Software. Customer Otter Freight. Use 100 Premium seats and generate a proposal.','unverified',{messageId:'three',resource:'owner'});
  const refused=await coordinator.accept({intent:'proposal',seller:'Cedar Software',customer:'Otter Freight',offerings:[{name:'Premium',quantity:100,unitPrice:'105',currency:'EUR',billing:'monthly',basis:'verified'}]},unsupported.turn);assert.equal(refused.status,'clarification_required');assert.equal((await service.run({action:'read'},'','unverified')).products.length,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('customer-page prices cannot be promoted to seller evidence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-role-'));const service=new ProposalService(new WorkspaceStore(root),pdf);const coordinator=new TurnCoordinator(service,async url=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h1>Buyer</h1><h2>Customer Plan</h2><p>USD 10 per month.</p>'}));
 try{const t=await coordinator.begin('Seller Cedar. Customer Buyer https://buyer.example/pricing. Research only.','role',{messageId:'role',resource:'owner'});const result=await coordinator.accept({intent:'research',seller:'Cedar',customer:'Buyer',websiteRoles:[{url:'https://buyer.example/pricing',role:'pricing'}],websiteProducts:[{name:'Customer Plan',url:'https://buyer.example/pricing'}]},t.turn);assert.equal(result.status,'clarification_required');assert.match(result.text,/Customer website/);assert.equal((await service.run({action:'read'},'','role')).products.length,0);}finally{await rm(root,{recursive:true,force:true});}
});
import websiteRoleTrace from './fixtures/coordinator-website-role-live.json';
test('403 sources and customer products do not poison pasted/screenshot proposal continuation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'coordinator-403-'));const service=new ProposalService(new WorkspaceStore(root),pdf);let studio=await studioSignals(service,false,false,'fallback',async()=>{throw new Error('Website returned HTTP 403.');},true);
 try{
  const first=await studio.turn('Seller Silverquill https://silverquill.example.com/. Pricing https://silverquill.example.com/business/pricing/#quillchat. Prospect Rivergate https://www.rivergate.example.com/products. Research only.',[{candidate:websiteRoleTrace[1]}]);assert.notEqual(first.results[0].error,'Website evidence must be an exact excerpt of a fetched source with the correct role. Read available pricing sources.');
  await studio.turn('Here is the pricing screenshot and https://silverquill.example.com/about/. Research only.',[{candidate:websiteRoleTrace[2]}],false,'',[{data:png,mediaType:'image/png'}]);
  await studio.turn('Silverquill is an AI research and deployment company. Rivergate is our prospect.',[{candidate:websiteRoleTrace[3]}]);
  const request=await studio.turn('Generate a proposal for 100 Premium seats for 12 months in EUR. Expected totals are €10,500/month and €126,000/year.',[{candidate:websiteRoleTrace.at(-1)}]);assert.equal(request.results[0].status,'clarification_required');assert.match(request.text,/authorize.*hypothetical/i);assert.doesNotMatch(request.text,/exact excerpt/);
  const stored=await service.store.read(),key=service.store.sessionKey('fallback');assert.equal(stored.turns[key]!.candidate.seller,'Silverquill');assert.equal(stored.turns[key]!.candidate.customer,'Rivergate');assert.equal(Object.keys(stored.attachments[key]!).length,1);assert.match(JSON.stringify(stored.turns[key]!.candidate),/12 months/);assert.equal(stored.websites[key]?.review,undefined);
  await studio.close();studio=await studioSignals(new ProposalService(new WorkspaceStore(root),pdf),false,false,'fallback',undefined,true);
  const done=await studio.turn('I authorize a hypothetical estimate for Premium seat at EUR 105 per month. Use 100 Premium seats for 12 months and generate the proposal.',[{candidate:{intent:'proposal',summary:'100 Premium seats for a 12-month period.'}}]);assert.equal(done.results[0].status,'complete',done.results[0].text);
  const state=await service.run({action:'read'},'','fallback');assert.equal(state.review!.proposal.totals.monthlyCents,1050000);assert.equal(state.review!.proposal.totals.firstYearCents,12600000);assert.equal(state.products[0]!.priceBasis,'hypothetical');assert.equal(state.seller.name,'Silverquill');assert.equal(state.customer.company,'Rivergate');
  for(const name of ['proposal.html','email.html']){const html=await readFile(state.files![name]!,'utf8');assert.match(html,/10,500/);assert.match(html,/126,000/);}
  assert.ok((await readFile(state.files!['proposal.pdf']!)).length);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
