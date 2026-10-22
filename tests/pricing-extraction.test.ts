import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from './helpers/studio-signals.js';
import {acmeMessage,acmeChanges,acmeDraft} from './helpers/acme.js';

for(const representation of ['decimal','short-quote'] as const)test(`Acme Studio batch persists USD prices with ${representation}`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'pricing-signal-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
 const studio=await studioSignals(service);
 try{
  const changes=acmeChanges.map(op=>op.action==='product'?{...op,price:op.id==='licenses'?{value:representation==='decimal'?'25.00':'25',quote:representation==='decimal'?'$25 per user per month':'25'}:{value:representation==='decimal'?'500.00':'500',quote:representation==='decimal'?'a one-time fee of $500':'500'}}:op);
  await studio.turn(acmeMessage,[{action:'batch',revision:0,changes}]);
  let state=await service.run({action:'read'},'','acme');
  assert.deepEqual(state.products.map(p=>[p.unitPriceCents,p.billing]),[[2500,'monthly'],[50000,'once']]);
  await studio.turn('1 onboarding package.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'onboarding',quantity:1,quote:'1 onboarding package.'},{action:'draft',draft:acmeDraft}],generate:true}]);
  state=await service.run({action:'read'},'','acme');
  assert.deepEqual(state.review?.proposal.totals,{monthlyCents:50000,oneTimeCents:50000,firstMonthCents:100000,firstYearCents:650000});
  assert.equal(state.artifacts?.completeness,'complete');
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

import {workspaceOperationSchema} from '../src/assistant/contracts.js';
import {unitPrice} from '../src/assistant/price.js';
test('price normalization preserves exact amounts and rejects ambiguous, unsupported or borrowed evidence',()=>{
 const product={action:'product',id:'licenses',price:{value:'25.00',quote:'$25'}};
 assert.equal(workspaceOperationSchema.safeParse({action:'batch',revision:0,changes:[product]}).success,true);
 assert.equal(workspaceOperationSchema.safeParse({action:'batch',revision:0,changes:[{...product,price:{value:25,quote:'$25'}}]}).success,false,'Numeric values fail schema validation, not currency evidence validation');
 for(const [value,quote,message,expected] of [
  ['25.00','$25','$25',2500],['25','$25.00','$25.00',2500],
  ['500.00','500','one-time fee of $500.',50000],['25','25','USD 25 per month',2500],
  ['25','US$25','US$25 per month',2500],['25.50','$ 25.50','$ 25.50',2550],
  ['1250','USD 1,250.00','USD 1,250.00 per month',125000],
 ] as const)assert.equal(unitPrice(value,quote,message),expected);
 for(const [value,quote,message] of [
  ['25','25 licenses','25 licenses and onboarding for $500'],
  ['25','25','25 licenses and software for $25'],
  ['25','$250','$250'],['25.50','$25','$25'],['25','$25','$500'],
  ['25','$25 or $500','$25 or $500'],['25','25','25 per user per month'],
  ['25','$25','CAD $25'],['25','$25','C$25'],['25','$25','$25 CAD'],
  ['25','$25','$25 Canadian dollars'],['25','€25','€25'],
  ['25','$25.001','$25.001'],['25','25 dollars','-25 dollars'],['25','$25e3','$25e3'],['25','$25','MXN $25'],['25','$25','Canadian dollars: $25'],['25','25','500 dollars and 25 users'],
 ] as const)assert.throws(()=>unitPrice(value,quote,message),`${quote} / ${message}`);
});

test('Studio batch price errors identify the field and allow corrected same-turn retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'pricing-retry-'));
 const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nSTORAGE TEST ONLY'));
 const studio=await studioSignals(service);
 try{
  const bad=acmeChanges.map(op=>op.action==='product'&&op.id==='licenses'?{...op,price:{value:'99',quote:'$25'}}:op);
  const response=await studio.turn(acmeMessage,[{action:'batch',revision:0,changes:bad},{action:'batch',revision:0,changes:acmeChanges}],true);
  assert.equal(response.results[0].ok,false);assert.equal(response.results[0].code,'MISSING_EVIDENCE');assert.equal(response.results[0].priceCode,'PRICE_EVIDENCE');
  assert.equal(response.results[0].field,'price');assert.equal(response.results[0].productId,'licenses');assert.match(response.results[0].error,/unit price/);
  assert.match(response.results[0].guidance,/same revision/);
  assert.equal(response.results[1].ok,true);
  const state=await service.run({action:'read'},'','acme');
  assert.equal(state.products[0]?.unitPriceCents,2500);
  assert.equal(state.products[1]?.unitPriceCents,50000);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});


test('starting-price qualifications cannot be cropped from human evidence',()=>{
 assert.throws(()=>unitPrice('90','€90','From €90 per license per month',false,'EUR'),/Starting/);
 assert.equal(unitPrice('90','€90','I authorize a hypothetical estimate from €90 per license per month',false,'EUR',true),9000);
});
