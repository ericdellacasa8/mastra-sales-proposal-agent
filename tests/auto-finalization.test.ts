import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {call,populate,draftOperation} from './helpers/conversation.js';
import {verifyPreview} from '../src/services/artifacts.js';
import {renderPdf} from '../src/rendering/pdf.js';

test('ready drafts automatically publish one synchronized bundle; commercial/narrative revisions regenerate, unchanged generation reuses',async()=>{
 const root=await mkdtemp(join(tmpdir(),'auto-finalize-'));let renders=0;
 const service=new ProposalService(new WorkspaceStore(root),async(html,seller)=>{renders++;return process.env.PROPOSAL_TEST_REAL_PDF==='1'?renderPdf(html,seller):Buffer.from('%PDF-1.7\nSTUB');});
 async function bundle(state:Awaited<ReturnType<typeof service.run>>){assert.equal(state.artifacts?.completeness,'complete',state.warning);assert.equal(state.artifacts.revision,state.revision);const manifest=await verifyPreview(state.artifacts.directory);const saved=JSON.parse(await readFile(state.files!['proposal.json']!,'utf8'));assert.equal(saved.id,state.review!.proposal.id);assert.equal(manifest.proposalId,saved.id);assert.deepEqual(saved.totals,state.review!.proposal.totals);for(const label of ['PDF proposal','HTML proposal','HTML email'])assert.ok(state.previewMarkdown?.includes(`[${label}]`));}
 try{
  await populate(service);assert.equal(renders,0);await service.capture({messageId:'chat',resource:'local-owner'},'Hello','local');assert.equal(renders,0);
  const first=await call(service,await draftOperation(service),'Prepare draft');await bundle(first);assert.equal(renders,1);
  const same=await call(service,{action:'generate'},'Generate again');await bundle(same);assert.equal(renders,1);assert.equal(same.artifacts!.directory,first.artifacts!.directory);assert.equal(same.revision,first.revision);
  const pending=await call(service,{action:'select',productId:'planning-seat',quantity:20,quote:'Planning seats, quantity 20'},'Planning seats, quantity 20');assert.equal(pending.previewMarkdown,undefined);assert.equal(renders,1);
  const revised=await call(service,await draftOperation(service),'Update scope');await bundle(revised);assert.equal(revised.review!.proposal.totals.monthlyCents,50000);assert.equal(renders,2);
  const narrative=await call(service,{action:'reviseNarrative',summary:'A concise planning proposal.'},'Make the summary concise');await bundle(narrative);assert.equal(renders,3);assert.deepEqual(narrative.review!.proposal.totals,revised.review!.proposal.totals);
  // Cached artifacts are verified, not blindly advertised after file corruption.
  await writeFile(narrative.files!['email.html']!,'corrupt');const repaired=await call(service,{action:'generate'},'Regenerate');await bundle(repaired);assert.equal(renders,4);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('batch finalizes only once at commit boundary; failed batch does not render intermediate draft',async()=>{
 const root=await mkdtemp(join(tmpdir(),'auto-batch-'));let renders=0;const service=new ProposalService(new WorkspaceStore(root),async()=>{renders++;return Buffer.from('%PDF-1.7\nSTUB');});
 try{await populate(service);const draft=await draftOperation(service);let state=await service.run({action:'read'},'');
  await assert.rejects(service.run({action:'batch',revision:state.revision,changes:[draft,{action:'select',productId:'unknown',quantity:1,quote:'one unknown'}],generate:true},'one unknown'),/existing catalog/);assert.equal(renders,0);
  state=await service.run({action:'read'},'');const ready=await service.run({action:'batch',revision:state.revision,changes:[draft],generate:false},'Prepare draft');assert.equal(renders,1);assert.ok(ready.previewMarkdown);
  await call(service,{action:'review'},'Review');assert.equal(renders,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('partial rendering persists an honest error and retry rerenders saved revision without replaying mutations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'auto-retry-'));let fails=true,renders=0;const store=new WorkspaceStore(root);const service=new ProposalService(store,async()=>{renders++;if(fails)throw new Error('Renderer unavailable for test');return Buffer.from('%PDF-1.7\nSTUB');});
 try{await populate(service);const state=await service.run({action:'read'},'');const op={...await draftOperation(service),revision:state.revision};
  const partial=await service.run(op,'Prepare draft');assert.equal(partial.artifacts!.completeness,'html-only');assert.ok(!partial.previewMarkdown!.includes('[PDF proposal]'));assert.match(partial.warning!,/Renderer unavailable for test/);
  const read=await new ProposalService(store).run({action:'read'},'');assert.match(read.warning!,/Renderer unavailable for test/);assert.equal(read.renderingError!.retryable,true);
  fails=false;const retry=await service.run(op,'Prepare draft');assert.equal(retry.artifacts!.completeness,'complete');assert.equal(retry.warning,undefined);assert.equal(renders,2);assert.deepEqual(retry.review!.proposal.totals,partial.review!.proposal.totals);assert.ok(retry.previewMarkdown!.includes('[PDF proposal]'));
  await service.run(op,'Prepare draft');assert.equal(renders,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
