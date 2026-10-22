import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
import {cases} from './fixtures/release-candidate.js';
const fact=(value:string)=>({value,quote:value});
const real=process.env.PROPOSAL_TEST_REAL_PDF==='1';
const report=resolve('data/qa/release-candidate',real?'real':'scripted');
for(const c of cases)test(`RC ${c.id}: ${c.seller}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'rc-'));const service=new ProposalService(new WorkspaceStore(root),real?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));
 const studio=await studioSignals(service,false,false,`rc-${c.id}`);
 const currency='currency' in c?c.currency:'USD';const symbol=currency==='EUR'?'€':'$';
 const hypothetical='hypothetical' in c&&c.hypothetical;
 const text=`I represent ${c.seller}. Prepare a proposal for ${c.customer}. ${c.need} `+c.products.map(p=>`${hypothetical?'I authorize a hypothetical estimate for ':''}${p.name} at ${symbol}${p.price} per ${p.unit} ${p.billing==='monthly'?'per month':'one-time'}. Use ${p.name}, quantity ${p.quantity}.`).join(' ');
 const draft={summary:c.need,needs:[{text:c.need,evidenceQuote:c.need}],recommendations:c.products.map(p=>({productId:p.id,quantity:p.quantity,rationale:`Provide the requested ${p.name}.`,evidenceQuote:`Use ${p.name}, quantity ${p.quantity}`})),timeline:[],assumptions:[],openQuestions:[],nextStep:'Review the proposed scope.'};
 const changes=[{action:'start',mode:'custom'},{action:'seller',fields:[{field:'name',...fact(c.seller)}]},{action:'customer',fields:[{field:'company',...fact(c.customer)}]},...c.products.flatMap(p=>[{action:'product',id:p.id,name:fact(p.name),price:{value:String(p.price),quote:`${symbol}${p.price} per ${p.unit} ${p.billing==='monthly'?'per month':'one-time'}`,currency,basis:hypothetical?'hypothetical':'verified'},billing:{value:p.billing,quote:p.billing==='monthly'?'per month':'one-time'},unitLabel:fact(p.unit)},{action:'select',productId:p.id,quantity:p.quantity,quote:`Use ${p.name}, quantity ${p.quantity}`}]),{action:'draft',draft}];
 try{
  const result=await studio.turn(text,[{action:'batch',revision:0,changes,generate:true}]);let state=result.results[0];
  assert.equal(state.review.proposal.totals.monthlyCents,c.monthly);assert.equal(state.review.proposal.totals.firstYearCents,c.year);
  assert.equal(state.artifacts.completeness,'complete',state.warning);
  await mkdir(join(report,c.id),{recursive:true});
  for(const name of ['proposal.html','email.html','design.json','proposal.json','proposal.pdf']){
   const bytes=await readFile(state.files[name]);await writeFile(join(report,c.id,name),bytes);
   assert.equal((await studio.app.request(new URL(state.previews[name]).pathname)).status,200);
   if(name.endsWith('.html')){const html=bytes.toString();assert.ok(html.includes(c.customer));assert.ok(html.includes(c.seller));assert.ok(html.includes(symbol)); for(const cents of [c.monthly,c.year].filter(value=>value>0)){const amount=new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:0}).format(cents/100);assert.ok(html.includes(amount),`${name}: missing ${amount}`);}}
  }
  for(const p of c.products)assert.equal(state.review.proposal.lineItems.find((x:{productId:string})=>x.productId===p.id).unitPriceCents,p.price*100);
  if('revisionQuantity' in c){const p=c.products[0];const quote=`Use ${p.name}, quantity ${c.revisionQuantity}`;
   const revision=await studio.turn(`${quote}. Regenerate.`,[{action:'batch',revision:state.revision,changes:[{action:'select',productId:p.id,quantity:c.revisionQuantity,quote},{action:'draft',draft:{...draft,recommendations:[{...draft.recommendations[0],quantity:c.revisionQuantity,evidenceQuote:quote}]}}],generate:true}]);state=revision.results[0];assert.equal(state.review.proposal.totals.monthlyCents,c.revisionMonthly);assert.equal(state.review.proposal.totals.firstYearCents,c.revisionYear);
  }
  const concise=await studio.turn('Shorten the executive summary without altering commercial terms.',[{action:'reviseNarrative',revision:state.revision,summary:'A focused proposal for the requested scope.'}]);assert.deepEqual(concise.results[0].review.proposal.totals,state.review.proposal.totals);
  for(const name of ['proposal.html','email.html'])assert.match(await readFile(concise.results[0].files[name],'utf8'),/A focused proposal/);
  const isolated=await studioSignals(service,false,false,`rc-${c.id}-isolated`);try{const fresh=await isolated.turn('What customer information is saved?',[{action:'read'}]);assert.ok(!JSON.stringify(fresh.results).includes(c.customer));}finally{await isolated.close();}
  await writeFile(join(report,c.id,'execution.json'),JSON.stringify({type:'scripted provider, real Studio signals',pdf:real?'real Chromium':'STUB — not PDF acceptance',text,toolCalls:result.toolCalls,latencyMs:result.latencyMs,transcript:result.text,expected:{monthly:c.monthly,year:c.year}},null,2));
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
for(const [id,message,price] of [['E','RC Copper Systems offers Bespoke Integration with Contact Sales pricing to RC Pine Shipping.','100'],['F','RC Reed Partners offers Discovery Sprint to RC Stone Foods; no price has been supplied.','400'],['H','RC Violet Labs sells Review Desk at $45 per month to RC Elm Goods. Do not change this price.','30']] as const)test(`RC ${id}: missing or unauthorized price rejected`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'rc-negative-'));const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('STUB'));const studio=await studioSignals(service,false,false,`rc-${id}`);
 try{const result=await studio.turn(message,[{action:'batch',revision:0,changes:[{action:'start',mode:'custom'},{action:'product',id:'item',price:{value:price,currency:'USD',quote:message},billing:{value:'monthly',quote:message}}],generate:false}],true);assert.equal(result.results[0].ok,false);const state=await service.run({action:'read'},'',`rc-${id}`);assert.equal(state.products.length,0);await mkdir(report,{recursive:true});await writeFile(join(report,`${id}.json`),JSON.stringify({message,result},null,2));}finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
