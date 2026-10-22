/** Fictional Acme scenario through Studio's real signal HTTP path; no private logs. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {verifyPreview} from '../src/services/artifacts.js';
import {studioSignals} from '../tests/helpers/studio-signals.js';
import {acmeMessage,acmeChanges,acmeDraft} from '../tests/helpers/acme.js';

async function main() {
 const live=process.argv.includes('--live'),stub=process.argv.includes('--storage-stub'),scalar=process.argv.includes('--scalar');
 if(live&&stub)throw new Error('Live acceptance must use real PDF rendering.');
 if(live&&!process.env.OPENAI_API_KEY)throw new Error('Set OPENAI_API_KEY for live-model verification.');
 const parent=resolve('data/qa/acme');await mkdir(parent,{recursive:true,mode:0o700});
 const root=await mkdtemp(join(parent,'run-'));
 const service=new ProposalService(new WorkspaceStore(root),stub?async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'):undefined);
 let studio=await studioSignals(service,live,process.argv.includes('--trace-prices'));
 try{
  const first=await studio.turn(acmeMessage,scalar?acmeChanges.map((op,revision)=>({...op,revision})):[{action:'batch',revision:0,changes:acmeChanges}]);
  let state=await service.run({action:'read'},'','acme');
  assert.equal(state.seller.name,'Acme Projects');assert.equal(state.customer.company,'Brightside Technologies');
  assert.match(state.notes,/coordinating projects across multiple teams/i);
  const software=state.products.find(p=>p.billing==='monthly'),onboarding=state.products.find(p=>p.billing==='once');
  assert.ok(software&&onboarding);assert.equal(software.unitPriceCents,2500);assert.equal(onboarding.unitPriceCents,50000);
  assert.equal(state.selections.find(s=>s.productId===software.id)?.quantity,20);
  assert.deepEqual(state.pendingQuantities,[onboarding.id]);
  assert.match(state.nextQuestion,/quantity.*onboarding/i);
  await studio.close();
  studio=await studioSignals(new ProposalService(new WorkspaceStore(root),stub?async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'):undefined),live,process.argv.includes('--trace-prices'));
  assert.match(JSON.stringify(await (await studio.agent.getMemory())!.recall({threadId:'acme',perPage:false})),/Acme Projects/);
  const changes=[{action:'select',productId:'onboarding',quantity:1,quote:'One onboarding engagement. Please generate the proposal.'},{action:'draft',draft:acmeDraft}];
  const second=await studio.turn('One onboarding engagement. Please generate the proposal.',scalar?[...changes,{action:'generate'}].map((op,index)=>({...op,revision:state.revision+index})):[{action:'batch',revision:state.revision,changes,generate:true}]);
  state=await service.run({action:'read'},'','acme');
  assert.deepEqual(state.review?.proposal.totals,{monthlyCents:50000,oneTimeCents:50000,firstMonthCents:100000,firstYearCents:650000});
  assert.equal(state.artifacts?.completeness,'complete','Real PDF generation required; inspect Chromium installation/IPC permissions');
  const original=state.artifacts.directory;
  assert.equal((await verifyPreview(original)).completeness,'complete');
  for(const file of ['email.html','proposal.pdf','design.json'])assert.equal((await studio.app.request(new URL(state.previews![file]!).pathname)).status,200);
  const revision=await studio.turn('Increase the licenses to 35 and regenerate.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'licenses',quantity:35,quote:'Increase the licenses to 35 and regenerate.'},{action:'draft',draft:{...acmeDraft,recommendations:acmeDraft.recommendations.map(r=>r.productId==='licenses'?{...r,quantity:35}:r)}}],generate:true}]);
  state=await service.run({action:'read'},'','acme');
  assert.equal(state.review?.proposal.totals.monthlyCents,87500);assert.equal(state.review?.proposal.totals.firstYearCents,1100000);assert.equal(state.artifacts?.completeness,'complete');
  assert.notEqual(state.artifacts.directory,original);
  if(!scalar)assert.ok(first.toolCalls+second.toolCalls<=4,`Too many initial calls: ${first.toolCalls+second.toolCalls}`);
  for(const directory of [original,state.artifacts.directory]){
   for(const file of ['email.html','proposal.html','design.json']){
    const text=await readFile(join(directory,file),'utf8');assert.match(text,/Acme Projects/);assert.match(text,/Brightside Technologies/);
   }
  }
  if(!stub&&process.platform==='darwin'){
   const run=promisify(execFile),binary=join(root,'pdf-text');
   await run('clang',['-fno-modules','-framework','Foundation','-framework','PDFKit',resolve('scripts/pdf-text.m'),'-o',binary]);
   for(const [directory,monthly] of [[original,'$500'],[state.artifacts.directory,'$875']]){
    const {stdout}=await run(binary,[join(directory!,'proposal.pdf')]);const text=(JSON.parse(stdout) as string[]).join(' ').replace(/\s/g,'');
    for(const expected of ['Acme Projects','Brightside Technologies',monthly!])assert.ok(text.includes(expected.replace(/\s/g,'')),`PDF missing ${expected}`);
   }
  }
  console.log(JSON.stringify({provider:live?'live gpt-5-mini':'scripted',pdf:stub?'STORAGE STUB':'real',mode:scalar?'scalar baseline':'batch',initialToolCalls:first.toolCalls+second.toolCalls,clarifications:1,revisionToolCalls:revision.toolCalls,latencyMs:[first.latencyMs,second.latencyMs,revision.latencyMs],artifacts:[original,state.artifacts.directory]},null,2));
 }finally{await studio.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
