import {parseArgs} from 'node:util';
/** Interactive real-URL + real-model acceptance. Never auto-confirms commercial data. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {studioSignals} from '../tests/helpers/studio-signals.js';
import {fetchWebsite,websiteText} from '../src/assistant/website-fetch.js';
const {values}=parseArgs({options:{'screenshot':{type:'string'},'fetch-only':{type:'boolean'},'seller-url':{type:'string'},'pricing-url':{type:'string'},'customer-url':{type:'string'},'seller-name':{type:'string'},'customer-name':{type:'string'}}});
// Defaults are one acceptance example, never production extraction rules.
const urls=[values['seller-url']??'https://unlayer.com/',values['pricing-url']??'https://unlayer.com/pricing',values['customer-url']??'https://lovable.dev/'];
if(values['fetch-only']) {
 let failed=false;
 for(const url of urls)try {const page=await fetchWebsite(url);console.log(JSON.stringify({url:page.url,retrievedAt:page.retrievedAt,partial:Boolean(page.partial),readableCharacters:websiteText(page.html).length}));}catch(error){failed=true;console.error(JSON.stringify({url,error:error instanceof Error?error.message:'Fetch failed'}));}
 if(failed)process.exitCode=1;
} else {
 if(!process.env.OPENAI_API_KEY)throw new Error('Set OPENAI_API_KEY. Use --fetch-only to test secure fetching without AI.');
 await mkdir(resolve('data/qa/website'),{recursive:true,mode:0o700});
 const root=await mkdtemp(resolve('data/qa/website/run-'));
 console.log('QA data directory:',root);
 const service=new ProposalService(new WorkspaceStore(root));
 let studio=await studioSignals(service,true,false,'website-live',undefined,true);
 const terminal=createInterface({input:stdin,output:stdout});
 let message=`Discover seller ${values['seller-name']??''} ${urls[0]} and pricing ${urls[1]} for customer ${values['customer-name']??''} ${urls[2]}. Extract website candidates and prepare catalog review before importing prices. Do not infer customer buying priorities.`;
 try {
  for(let turn=0;turn<12;turn++) {
   const image=turn===0&&values.screenshot?await readFile(resolve(values.screenshot)):undefined;
   if(image&&image.length>1_000_000)throw new Error('Screenshot exceeds 1 MB.');
   const files=image?[{data:`data:image/${/\.png$/i.test(values.screenshot!)?'png':'jpeg'};base64,${image.toString('base64')}`,mediaType:/\.png$/i.test(values.screenshot!)?'image/png':'image/jpeg'}]:undefined;
   const result=await studio.turn(message,[],true,'',files);
   const memory=(await studio.agent.getMemory())!;await memory.settled();
   const history=await memory.recall({threadId:'website-live',perPage:false});
   const answer=[...history.messages].reverse().find(m=>m.role==='assistant'&&m.content.parts.some(p=>p.type==='text'&&p.text.trim()));
   console.log(answer?.content.parts.filter(p=>p.type==='text').map(p=>p.text).join('\n')??'No assistant text. Inspect reported tool errors.');
   for(const item of result.results)if(item.ok===false||item.error===true)console.log(JSON.stringify({toolError:typeof item.error==='string'?item.error:item.message,guidance:item.guidance}));
   const workspace=await service.store.read();const website=workspace.websites[service.store.sessionKey('website-live')];
   console.log(JSON.stringify({diagnostic:{toolCalls:result.toolCalls,latencyMs:result.latencyMs,storedSources:website?.sources.length??0,reviewPersisted:Boolean(website?.review),pendingApprovalPresented:website?.pendingApproval?.presented??false,approvedCandidateIds:website?.approvals.flatMap(a=>a.candidateIds??[])??[]}}));
   if(website?.review)console.log(JSON.stringify({candidates:website.review.products.map((p,i)=>({position:i+1,id:p.id,name:p.name,model:p.price.model,eligible:p.price.kind==='fixed',price:p.price.amountCents,currency:p.price.currency,billing:p.price.billing}))},null,2));
   const state=await service.run({action:'read'},'','website-live');
   if(!website?.approvals.length)assert.ok(state.products.every(p=>p.priceBasis==='hypothetical'&&p.assumption),'Catalog became authoritative without website approval or explicit hypothetical authorization');
   if(state.artifacts?.current) {
    assert.equal(state.artifacts.completeness,'complete','Real PDF required for live acceptance');
    assert.ok(website?.approvals.length||state.products.every(p=>p.priceBasis==='hypothetical'&&p.assumption),'Confirmed catalog or authorized hypothetical estimate expected');
    for(const file of ['proposal.pdf','proposal.html','email.html','design.json']){assert.ok((await readFile(join(state.artifacts.directory,file))).length);assert.equal((await studio.app.request(new URL(state.previews![file]!).pathname)).status,200);}
    console.log(JSON.stringify({verified:'LIVE model + real websites + real renderer',totals:state.review?.proposal.totals,previews:state.previews,artifacts:state.artifacts.directory},null,2));break;
   }
   const reply=await terminal.question('Review candidates, clarify currency/needs/quantities, or approve named eligible plans (or all eligible fixed-price plans). :restart tests persistence; :quit exits without acceptance.\n> ');
   if(reply===':quit')break;
   if(reply===':restart') {
    await studio.close();studio=await studioSignals(new ProposalService(new WorkspaceStore(root)),true,false,'website-live',undefined,true);
    message='Resume the saved website discovery and catalog review. Do not refetch or change confirmed facts.';
   } else message=reply;
  }
 } finally {terminal.close();await studio.close();}
}
