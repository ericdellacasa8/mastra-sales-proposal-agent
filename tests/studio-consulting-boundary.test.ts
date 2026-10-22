import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import calls from './fixtures/studio-consulting-boundary-calls.json';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
const message='Birchpath Advisory proposes one discovery workshop at €3,000 one-time and one implementation project at €12,000 one-time for Copperbank Logistics.\n\nImplementation has three milestones over eight weeks. Support at €1,500/month is optional and excluded from the committed price.\n\nGenerate the PDF proposal, HTML proposal, and HTML email now.';
const replacements:Record<string,string>={'Birchpath Advisory':'Cobalt Fieldworks','Copperbank Logistics':'Marble Goods','discovery workshop':'planning session','Discovery Workshop':'Planning Session','implementation project':'installation package','Implementation Project':'Installation Package','Support':'Maintenance','support':'maintenance','€3,000':'$800','€12,000':'$2,200','€1,500':'$95','"3000"':'"800"','"12000"':'"2200"','"1500"':'"95"','EUR':'USD','three milestones over eight weeks':'four milestones over six weeks','Three milestones over eight weeks':'Four milestones over six weeks','proposes':'offers'};
const substitute=(text:string)=>Object.entries(replacements).reduce((value,[from,to])=>value.replaceAll(from,to),text);
for(const [index,operation] of [...calls,JSON.parse(substitute(JSON.stringify(calls[0])))].entries())test(index<3?`synthetic historical consulting boundary call ${index+1}`:'unrelated direct-input offering uses identical boundary',async()=>{
 const input=index<3?message:substitute(message);const expected=(text:string)=>index<3?text:substitute(text);
 const root=await mkdtemp(join(tmpdir(),'boundary-replay-'));const real=process.env.PROPOSAL_TEST_REAL_PDF==='1';const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const live=process.env.PROPOSAL_TEST_LIVE==='1';const studio=await studioSignals(service,live,false,`boundary-${index}`);
 try{
  const response=await studio.turn(input,[operation],true);const state=live?{ok:true,...await service.run({action:'read'},'',`boundary-${index}`)}:response.results[0];assert.equal(state.ok,true,state.error??state.message);
  assert.equal(state.customer.company,expected('Copperbank Logistics'));assert.equal(state.customer.name,undefined);assert.equal(state.seller.name,expected('Birchpath Advisory'));assert.equal(state.seller.email,undefined);
  assert.equal(state.review.proposal.totals.oneTimeCents,index<3?1500000:300000);assert.equal(state.review.proposal.totals.monthlyCents,0);assert.equal(state.selections.length,2);assert.equal(state.products[2].name,expected('Support'));
  for(const profile of Object.values((await service.store.read()).profiles))assert.ok(!profile.terms.some(term=>term.startsWith('Optional offering — ')),'Proposal exclusions must not leak into reusable seller profiles');
  const out=resolve('data/qa/consulting-boundary',real?'real':'stub',String(index+1));await mkdir(out,{recursive:true});
  for(const file of ['proposal.html','email.html','design.json','proposal.json']){const bytes=await readFile(state.files[file]);await writeFile(join(out,file),bytes);if(file.endsWith('.html')){const html=bytes.toString();assert.ok(html.includes(index<3?'€15,000':'$3,000'));assert.ok(html.includes(expected('€1,500')));assert.match(html,/excluded/);}assert.equal((await studio.app.request(new URL(state.previews[file]).pathname)).status,200);}
  assert.ok((await readFile(state.files['proposal.html'],'utf8')).includes(expected('Three milestones over eight weeks')));
  const revised=await studio.turn('Shorten the executive summary without changing any commercial terms.',[{action:'reviseNarrative',revision:state.revision,summary:'Discovery and implementation with optional support excluded.'}]);const revisedState=live?await service.run({action:'read'},'',`boundary-${index}`):revised.results[0];assert.deepEqual(revisedState.review.proposal.totals,state.review.proposal.totals);
  assert.equal(state.artifacts.completeness,'complete',state.warning);if(real)await writeFile(join(out,'proposal.pdf'),await readFile(state.files['proposal.pdf']));
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('boundary normalization does not accept invented optional prices, labels or excluded purchases',async()=>{
 const root=await mkdtemp(join(tmpdir(),'boundary-negative-'));const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('STUB'));const studio=await studioSignals(service,false,false,'boundary-negative');
 try{
  for(const kind of ['price','label','selection']){
   const op=JSON.parse(JSON.stringify(calls[0]));
   if(kind==='price')op.changes[9].draft.assumptions=['Optional support at €999/month is available but excluded from the committed price.'];
   if(kind==='label')op.changes[4].name.value='Optional Support Premium (monthly)';
   if(kind==='selection')op.changes.splice(9,0,{action:'select',productId:'support-monthly',quantity:1,quote:'one discovery workshop'});
   const response=await studio.turn(message,[op],true);assert.equal(response.results[0].ok,false,kind);
   const state=await service.run({action:'read'},'','boundary-negative');assert.equal(state.revision,0);assert.equal(state.products.length,0);
  }
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
