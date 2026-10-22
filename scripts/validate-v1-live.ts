/** Real provider + actual Studio signal handlers + real Chromium. No scripted tool calls. */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from '../tests/helpers/studio-signals.js';
const base=resolve('data/qa/v1-live');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'run-'));
const alarm=setTimeout(()=>{console.error('BLOCKED: live diagnostic timed out. No acceptance claimed.');process.exit(2);},1_200_000);alarm.unref();
const service=new ProposalService(new WorkspaceStore(root));const report:Array<unknown>=[];
async function scenario(id:string,turns:Array<{text:string;monthly?:number;once?:number;year?:number;research?:boolean;files?:Array<{data:string;mediaType:string}>}>){
 const studio=await studioSignals(service,true,false,id,undefined,true);
 try{for(const turn of turns){const result=await studio.turn(turn.text,[],true,'',turn.files);const state=await service.run({action:'read'},'',id);
  if(turn.research){assert.equal(state.artifacts,undefined);}
  else {assert.equal(state.artifacts?.completeness,'complete',result.results.filter(r=>r.status!=='complete').map(r=>r.error).join('; ')||state.warning||'No completed proposal');assert.equal(state.review!.proposal.totals.monthlyCents,turn.monthly);assert.equal(state.review!.proposal.totals.oneTimeCents,turn.once);assert.equal(state.review!.proposal.totals.firstYearCents,turn.year);
   for(const file of ['proposal.pdf','proposal.html','email.html']){assert.ok((await readFile(state.files![file]!)).length);assert.equal((await studio.app.request(new URL(state.previews![file]!).pathname)).status,200);}
  }
  report.push({id,status:'PASS',toolCalls:result.toolCalls,latencyMs:result.latencyMs,artifacts:state.files});await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(`${id}: PASS (real model/Chromium)`);
 }}catch(error){report.push({id,status:'FAIL',reason:error instanceof Error?error.message:'Unknown error'});await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.error(`${id}: FAIL; inspect local report. No acceptance claimed.`);process.exitCode=1;}finally{await studio.close();}
}
await scenario('A',[{text:'Northstar Advisory proposes one Discovery at €3,000 one-time and one Implementation at €12,000 one-time for Meridian Logistics. Implementation has three milestones over eight weeks. Support at €1,500/month is optional and excluded. Generate the proposal now.',monthly:0,once:1500000,year:1500000}]);
await scenario('B-C-F-G',[
 {text:'Seller: Cedar Software. Customer: Otter Freight. Dispatch costs $32 per seat per month. Use 100 Dispatch seats for weekly coordination. Create a proposal.',monthly:320000,once:0,year:3840000},
 {text:'Increase Dispatch to 1000 seats and regenerate.',monthly:3200000,once:0,year:38400000},
 {text:'Change Dispatch to 120 seats and regenerate.',monthly:384000,once:0,year:4608000},
 {text:'Shorten the summary without changing any commercial terms.',monthly:384000,once:0,year:4608000},
]);
await scenario('D',[{text:'Research only. Inspect https://openai.com/business/pricing/ for published pricing. Do not generate or approve anything. Explain any inaccessible or ambiguous prices.',research:true}]);
const screenshot=process.argv[process.argv.indexOf('--screenshot')+1];
if(process.argv.includes('--screenshot')&&screenshot){const data=await readFile(resolve(screenshot));await scenario('E',[
 {text:'Seller: Example Screenshot Seller. Customer: Example Buyer. Inspect this pricing screenshot only. Do not generate yet.',research:true,files:[{data:`data:image/png;base64,${data.toString('base64')}`,mediaType:'image/png'}]},
 {text:'I authorize a hypothetical estimate for Premium at €105 per month. Use 100 Premium seats. Generate a proposal; do not claim official website verification.',monthly:1050000,once:0,year:12600000},
]);}else{report.push({id:'E',status:'BLOCKED',reason:'Supply a real PNG pricing screenshot with --screenshot /absolute/path.png'});process.exitCode=1;}
await scenario('H',[{text:'Copper Learning offers one Safety Workshop at $1800 one-time for Willow Manufacturing. They need a workshop to review their existing checklist. Create the proposal.',monthly:0,once:180000,year:180000}]);
await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(`Local evidence: ${root}`);clearTimeout(alarm);
