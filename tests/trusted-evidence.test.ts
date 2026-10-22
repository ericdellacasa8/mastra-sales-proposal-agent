import {failureDetails} from '../src/assistant/recovery.js';
import {isUserAuthoredMessage} from '@mastra/core/agent';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
import {acmeMessage,acmeChanges,acmeDraft} from './helpers/acme.js';
const pdf=async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY');

test('exact three-turn Studio sequence reuses verified evidence after a runtime restart', {timeout:30000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'trusted-acme-'));
 let service=new ProposalService(new WorkspaceStore(root),pdf);
 let studio=await studioSignals(service);
 try{
  const status=await studio.app.request('/api/memory/status?agentId=salesProposalAgent');
  assert.equal(status.status,200);
  assert.equal((await status.json()).result,true);
  await studio.turn(acmeMessage,[{action:'batch',revision:0,changes:acmeChanges}]);
  let state=await service.run({action:'read'},'','acme');
  const originalSource=state.provenance['seller.name']!.sourceMessageId;
  assert.ok((await service.store.read()).sources[service.store.sessionKey('acme')]![originalSource]);
  await studio.close();
  // A separate Node process reads the committed native database, not an in-memory cache.
  const persisted=execFileSync(process.execPath,['--input-type=module','-e',`
    import {Memory} from '@mastra/memory';import {LibSQLStore} from '@mastra/libsql';
    const storage=new LibSQLStore({id:'restart-probe',url:process.argv[1]});
    const memory=new Memory({storage});
    const result=await memory.recall({threadId:'acme',perPage:false});
    console.log(JSON.stringify(result.messages));await memory.settled();await storage.close();
  `,`file:${join(root,'memory.db')}`],{encoding:'utf8'});
  assert.match(persisted,/Acme Projects/);
  service=new ProposalService(new WorkspaceStore(root),pdf);studio=await studioSignals(service);
  const memory=await studio.agent.getMemory();
  assert.ok(memory);
  const recalled=await memory.recall({threadId:'acme',perPage:false});
  assert.match(JSON.stringify(recalled.messages),/Acme Projects/);
  assert.equal((await memory.recall({threadId:'isolated',perPage:false})).messages.length,0);
  // Models sometimes re-emit earlier facts alongside new ones. Real provenance, not a new quote, authorizes this reuse.
  const replay=acmeChanges.slice(1).filter(op=>op.action!=='select').map(op=>op.action==='seller'?{...op,fields:op.fields!.map(f=>({...f,sourceMessageId:originalSource}))}:op);
  const second=await studio.turn('One onboarding engagement. Please generate the proposal.',[{action:'batch',revision:state.revision,changes:[...replay,{action:'select',productId:'onboarding',quantity:1,quote:'One onboarding engagement.'},{action:'draft',draft:acmeDraft}],generate:true}]);
  assert.equal(second.toolCalls,1);
  assert.match(JSON.stringify(studio.prompts[0]),/Scripted model: inspect tool result/ ,'Native Memory restores the prior assistant message after restart');
  state=await service.run({action:'read'},'','acme');
  assert.deepEqual(state.review?.proposal.totals,{monthlyCents:50000,oneTimeCents:50000,firstMonthCents:100000,firstYearCents:650000});
  assert.equal(state.provenance['seller.name']!.sourceMessageId,originalSource);
  const before=state.artifacts!.directory;
  await studio.turn('Increase the licenses to 35 and regenerate.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'licenses',quantity:35,quote:'Increase the licenses to 35'},{action:'draft',draft:{...acmeDraft,recommendations:acmeDraft.recommendations.map(r=>r.productId==='licenses'?{...r,quantity:35}:r)}}],generate:true}]);
  state=await service.run({action:'read'},'','acme');
  assert.deepEqual(state.review?.proposal.totals,{monthlyCents:87500,oneTimeCents:50000,firstMonthCents:137500,firstYearCents:1100000});
  assert.equal(state.seller.name,'Acme Projects');assert.equal(state.customer.company,'Brightside Technologies');
  assert.notEqual(state.artifacts!.directory,before);
  for(const file of ['email.html','proposal.html','design.json'])assert.match(await readFile(join(state.artifacts!.directory,file),'utf8'),/\$875/);
  const sources=(await service.store.read()).sources[service.store.sessionKey('acme')]!;
  await memory.settled();
  const history=await memory.recall({threadId:'acme',perPage:false});
  assert.equal(history.messages.filter(isUserAuthoredMessage).length,3,'Native history contains each human turn once');
  assert.equal(new Set(history.messages.map(m=>m.id)).size,history.messages.length);
  assert.equal(Object.keys(sources).length,3,'Each genuine user turn recorded once; recalled messages are not new evidence');
  assert.equal((await service.run({action:'read'},'','other-thread')).customer.company,undefined);
  const isolated=await studioSignals(service,false,false,'other-thread');
  try {await isolated.turn('Hello');assert.doesNotMatch(JSON.stringify(isolated.prompts),/Brightside Technologies|Acme Projects/);} finally {await isolated.close();}
  await assert.rejects(service.capture({messageId:'forged',resource:'another-owner'},'reuse','acme'),/another resource/);
  // Old scope must never undo a later revision.
  await assert.rejects(service.run({action:'select',revision:state.revision,productId:'licenses',quantity:20,quote:'They need 20 licenses',sourceMessageId:originalSource},'Generate again','acme'),/Historical evidence/);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('unverified model text, forged IDs and changed source text cannot authorize facts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'evidence-guard-'));const s=new ProposalService(new WorkspaceStore(root),pdf);
 try{
  const turn={messageId:'actual-user',resource:'local-owner'};
  await s.capture(turn,acmeMessage,'guard');
  await s.capture(turn,acmeMessage,'guard');
  assert.equal(Object.keys((await s.store.read()).sources[s.store.sessionKey('guard')]!).length,1);
  await assert.rejects(s.capture(turn,'Altered price $1','guard'),/conflicts/);
  await s.run({action:'batch',revision:0,changes:acmeChanges},acmeMessage,'guard',turn);
  let state=await s.run({action:'read'},'','guard');
  const fake={action:'seller',revision:state.revision,fields:[{field:'name',value:'Invented Seller',quote:'Invented Seller',sourceMessageId:'assistant-message'}]};
  await assert.rejects(s.run(fake,'Generate now','guard'),/captured salesperson/);
  await assert.rejects(s.run({action:'product',revision:state.revision,id:'licenses',price:{value:'1',quote:'$25',sourceMessageId:turn.messageId}},'Generate now','guard'),/Historical evidence/);
  assert.equal((await s.run({action:'read'},'','guard')).products[0]?.unitPriceCents,2500);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('a captured older user source can fill missing pricing but cannot authorize another thread',async()=>{
 const root=await mkdtemp(join(tmpdir(),'evidence-missing-'));const s=new ProposalService(new WorkspaceStore(root),pdf);
 try{
  const original={messageId:'first-user',resource:'local-owner'};
  await s.capture(original,acmeMessage,'origin');
  await s.run({action:'batch',revision:0,changes:acmeChanges.map(op=>op.action==='product'?{...op,price:undefined}:op)},acmeMessage,'origin',original);
  let state=await s.run({action:'read'},'','origin');
  state=await s.run({action:'batch',revision:state.revision,changes:[
   {action:'product',id:'licenses',price:{value:'25.00',quote:'$25',sourceMessageId:original.messageId}},
   {action:'product',id:'onboarding',price:{value:'500.00',quote:'$500',sourceMessageId:original.messageId}},
  ]},'Please use the prices I already supplied.','origin');
  assert.deepEqual(state.products.map(p=>p.unitPriceCents),[2500,50000]);
  await s.run({action:'start',mode:'custom',revision:0},'Create my own','separate');
  await assert.rejects(s.run({action:'seller',revision:1,fields:[{field:'name',value:'Acme Projects',quote:'Acme Projects',sourceMessageId:original.messageId}]},'Use another seller','separate'),/captured salesperson/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('captured Studio image bytes persist separately; model observations never become human evidence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'image-evidence-'));const service=new ProposalService(new WorkspaceStore(root));
 const turn={messageId:'image-message',resource:'local-owner'};const text='Review my screenshot.';
 try{
  await service.capture(turn,text,'image',{content:{parts:[{type:'text',text},{type:'file',mimeType:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQKWgAAAHQARXs5nCTAAAAAElFTkSuQmCC'}]}});
  const workspace=await new WorkspaceStore(root).read();const key=service.store.sessionKey('image');const [id,attachment]=Object.entries(workspace.attachments[key]!)[0]!;
  assert.equal(attachment.status,'unverified-image');assert.ok((await readFile(attachment.reference)).length);
  await service.run({action:'observeImage',revision:0,attachmentId:id,text:'From €90 per license'},text,'image',turn);
  const restored=await new WorkspaceStore(root).read();assert.equal(restored.attachments[key]![id]!.observation,'From €90 per license');
  assert.equal(restored.sources[key]!['image-message']!.text,text);
  await assert.rejects(service.run({action:'observeImage',revision:0,attachmentId:id,text:'Invented'},'Review image','other'),/no captured image/);
  await service.capture({messageId:'bad',resource:'local-owner'},'Attached','image',{content:{parts:[{type:'file',data:'https://internal/image.png'}]}});
  assert.match((await service.store.read()).attachmentErrors[key]![0]!,/Unsupported attachment/);
 }finally{await rm(root,{recursive:true,force:true});}
});


test('tool recovery categories are structured and bounded',()=>{
 for(const [message,code] of [['State changed','STALE_REVISION'],['Quote must come verbatim','MISSING_EVIDENCE'],['Which quantity is ambiguous?','AMBIGUOUS_SELECTION'],['Unsupported attachment','UNSUPPORTED_ATTACHMENT'],['Approved price conflicts','CONFLICTING_APPROVAL'],['Chromium unavailable','RENDERING_FAILURE']]) {
  const result=failureDetails(new Error(message));assert.equal(result.code,code);assert.equal(result.maxRetries,1);
 }
});
