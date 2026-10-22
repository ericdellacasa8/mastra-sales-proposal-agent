/** Fictional scenario only. Opt-in diagnostics must not be used with private inputs. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from '../tests/helpers/studio-signals.js';
import {flowMessage,flowChanges,flowDraft} from '../tests/helpers/flowsync.js';
const live=process.argv.includes('--live'),stub=process.argv.includes('--storage-stub');
if(live&&stub)throw new Error('Live acceptance requires real PDF rendering.');
if(live&&!process.env.OPENAI_API_KEY)throw new Error('Configure OPENAI_API_KEY.');
await mkdir(resolve('data/qa/flowsync'),{recursive:true,mode:0o700});
const root=await mkdtemp(resolve('data/qa/flowsync/run-'));
const service=new ProposalService(new WorkspaceStore(root),stub?async()=>Buffer.from('%PDF-1.7\nSTORAGE STUB'):undefined);
const studio=await studioSignals(service,live,true,'flowsync');
async function verifyLiveReply() {
 if(!live)return;
 const memory=(await studio.agent.getMemory())!;await memory.settled();
 const history=await memory.recall({threadId:'flowsync',perPage:false});
 const answer=[...history.messages].reverse().find(m=>m.role==='assistant'&&m.content.parts.some(p=>p.type==='text'&&p.text.trim()));
 const text=answer?.content.parts.filter(p=>p.type==='text').map(p=>p.text).join(' ') ?? '';
 for(const file of ['proposal.pdf','proposal.html','email.html'])assert.ok(text.includes(file),`Final assistant response omitted ${file}`);
 assert.doesNotMatch(text,/contract|invoice|onboarding/i,'FlowSync has no contract/invoice capability or onboarding catalog item');
 assert.doesNotMatch(text,/cannot send|can't send|can’t send|delivery.*approval|email delivery/i,'No delivery request was made');
}
try {
 const result=await studio.turn(flowMessage,[{action:'batch',revision:0,changes:[...flowChanges,{action:'draft',draft:flowDraft}],generate:true}],true);
 let state=await service.run({action:'read'},'','flowsync');
 assert.equal(state.review?.proposal.totals.monthlyCents,206000,'Expected $2,060/month');
 assert.equal(state.review?.proposal.totals.firstYearCents,2472000,'Expected $24,720 first year');
 assert.equal(state.seller.name,'FlowSync');assert.equal(state.customer.company,'Northstar Logistics');
 assert.equal(state.artifacts?.completeness,'complete','PDF required');
 for(const file of ['email.html','proposal.pdf','design.json']) {
  assert.ok((await readFile(join(state.artifacts.directory,file))).length);
  assert.equal((await studio.app.request(new URL(state.previews![file]!).pathname)).status,200);
 }
 for(const file of ['email.html','proposal.html','design.json']) {
  const text=await readFile(join(state.artifacts.directory,file),'utf8');
  for(const expected of ['FlowSync','Northstar Logistics','$2,060'])assert.ok(text.includes(expected));
 }
 await verifyLiveReply();
 if(process.argv.includes('--revise')) {
  await studio.turn('Increase Enterprise licenses to 45, keeping 10 Standard licenses.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'enterprise',quantity:45,quote:'Increase Enterprise licenses to 45'},{action:'draft',draft:{...flowDraft,recommendations:flowDraft.recommendations.map(r=>r.productId==='enterprise'?{...r,quantity:45}:r)}}],generate:true}],true);
  state=await service.run({action:'read'},'','flowsync');
  await verifyLiveReply();
  const before=state;
  await studio.turn('Rewrite the executive summary and benefits around the three previously supplied customer priorities, without changing products, quantities or pricing. Save and regenerate the proposal.',[{action:'reviseNarrative',revision:state.revision,summary:'FlowSync for Northstar Logistics: focus on reducing manual processes, improving operational visibility, and coordinating workflows between teams.'}],true);
  state=await service.run({action:'read'},'','flowsync');
  for(const field of ['seller','customer','products','selections','notes','terms'] as const)assert.deepEqual(state[field],before[field]);
  assert.equal(state.review?.proposal.totals.monthlyCents,294500);
  assert.equal(state.review?.proposal.totals.firstYearCents,3534000);
  assert.notEqual(state.artifacts?.directory,before.artifacts?.directory);
  assert.notEqual(state.draft?.summary,before.draft?.summary);
  await verifyLiveReply();
  assert.equal(state.artifacts?.completeness,'complete');
  for(const file of ['email.html','proposal.html','design.json'])assert.ok((await readFile(join(state.artifacts!.directory,file),'utf8')).includes(state.draft!.summary));
 }
 console.log(JSON.stringify({provider:live?'LIVE OpenAI':'scripted replay of observed failure shape',pdf:stub?'STORAGE STUB':'real',toolCalls:result.toolCalls,latencyMs:result.latencyMs,artifacts:state.artifacts.directory}));
} finally {await studio.close();}
