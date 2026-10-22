import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {verifyPreview} from '../src/services/artifacts.js';
import {studioSignals} from './helpers/studio-signals.js';
import {acmeMessage,acmeChanges,acmeDraft} from './helpers/acme.js';

test('Acme Studio signals generate real Chromium PDF and accessible complete artifacts', {timeout:30000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'acme-real-pdf-'));
 const service=new ProposalService(new WorkspaceStore(root));
 const studio=await studioSignals(service);
 try{
  await studio.turn(acmeMessage,[{action:'batch',revision:0,changes:acmeChanges.map(op=>op.action==='product'?{...op,price:{...op.price,value:op.id==='licenses'?'25.00':'500.00'}}:op)}]);
  const first=await service.run({action:'read'},'','acme');
  await studio.turn('1 onboarding package.',[{action:'batch',revision:first.revision,changes:[{action:'select',productId:'onboarding',quantity:1,quote:'1 onboarding package.'},{action:'draft',draft:acmeDraft}],generate:true}]);
  const state=await service.run({action:'read'},'','acme');
  assert.equal(state.artifacts?.completeness,'complete','Actual Chromium PDF required');
  assert.equal((await verifyPreview(state.artifacts.directory)).completeness,'complete');
  const response=await studio.app.request(new URL(state.previews!['proposal.pdf']!).pathname);
  assert.equal(response.status,200);
  assert.ok((await response.arrayBuffer()).byteLength>1000);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
