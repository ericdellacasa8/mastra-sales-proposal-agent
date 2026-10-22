import {test} from 'node:test';
import {selectionSpan} from '../src/assistant/selection.js';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProposalService} from '../src/assistant/service.js';
import {WorkspaceStore} from '../src/assistant/store.js';
import {WebsiteDiscovery,approvedCandidates} from '../src/assistant/website-discovery.js';
import {studioSignals} from './helpers/studio-signals.js';
import {verifyPreview} from '../src/services/artifacts.js';
import {websiteText} from '../src/assistant/website-fetch.js';
const scenarios=[
 {file:'saas',seller:'Harbor Suite',names:['Team','Business','Archive Add-on','Annual Saver','Custom'],approval:'Approve the first three plans.',expected:[2400,6000,1000],models:['per-seat-subscription','monthly-subscription','monthly-subscription','conditional-annual-discount','custom']},
 {file:'consulting',seller:'Juniper Advisory',names:['Consulting Assessment','Workshop','Specialist Hours','Delivery Days'],approval:'Approve the consulting assessment but not the workshops.',expected:[180000],models:['one-time','one-time','hourly-rate','daily-rate']},
 {file:'agency',seller:'Prism Studio',names:['Editorial Retainer','Launch Project','Advertising Spend'],approval:'Approve the monthly subscription, but exclude the advertising spend.',expected:[240000],models:['retainer','one-time','custom']},
 {file:'mixed',seller:'Fieldworks Supply',names:['Sensor','Telemetry','Bulk Sensors','Tiered Storage','Regional Kit','Welcome Package','Unpriced Kit'],approval:'Approve Sensor.',expected:[4500],models:['per-unit','usage','volume','tiered','per-unit','promotional','unknown']},
];
for(const scenario of scenarios)test(`generic ${scenario.file}: Studio discovery → persisted review → natural approval → renderer`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'generic-web-'));const service=new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nTEST STORAGE STUB'));
 const url=`https://${scenario.file}.example/pricing`,thread=`generic-${scenario.file}`;
 const html=await readFile(new URL(`./fixtures/websites/general/${scenario.file}.html`,import.meta.url),'utf8');
 const fetch=async()=>({url,requestedUrl:url,html,retrievedAt:new Date().toISOString()});
 let studio=await studioSignals(service,false,false,thread,fetch);
 try{
  const prepared=await studio.turn(`Seller ${scenario.seller}; pricing ${url}. Customer Cedar Company.`,[{website:{action:'fetch',url,role:'pricing'}},{website:{action:'review',seller:{value:scenario.seller,quote:`Seller ${scenario.seller}`},customer:{value:'Cedar Company',quote:'Customer Cedar Company'},products:scenario.names.map(name=>({name:{url,value:name}}))}}]);
  const review=prepared.results.at(-1).review;
  assert.deepEqual(review.products.map((p:{price:{model:string}})=>p.price.model),scenario.models);
  assert.equal((await service.run({action:'read'},'',thread)).products.length,0);
  for(const p of review.products){assert.ok(p.sourceHash);assert.equal(p.sourceUrl,url);assert.ok(p.retrievedAt);assert.ok(websiteText(html).includes(p.price.quote));}
  // Close and reopen the real signal runtime/Memory, backed by the same persisted files.
  await studio.close();studio=await studioSignals(new ProposalService(new WorkspaceStore(root),async()=>Buffer.from('%PDF-1.7\nTEST STORAGE STUB')),false,false,thread,fetch);
  const approved=await studio.turn(scenario.approval,[{website:{action:'confirm'}}]);
  const products=approved.results[0].products;
  assert.deepEqual(products.map((p:{unitPriceCents:number})=>p.unitPriceCents),scenario.expected);
  assert.equal((await service.run({action:'read'},'','other-thread')).products.length,0);
  const note=`Cedar Company needs a scoped pilot. Include 2 ${products[0].name}.`;
  const current=await service.run({action:'read'},'',thread);
  const draft={headline:'A scoped pilot for Cedar Company',summary:'The requested pilot scope.',needs:[{text:'A scoped pilot',evidenceQuote:'Cedar Company needs a scoped pilot.'}],recommendations:[{productId:products[0].id,quantity:2,rationale:'Included in the requested pilot.',evidenceQuote:`Include 2 ${products[0].name}.`}],timeline:[],assumptions:[],openQuestions:[],nextStep:'Review the pilot scope.'};
  const generated=await studio.turn(note,[{action:'batch',revision:current.revision,changes:[{action:'notes',text:note},{action:'select',productId:products[0].id,quantity:2,quote:`Include 2 ${products[0].name}.`},{action:'draft',draft}],generate:true}]);
  for(const label of ['PDF proposal','HTML proposal','HTML email'])assert.ok(generated.results.at(-1).previewMarkdown.includes(`[${label}]`));
  const final=await service.run({action:'read'},'',thread);
  assert.equal(final.review!.proposal.totals.firstYearCents,scenario.expected[0]!*2*(products[0].billing==='monthly'?12:1));
  for(const file of ['proposal.pdf','proposal.html','email.html','design.json'])assert.equal((await studio.app.request(new URL(final.previews![file]!).pathname)).status,200);
  // All website catalogs converge on the same flat creation/revision operation.
  const revised=await studio.turn(`Increase ${products[0].name} to 3 units and regenerate the proposal.`,[{save:{offerings:[{name:products[0].name,quantity:3}]}}]);
  assert.equal(revised.results[0].review.proposal.totals.firstYearCents,scenario.expected[0]!*3*(products[0].billing==='monthly'?12:1));
  for(const label of ['PDF proposal','HTML proposal','HTML email'])assert.ok(revised.results[0].previewMarkdown.includes(`[${label}]`));

 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('reported approval, exclusions and corrupted evidence through actual Studio tools',async()=>{
 const root=await mkdtemp(join(tmpdir(),'approval-repro-'));const service=new ProposalService(new WorkspaceStore(root));
 const url='https://unknown.example/pricing';
 const names=['Launch','Scale','Optimize','Free','Enterprise','Credit Add-ons'];
 const html=names.map((name,i)=>`<section><h2>${name}</h2><p>${i<3?`USD ${[250,750,2000][i]} per month.`:i===3?'USD 0 once.':'Contact Sales.'}</p><p>Published scope.</p></section>`).join('');
 const studio=await studioSignals(service,false,false,'reported',async()=>({url,requestedUrl:url,html,retrievedAt:new Date().toISOString()}));
 try{
  const initial=`Seller Example Company ${url}; customer Cedar.`;
  const failed=await studio.turn(initial,[{website:{action:'fetch',url,role:'pricing'}},{action:'batch',revision:0,changes:[{action:'start',mode:'custom'},{action:'product',id:'launch',name:{value:'Launch',quote:'Launch\nUSD 250 per month.'},price:{value:'250',quote:'USD 250 per month.'},billing:{value:'monthly',quote:'USD 250 per month.'}}]},{website:{action:'confirm'}}],true);
  assert.match(failed.results[1].error,/captured salesperson/);
  assert.match(failed.results[1].guidance,/websiteDiscovery/);
  assert.match(failed.results[2].error,/Catalog review is missing/);
  assert.equal((await service.run({action:'read'},'','reported')).products.length,0);
  const prepared=await studio.turn('Recover the catalog from the fetched page.',[{website:{action:'fetch',url,role:'pricing'}},{website:{action:'review',seller:{value:'Example Company',quote:'Seller Example Company'},products:names.map(name=>({name:{url,value:name},terms:{url,quote:'Published scope.'}}))}}]);
  // Same incomplete terms pattern as the recorded failure: server recovers complete named source blocks.
  const review=prepared.results.at(-1).review;
  const approval="Approve Launch, Scale, and Optimize at the published monthly prices. Don't import Free, Enterprise, or any credit add-ons for now.";
  assert.deepEqual(approvedCandidates(approval,review).map(p=>p.name),names.slice(0,3));
  assert.throws(()=>approvedCandidates('Approve the subscription',review),/Which catalog/);
  const descriptorReview={...review,products:[review.products[0],{...review.products[1],name:'Credit Add-on',price:{...review.products[1].price,quote:'Credit Add-on USD 750 monthly.'}}]};
  assert.deepEqual(approvedCandidates('Approve the monthly subscription, but exclude the add-ons.',descriptorReview).map(p=>p.name),['Launch']);
  assert.throws(()=>approvedCandidates('Approve Launch at USD 1',review),/Which catalog/);
  const key=service.store.sessionKey('reported');
  const original=await service.store.read();
  await service.store.update(async w=>{w.websites[key]!.review!.products[0]!.price.amountCents=1;});
  const corrupted=await studio.turn(approval,[{website:{action:'confirm'}}],true);assert.match(corrupted.results[0].error,/no longer matches/);
  assert.equal((await service.run({action:'read'},'','reported')).products.length,0);
  await service.store.update(async w=>{w.websites[key]=structuredClone(original.websites[key]!);w.websites[key]!.sources=[];});
  const missing=await studio.turn(approval,[{website:{action:'confirm'}}],true);assert.match(missing.results[0].error,/missing or corrupted/);
  await service.store.update(async w=>{w.websites[key]=structuredClone(original.websites[key]!);});
  const imported=await studio.turn(approval,[{website:{action:'confirm'}}]);
  assert.deepEqual(imported.results[0].products.map((p:{unitPriceCents:number})=>p.unitPriceCents),[25000,75000,200000]);
  assert.deepEqual(imported.results[0].unapproved.map((p:{name:string})=>p.name),names.slice(3));
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('stored line ranges resolve repeated headings without copied evidence; invalid spans cannot borrow another plan price',async()=>{
 const root=await mkdtemp(join(tmpdir(),'web-spans-'));const service=new ProposalService(new WorkspaceStore(root));
 const url='https://catalog.example/prices',thread='spans',turn={messageId:'source-turn',resource:'owner'};
 const message=`Seller Example ${url}`;
 const html='<h1>Standard</h1><p>Comparison header</p><h2>Standard</h2><p>USD 20 monthly.</p><h2>Extended</h2><p>USD 50 monthly. Includes Standard features.</p>';
 const discovery=new WebsiteDiscovery(service.store,async()=>({url,requestedUrl:url,html,retrievedAt:new Date().toISOString()}));
 try{
  await service.capture(turn,message,thread);await discovery.run({action:'fetch',url,role:'pricing'},message,thread,turn);
  const base={action:'review',seller:{value:'Example',quote:'Seller Example'}};
  const ambiguous=await discovery.run({...base,products:[{name:{url,value:'Standard'}}]},message,thread,turn);
  assert.ok('review' in ambiguous&&ambiguous.review);assert.equal(ambiguous.review.products[0]?.price.kind,'ambiguous');
  await assert.rejects(discovery.run({...base,products:[{name:{url,value:'Standard'},terms:{url,startLine:5,endLine:6}}]},message,thread,turn),/complete, bounded/);
  await assert.rejects(discovery.run({...base,products:[{name:{url,value:'Standard'},terms:{url,startLine:3,endLine:900}}]},message,thread,turn),/Invalid source line/);
  const result=await discovery.run({...base,products:[{name:{url,value:'Standard'},terms:{url,startLine:3,endLine:4}}]},message,thread,turn);
  assert.ok('review' in result&&result.review);assert.equal(result.review.products[0]?.price.amountCents,2000);
  const id=result.review.products[0]!.id;
  await discovery.run({action:'fetch',url,role:'pricing'},message,thread,turn);
  const saved=await service.store.read();assert.equal(saved.websites[service.store.sessionKey(thread)]!.review!.products[0]!.id,id,'Same content fetch cannot erase stored review');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('synthetic HarborLedger schema and discovery failures → pending yes → Scale-only artifacts → narrative revision',async()=>{
 const root=await mkdtemp(join(tmpdir(),'medallia-repro-'));
 const realPDF=process.env.PROPOSAL_TEST_REAL_PDF==='1';
 const makeService=()=>new ProposalService(new WorkspaceStore(root),realPDF?undefined:async()=>Buffer.from('%PDF-1.7\nTEST STORAGE STUB'));
 let service=makeService();
 const thread='medallia-repro',sellerUrl='https://cedarcanvas.example.com/',customerUrl='https://www.harborledger.example.com/it/',url='https://cedarcanvas.example.com/pricing';
 const excerpts=JSON.parse(await readFile(new URL('./fixtures/websites/medallia-source-excerpts.json',import.meta.url),'utf8'));
 const fetch=async(input:string)=>({url:input,requestedUrl:input,retrievedAt:'2026-10-20T13:00:00.000Z',html:(input===url?excerpts.pricing:input===sellerUrl?excerpts.seller:excerpts.customer).split('\n').map((line:string)=>`<p>${line.replaceAll('&','&amp;').replaceAll('<','&lt;')}</p>`).join('')});
 let studio=await studioSignals(service,false,false,thread,fetch);
 try{
  const seller={url:sellerUrl,value:'CedarCanvas',quote:excerpts.seller.split('\n')[0]};
  const customer={url:customerUrl,value:'HarborLedger',quote:excerpts.customer.split('\n')[0]};
  const customerDescription={url:customerUrl,value:'HarborLedger – Experience Management Platform',quote:excerpts.customer.split('\n')[1]};
  const products=['Scale','Optimize','Enterprise'].map(name=>({name:{url,value:name}}));
  const note='HarborLedger needs an embeddable email builder for transactional templates.';
  // Same observed pricing fetch role: seller, not pricing. Role is classification,
  // not price authority: exact stored commercial evidence still has to validate.
  const first=await studio.turn(`Seller: ${sellerUrl} Customer: ${customerUrl} Pricing: ${url}. ${note}`,[
   {website:{action:'fetch',url:sellerUrl,role:'seller'}},{website:{action:'fetch',url:customerUrl,role:'customer'}},{website:{action:'fetch',url,role:'seller'}},
   {website:{action:'review',seller,customer,customerDescription,products:[]}}, // actual missing/empty products failure
   {website:{action:'review',seller,customer,customerDescription,products}},
  ],true);
  assert.equal(first.results[3].error,true);assert.match(first.results[3].message,/operation.products/);
  assert.equal(first.results[4].ok,true,JSON.stringify(first.results[4]));
  assert.deepEqual(first.results[4].omittedDescriptions,['customerDescription']);
  let review=first.results[4].review;
  assert.deepEqual(review.products.map((p:any)=>p.price.amountCents),[75000,200000,undefined]);
  assert.deepEqual(review.products.map((p:any)=>p.price.unit),['','','']);
  assert.equal(review.products[2].price.kind,'contact');
  assert.equal((await service.run({action:'read'},'',thread)).products.length,0);
  // Replay the earlier homepage capability shape without turning a capability into a price.
  const capability=await studio.turn('Keep the catalog review available.',[{website:{action:'review',seller,customer,customerDescription,products:[{name:{url:sellerUrl,value:'Email Builder'},features:[{url:sellerUrl,value:'Create responsive emails',quote:'Create responsive emails for the synthetic test workflow.'}]}]}},{website:{action:'review',seller,customer,customerDescription,products}}]);
  assert.equal(capability.results[0].review.products[0].price.kind,'ambiguous');
  assert.equal(capability.results[0].review.products[0].price.amountCents,undefined);
  review=capability.results[1].review;
  const ids=review.products.slice(0,2).map((p:any)=>p.id);
  const question='Approve these catalog entries: Scale — $750.00 per month; Optimize — $2,000.00 per month? This approves the catalog, not a purchase selection.';
  // Pending is bound to a concrete question actually emitted to the user, not a model-invented receipt.
  const asked=await studio.turn('Compare Scale and Optimize as alternatives, with Enterprise as a custom-priced option.',[{website:{action:'requestApproval',candidateIds:ids}}],false,question);
  assert.equal(asked.results[0].question,question);
  await studio.close();service=makeService();studio=await studioSignals(service,false,false,thread,fetch);
  const approved=await studio.turn('yes',[{website:{action:'confirm'}}]);
  assert.deepEqual(approved.results[0].products.map((p:any)=>p.name),['Scale','Optimize']);
  assert.equal(approved.results[0].unapproved[0].name,'Enterprise');
  const state=await service.run({action:'read'},'',thread);
  assert.equal(state.selections.length,0,'Catalog alternatives are not purchases');
  assert.equal((await service.run({action:'read'},'','separate')).products.length,0);
  const quote='Use Scale, quantity 1.';
  const draft={summary:'A scoped proposal for HarborLedger’s transactional template requirements.',needs:[{text:'Embeddable email builder for transactional templates.',evidenceQuote:note}],recommendations:[{productId:ids[0],quantity:1,rationale:'Evaluate the selected plan against the stated template needs.',evidenceQuote:quote}],assumptions:[],openQuestions:['Confirm the selected plan supports the requested embedding and transactional workflow.'],nextStep:'Review the proposed scope and confirm technical fit.'};
  // Missing optional timeline no longer blocks; null optional provenance is absent.
  const batch={action:'batch',revision:state.revision,changes:[{action:'notes',sourceMessageId:null,text:note},{action:'select',sourceMessageId:null,productId:ids[0],quantity:1,quote},{action:'draft',draft}],generate:true};
  const invalid=structuredClone(batch);invalid.changes[2]={action:'draft',draft:{...draft,recommendations:[...draft.recommendations,{productId:ids[1],quantity:0,rationale:'Alternative only.',evidenceQuote:quote}]}};
  const generated=await studio.turn(quote,[invalid,batch],true);
  assert.equal(generated.results[0].error,true);
  assert.match(generated.results[0].message,/recommendations.1.quantity/,'Actual framework tool error must identify the leaf field');
  assert.equal(generated.results[1].ok,true,JSON.stringify(generated.results[1]));
  const final=await service.run({action:'read'},'',thread);
  assert.equal(final.artifacts!.completeness,'complete',generated.results[1].warning);
  await verifyPreview(final.artifacts!.directory);
  assert.deepEqual(JSON.parse(await readFile(join(final.artifacts!.directory,'proposal.json'),'utf8')),final.review!.proposal);
  assert.deepEqual(final.review!.proposal.totals,{monthlyCents:75000,oneTimeCents:0,firstMonthCents:75000,firstYearCents:900000});
  assert.deepEqual(final.review!.proposal.lineItems.map(p=>[p.name,p.quantity]),[['Scale',1]]);
  assert.equal(final.review!.proposal.lineItems[0]!.unitLabel,undefined);
  for(const label of ['PDF proposal','HTML proposal','HTML email'])assert.ok(generated.results[1].previewMarkdown.includes(`[${label}]`));
  for(const file of ['proposal.pdf','proposal.html','email.html','design.json']) {
   assert.equal((await studio.app.request(new URL(final.previews![file]!).pathname)).status,200);
   if(file==='proposal.pdf'&&realPDF)assert.ok((await readFile(join(final.artifacts!.directory,file))).length>1000,'Real Chromium PDF required');
   const content=await readFile(join(final.artifacts!.directory,file),'utf8');
   if(file.endsWith('.html')){assert.match(content,/HarborLedger/);assert.match(content,/Scale/);assert.match(content,/750/);}
  }
  const summary='A focused evaluation of transactional template creation for HarborLedger.';
  const revised=await studio.turn('Make the summary more concise without changing the selected plan or pricing.',[{action:'reviseNarrative',revision:final.revision,summary}]);
  assert.equal(revised.results[0].ok,true);
  const saved=await service.run({action:'read'},'',thread);
  assert.equal(saved.draft!.summary,summary);
  assert.deepEqual(saved.review!.proposal.totals,final.review!.proposal.totals);
  for(const file of ['proposal.html','email.html'])assert.ok((await readFile(join(saved.artifacts!.directory,file),'utf8')).includes(summary));
  for(const label of ['PDF proposal','HTML proposal','HTML email'])assert.ok(revised.results[0].previewMarkdown.includes(`[${label}]`));
  // A consumed confirmation cannot silently approve more entries.
  const repeat=await studio.turn('yes',[{website:{action:'confirm'}}],true);assert.match(repeat.results[0].error,/no current explicit approval question/);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('Studio repeated identical validation failures stop tool retries for this turn',async()=>{
 const root=await mkdtemp(join(tmpdir(),'web-retry-'));
 const studio=await studioSignals(new ProposalService(new WorkspaceStore(root)),false,false,'retry');
 try{
  const invalid={action:'batch',revision:0,changes:[{action:'draft',draft:{}}]};
  const failed=await studio.turn('Create my own proposal.',[invalid,invalid,invalid,invalid],true);
  assert.equal(failed.toolCalls,2,'A repeated uncorrected invalid call must not loop');
  assert.ok(studio.modelChoices.some(choice=>JSON.stringify(choice)==='{"type":"none"}'));
  const interleaved=await studio.turn('Retry without progress.',[invalid,{action:'read'},invalid,{action:'read'},invalid],true);
  assert.equal(interleaved.toolCalls,3,'Read-only calls must not reset the failed-retry budget');
  const recovered=await studio.turn('Let us start with my company details.',[{action:'start',revision:0,mode:'custom'}]);
  assert.equal(recovered.results[0].ok,true,'Next genuine turn is not disabled');
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('a silent or stale approval question cannot authorize a short yes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'web-pending-'));const service=new ProposalService(new WorkspaceStore(root));
 const url='https://advisory.example/pricing';
 const studio=await studioSignals(service,false,false,'pending',async()=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h2>Assessment</h2><p>USD 500 one-time project fee.</p>'}));
 try{
  const initial=await studio.turn(`Seller Advisory at ${url}.`,[{website:{action:'fetch',url,role:'seller'}},{website:{action:'review',seller:{value:'Advisory',quote:'Seller Advisory'},products:[{name:{url,value:'Assessment'}}]}}]);
  const id=initial.results.at(-1).review.products[0].id;
  await studio.turn('Show me the assessment.',[{website:{action:'requestApproval',candidateIds:[id]}}]); // no question presented by the scripted model
  const blocked=await studio.turn('yes',[{website:{action:'confirm'}}],true);assert.match(blocked.results[0].error,/no current explicit approval question/);
  const question='Approve these catalog entries: Assessment — $500.00 one-time? This approves the catalog, not a purchase selection.';
  await studio.turn('Ask me to approve the assessment.',[{website:{action:'requestApproval',candidateIds:[id]}}],false,question);
  await studio.turn('Actually, tell me about the project first.');
  const stale=await studio.turn('yes',[{website:{action:'confirm'}}],true);assert.match(stale.results[0].error,/no current explicit approval question/);
  const approved=await studio.turn('Approve the assessment.',[{website:{action:'confirm'}}]);
  assert.equal(approved.results[0].products[0].unitPriceCents,50000);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('synthetic historical HarborLedger arguments: discovery saves review and next-turn exact approval imports Scale/Optimize',async()=>{
 const recorded=JSON.parse(await readFile(process.env.WEBSITE_REPLAY_FIXTURE??new URL('./fixtures/websites/latest-medallia-review.json',import.meta.url),'utf8'));
 const root=await mkdtemp(join(tmpdir(),'latest-medallia-'));const service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTORAGE STUB'));
 const sources=Object.values(recorded.sources) as Array<{url:string;text:string;retrievedAt:string;role:string}>;
 const studio=await studioSignals(service,false,false,'latest-medallia',async url=>{
  const source=sources.find(s=>s.url===url)!;
  return {url,requestedUrl:url,retrievedAt:source.retrievedAt,html:source.text.split('\n').map(line=>`<p>${line.replaceAll('&','&amp;').replaceAll('<','&lt;')}</p>`).join('')};
 });
 try{
  const discovery=await studio.turn(recorded.messages[0],[...sources.map(s=>({website:{action:'fetch',url:s.url,role:s.role}})),{website:recorded.review}],true);
  const result=discovery.results.at(-1);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.review.seller.value,'CedarCanvas');
  assert.equal(result.review.customer.value,'HarborLedger');
  assert.deepEqual(result.review.products.slice(0,2).map((p:any)=>p.price.amountCents),[75000,200000]);
  assert.equal(result.review.products[2].price.amountCents,undefined);
  assert.equal((await service.run({action:'read'},'','latest-medallia')).products.length,0);
  const approved=await studio.turn(recorded.messages[1],[{website:{action:'confirm'}}]);
  assert.deepEqual(approved.results[0].products.map((p:any)=>p.name),['Scale','Optimize']);
  assert.deepEqual(approved.results[0].products.map((p:any)=>p.unitPriceCents),[75000,200000]);
  assert.equal(approved.results[0].unapproved[0].name,'Enterprise');
  const state=await service.run({action:'read'},'','latest-medallia');
  const scale=state.products.find(p=>p.name==='Scale')!;
  const need='HarborLedger needs an embeddable email builder for transactional templates.';
  const selection='Use Scale only, quantity 1';
  const draft={summary:'A proposed evaluation of Scale against HarborLedger’s transactional template requirements.',needs:[{text:'An embeddable email builder for transactional templates.',evidenceQuote:need}],recommendations:[{productId:scale.id,quantity:1,rationale:'Evaluate the selected subscription against the requested workflow.',evidenceQuote:selection}],timeline:[],assumptions:[],openQuestions:['Confirm plan suitability for the requested embedding and transactional workflow.'],nextStep:'Review the scope and technical fit.'};
  const generated=await studio.turn(recorded.messages[2],[{action:'batch',revision:state.revision,changes:[{action:'notes',text:need},{action:'select',productId:scale.id,quantity:1,quote:selection},{action:'draft',draft}],generate:true}]);
  const saved=await service.run({action:'read'},'','latest-medallia');
  assert.equal(saved.artifacts!.completeness,'complete',generated.results[0].warning);
  assert.deepEqual(saved.review!.proposal.lineItems.map(p=>[p.name,p.quantity]),[['Scale',1]]);
  assert.equal(saved.review!.proposal.totals.monthlyCents,75000);
  assert.equal(saved.review!.proposal.totals.firstYearCents,900000);
  await verifyPreview(saved.artifacts!.directory);
  for(const file of ['proposal.pdf','proposal.html','email.html','design.json'])assert.equal((await studio.app.request(new URL(saved.previews![file]!).pathname)).status,200);
  for(const label of ['PDF proposal','HTML proposal','HTML email'])assert.ok(generated.results[0].previewMarkdown.includes(`[${label}]`));
  for(const altered of [recorded.messages[1]+' Change Scale to USD 1.', 'Approve Scale. Keep Unknown as an unpriced custom option.', 'Approve Enterprise at the published monthly prices.'])assert.throws(()=>approvedCandidates(altered,result.review));
  assert.equal(scale.unitLabel,undefined);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('live confirmation loop: named prices, recovery during approval, duplicate calls and restart yes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'approval-loop-'));const service=new ProposalService(new WorkspaceStore(root));
 const url='https://seller.example/pricing';
 const fetch=async()=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h1>Seller</h1><h2>Scale</h2><p>USD 750 monthly.</p><h2>Optimize</h2><p>USD 2,000 monthly.</p><h2>Enterprise</h2><p>Contact Sales.</p><h2>Free</h2><p>USD 0 once. Forever free.</p>'});
 const review={action:'review',seller:{url,value:'Seller',quote:'Seller'},products:['Scale','Optimize','Enterprise','Free'].map(name=>({id:name.toLowerCase(),name:{url,value:name}}))};
 let studio=await studioSignals(service,false,false,'approval-loop',fetch);
 const explicit='Yes, approve Scale at $750/month and Optimize at $2,000/month as catalog entries. This is my final approval. Proceed without asking for further confirmation.';
 try{
  await studio.turn(`Discover ${url}`,[{website:{action:'fetch',url,role:'pricing'}}]);
  const approved=await studio.turn("Approve Scale and Optimize at their published monthly prices. Keep Enterprise as an unpriced custom option. Don't import other plans or add-ons.",[{website:review},{website:{action:'requestApproval',candidateIds:['scale','optimize']}}]);
  assert.equal(approved.results[1].confirmed,true);
  assert.deepEqual(approved.results[1].products.map((p:any)=>p.name),['Scale','Optimize']);
  const duplicate=await studio.turn(explicit,[{website:{action:'confirm'}},{website:{action:'confirm'}}]);
  assert.ok(duplicate.results.every(r=>r.unchanged));
  const w=await service.store.read();const saved=w.websites[service.store.sessionKey('approval-loop')]!;
  assert.equal(saved.approvals.length,1);assert.notEqual(saved.review!.products[3]!.price.kind,'fixed');
  for(const message of [explicit.replace('$750','$751'),explicit.replace('/month','/year'),'Approve Enterprise at $0/month','Approve Scale at $750/month and make it free'])assert.throws(()=>approvedCandidates(message,saved.review));
  await studio.close();studio=await studioSignals(service,false,false,'pending-restart',fetch);
  await studio.turn(`Discover ${url}`,[{website:{action:'fetch',url,role:'pricing'}},{website:review}]);
  const question='Approve these catalog entries: Scale — $750.00 per month; Optimize — $2,000.00 per month? This approves the catalog, not a purchase selection.';
  await studio.turn('Show me the approval question.',[{website:{action:'requestApproval',candidateIds:['scale','optimize']}}],false,question);
  await studio.close();studio=await studioSignals(new ProposalService(new WorkspaceStore(root)),false,false,'pending-restart',fetch);
  const explicitPending=await studio.turn(explicit,[{website:{action:'confirm'}},{website:{action:'confirm'}}]);
  assert.equal(explicitPending.results[0].confirmed,true);assert.equal(explicitPending.results[1].unchanged,true);
  assert.equal((await service.store.read()).websites[service.store.sessionKey('pending-restart')]!.pendingApproval,undefined);
  await studio.close();studio=await studioSignals(service,false,false,'pending-yes',fetch);
  await studio.turn(`Discover ${url}`,[{website:{action:'fetch',url,role:'pricing'}},{website:review}]);
  await studio.turn('Show the approval question.',[{website:{action:'requestApproval',candidateIds:['scale','optimize']}}],false,question);
  await studio.close();studio=await studioSignals(new ProposalService(new WorkspaceStore(root)),false,false,'pending-yes',fetch);
  const yes=await studio.turn('yes',[{website:{action:'confirm'}},{website:{action:'confirm'}}]);
  assert.equal(yes.results[0].confirmed,true);assert.equal(yes.results[1].unchanged,true);
  assert.equal((await service.store.read()).websites[service.store.sessionKey('pending-yes')]!.pendingApproval,undefined);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('recorded selection with price context resolves exact human span and earlier needs without copying',async()=>{
 const root=await mkdtemp(join(tmpdir(),'selection-replay-'));const service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTORAGE STUB'));
 const thread='selection-replay',url='https://seller.example/pricing';
 const studio=await studioSignals(service,false,false,thread,async()=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h1>Seller</h1><h2>Scale</h2><p>USD 750 monthly.</p><h2>Optimize</h2><p>USD 2000 monthly.</p>'}));
 try{
  const need='Assume HarborLedger needs an embeddable email builder for transactional templates.';
  await studio.turn(`Seller ${url}. Customer HarborLedger. ${need}`,[{website:{action:'fetch',url,role:'pricing'}},{website:{action:'review',seller:{url,value:'Seller',quote:'Seller'},customer:{value:'HarborLedger',quote:'Customer HarborLedger'},products:['Scale','Optimize'].map(name=>({id:name.toLowerCase(),name:{url,value:name}}))}}]);
  const ambiguousApproval=await studio.turn('Approve Scale or Optimize',[{website:{action:'confirm'}}],true);
  assert.equal(ambiguousApproval.results[0].ok,false);
  assert.equal((await service.run({action:'read'},'',thread)).products.length,0);
  await studio.turn('Approve Scale and Optimize at their published monthly prices.',[{website:{action:'confirm'}}]);
  const operation=JSON.parse(await readFile(new URL('./fixtures/websites/selection-failed-call.json',import.meta.url),'utf8'));
  const message='Use Scale only, quantity 1, at its approved monthly subscription price. Generate the proposal now in PDF, HTML proposal, and HTML email formats. Show Optimize and Enterprise only as comparison alternatives, not purchased items.';
  const result=await studio.turn(message,[operation,operation]);
  assert.equal(result.results[0].artifacts.completeness,'complete',result.results[0].warning);
  assert.equal(result.results[1].revision,result.results[0].revision);
  const state=await service.run({action:'read'},'',thread);
  assert.equal(state.selections[0]!.quantity,1);assert.equal(state.selections[0]!.evidenceQuote,'Scale only, quantity 1');
  assert.ok(state.notes.includes(need));assert.equal(state.review!.proposal.totals.monthlyCents,75000);
  for(const file of ['proposal.pdf','proposal.html','email.html','design.json'])assert.equal((await studio.app.request(new URL(state.previews![file]!).pathname)).status,200);
  const revision=await studio.turn('Change Scale to 2 subscriptions.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'scale',quantity:2,quote:'Scale quantity two.'},{action:'draft',draft:{...operation.changes[1].draft,recommendations:operation.changes[1].draft.recommendations.map((r:object)=>({...r,quantity:2}))}}],generate:true}]);
  assert.equal(revision.results[0].review.proposal.totals.monthlyCents,150000);
  assert.equal(revision.results[0].artifacts.completeness,'complete');
  assert.equal(revision.results[0].selections[0].quantity,2);
  const shortOperation={action:'select',revision:revision.results[0].revision,productId:'scale',quantity:1,quote:'Scale quantity one.'};
  const short=await studio.turn('Scale, one subscription',[shortOperation,shortOperation]);
  assert.equal(short.results[1].revision,short.results[0].revision);
  assert.equal(short.results[0].selections[0].quantity,1);
  for(const message of ['Use one subscription of Scale','Quantity 1 for Scale','Use Scale, quantity 1, not Optimize']) {
   const current=await service.run({action:'read'},'',thread);
   const selected=await studio.turn(message,[{action:'select',revision:current.revision,productId:'scale',quantity:1,quote:'model paraphrase'}]);
   assert.deepEqual(selected.results[0].selections.map((s:{productId:string})=>s.productId),['scale']);
   assert.equal(selected.results[0].products.find((p:{id:string})=>p.id==='optimize').unitPriceCents,200000);
  }
  short.results[0].revision=(await service.run({action:'read'},'',thread)).revision;
  const bad=await studio.turn('Approve Scale at $750/month.',[{action:'select',revision:short.results[0].revision,productId:'scale',quantity:1,quote:'Fabricated purchase of Scale, quantity 1'}],true);
  assert.equal(bad.results[0].ok,false);
  const ambiguous=await studio.turn('Scale, 1 or 2 subscriptions.',[{action:'select',revision:short.results[0].revision,productId:'scale',quantity:1,quote:'Scale, 1'}],true);
  assert.equal(ambiguous.results[0].ok,false);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('bounded selection forms preserve exact evidence and reject contradictions',()=>{
 for(const message of ['Use one subscription of Scale','Quantity 1 for Scale','Use Scale, quantity 1, not Optimize']) {
  const span=selectionSpan(message,'Scale',1);assert.ok(span);assert.ok(message.includes(span));
 }
 for(const message of ['Use Scale, quantity 1, not Scale','Use Scale, quantity 1 or 2','Use Scale, quantity 1, not Optimize or Scale','Use one subscription of Scale or Optimize','Do not use one subscription of Scale'])assert.throws(()=>selectionSpan(message,'Scale',1));
 assert.throws(()=>selectionSpan('Use Scale, quantity 1, not Optimize','Optimize',1));
 assert.throws(()=>selectionSpan('Quantity 2 for Scale','Scale',1));
});

for(const refreshed of [false,true])test(`incremental website approval after generation and narrative revision; independent new proposal (refreshed=${refreshed})`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'lifecycle-'));const service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));
 const thread='lifecycle',url='https://seller.example/pricing';
 const studio=await studioSignals(service,false,false,thread,async()=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h1>Seller</h1><h2>Scale</h2><p>USD 750 monthly.</p><h2>Optimize</h2><p>USD 2000 monthly.</p>'}));
 const need='HarborLedger needs an embeddable email builder for transactional templates.';
 const review={action:'review',seller:{value:'Seller',quote:'Seller'},customer:{value:'HarborLedger',quote:'HarborLedger'},products:['Scale','Optimize'].map(name=>({id:name.toLowerCase(),name:{url,value:name}}))};
 const read=()=>service.run({action:'read'},'',thread);
 try{
  await studio.turn(`Seller ${url}. ${need}`,[{website:{action:'fetch',url,role:'pricing'}},{website:review}]);
  await studio.turn('approve Optimize',[{website:{action:'confirm'}}]);
  const draft={summary:'Evaluate the requested transactional template workflow.',needs:[{text:need,evidenceQuote:need}],recommendations:[{productId:'optimize',quantity:1,rationale:'Evaluate the approved subscription against the stated requirement.',evidenceQuote:'Use one subscription of Optimize'}],timeline:[],assumptions:[],openQuestions:['Confirm technical fit.'],nextStep:'Review the scope.'};
  await studio.turn('Use one subscription of Optimize.',[{action:'batch',revision:(await read()).revision,changes:[{action:'select',productId:'optimize',quantity:1,quote:'Use one subscription of Optimize'},{action:'draft',draft}],generate:true}]);
  await studio.turn('Shorten the executive summary.',[{action:'reviseNarrative',revision:(await read()).revision,summary:'Evaluate transactional templates.'}]);
  const before=await read();
  const change='change the plan proposed in the proposal from Optimize to Scale and also the quantity from 1 to 3, regenerate the proposals accordingly. all other details can stay the same';
  const blocked=await studio.turn(change,[{action:'select',revision:before.revision,productId:'scale',quantity:3,quote:change}],true);assert.equal(blocked.results[0].ok,false);
  // Exact first failed live operation, after revision 6; review must not be rebuilt.
  const revised={...before.draft,recommendations:[{...draft.recommendations[0],productId:'scale',quantity:3,evidenceQuote:change}]};
  const approval=await studio.turn('approve scale',[...(refreshed?[{website:review}]:[]),{website:{action:'requestApproval',candidateIds:['scale']}},{action:'batch',revision:before.revision+1,changes:[{action:'remove',productId:'optimize',quote:change},{action:'select',productId:'scale',quantity:3,quote:change},{action:'draft',draft:revised}],generate:true}]);
  assert.equal(approval.results[refreshed?1:0].confirmed,true);
  const changed=await read();
  assert.equal(approval.results.at(-1).artifacts.completeness,'complete',approval.results.at(-1).warning);
  assert.equal(changed.products.find((p:{id:string})=>p.id==='optimize')!.unitPriceCents,200000);
  let current=changed;
  assert.equal(changed.review!.proposal.totals.monthlyCents,225000);assert.equal(changed.review!.proposal.totals.firstYearCents,2700000);
  assert.deepEqual(changed.customer,before.customer);assert.deepEqual(changed.draft!.openQuestions,before.draft!.openQuestions);
  for(const file of ['proposal.pdf','proposal.html','email.html'])assert.equal((await studio.app.request(new URL(changed.previews![file]!).pathname)).status,200);
  const duplicate=await studio.turn('approve scale',[{website:{action:'confirm'}}]);assert.equal(duplicate.results[0].unchanged,true);
  current=await read();assert.equal(current.products.length,2);
  const staleRevision=await studio.turn('Make the summary concise.',[{action:'reviseNarrative',revision:0,summary:'Evaluate transactional templates.'}],true);assert.equal(staleRevision.results[0].ok,false);
  const retry=await studio.turn('Make the summary concise.',[{action:'reviseNarrative',revision:(await read()).revision,summary:'Evaluate transactional templates.'}]);assert.equal(retry.results[0].review.proposal.totals.monthlyCents,225000);
  current=await read();
  const stale=await studio.turn('start new proposal',[{action:'start',mode:'custom',revision:0}],true);assert.equal(stale.results[0].ok,false);
  const reset=await studio.turn('start new proposal',[{action:'start',mode:'custom',revision:current.revision}],true);assert.equal(reset.results[0].ok,false);assert.match(reset.results[0].error,/new Studio thread/i);
  assert.equal((await service.run({action:'read'},'','independent')).selections.length,0);
  const independent=await studioSignals(service,false,false,'independent');
  try {
   const profile=changed.profiles[0]!;
   const reuse=await independent.turn('Reuse my seller profile for a new proposal.',[{action:'reuse',revision:0,profileId:profile.id}]);
   assert.equal(reuse.results[0].selections.length,0);assert.equal(reuse.results[0].customer.company,undefined);
   const newDraft={...revised,needs:[{text:'A separate evaluation.',evidenceQuote:'A separate evaluation.'}],recommendations:[{...revised.recommendations[0],evidenceQuote:'Scale, quantity 3'}]};
   const generated=await independent.turn('Customer Newco. A separate evaluation. Scale, quantity 3.',[{action:'batch',revision:1,changes:[{action:'customer',fields:[{field:'company',value:'Newco',quote:'Customer Newco'}]},{action:'select',productId:'scale',quantity:3,quote:'Scale, quantity 3'},{action:'draft',draft:newDraft}],generate:true}]);
   assert.equal(generated.results[0].review.proposal.totals.monthlyCents,225000);
   assert.equal(generated.results[0].artifacts.completeness,'complete');
   for(const file of ['proposal.pdf','proposal.html','email.html'])assert.equal((await independent.app.request(new URL(generated.results[0].previews[file]).pathname)).status,200);
   assert.equal((await read()).customer.company,'HarborLedger');
  }finally{await independent.close();}
  // A rebuilt review must not replace existing prices or IDs.
  await studio.turn('Review the stored offerings again.',[{website:review}]);
  const again=await studio.turn('approve scale',[{website:{action:'confirm'}}]);assert.equal(again.results[0].unchanged,true);
  await service.store.update(async w=>{w.sessions[service.store.sessionKey(thread)]!.products.find(p=>p.id==='scale')!.unitPriceCents=74000;});
  const conflict=await studio.turn('approve scale',[{website:{action:'confirm'}}],true);assert.equal(conflict.results[0].ok,false);assert.match(conflict.results[0].error,/conflicts/);
  assert.equal((await read()).products.find(p=>p.id==='scale')!.unitPriceCents,74000);

 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

for(const currency of ['USD','EUR'] as const)test(`currency-aware ${currency} hypothetical estimate requires authorization and preserves render/revision amounts`,async()=>{
 const root=await mkdtemp(join(tmpdir(),'currency-'));const service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const thread=`currency-${currency}`;const studio=await studioSignals(service,false,false,thread);
 const symbol=currency==='EUR'?'€':'$';const priceText=`${symbol}90 per license per month`;
 const text=`Seller Example. Customer Buyer. Max is available from ${priceText}. Buyer needs coordinated work. Max, quantity 50.`;
 const changes=[{action:'start',mode:'custom'},{action:'seller',fields:[{field:'name',value:'Example',quote:'Seller Example'}]},{action:'customer',fields:[{field:'company',value:'Buyer',quote:'Customer Buyer'}]},{action:'product',id:'max',name:{value:'Max',quote:'Max'},price:{value:'90',currency,quote:`from ${priceText}`,basis:'verified'},billing:{value:'monthly',quote:'per month'},unitLabel:{value:'license',quote:'per license'}}];
 try{
  const negative=await studio.turn(text,[{action:'batch',revision:0,changes,generate:false}],true);assert.equal(negative.results[0].ok,false);
  const notAuthorized=await studio.turn(text,[{action:'batch',revision:0,changes:changes.map(c=>c.action==='product'?{...c,price:{...c.price,basis:'hypothetical'}}:c)}],true);assert.equal(notAuthorized.results[0].ok,false);
  const authorized=`Seller Example. Customer Buyer. I authorize a hypothetical estimate for Max at ${priceText}. Buyer needs coordinated work. Max, quantity 50.`;
  const need='Buyer needs coordinated work.';
  const draft={summary:'Evaluate a coordinated workflow.',needs:[{text:need,evidenceQuote:need}],recommendations:[{productId:'max',quantity:50,rationale:'Evaluate the requested scope.',evidenceQuote:'Max, quantity 50'}],timeline:[],assumptions:[],openQuestions:[],nextStep:'Review the hypothetical scope.'};
  const generated=await studio.turn(authorized,[{action:'batch',revision:0,changes:[...changes.map(c=>c.action==='product'?{...c,price:{value:'90',currency,quote:priceText,basis:'hypothetical'}}:c),{action:'select',productId:'max',quantity:50,quote:'Max, quantity 50'},{action:'draft',draft}],generate:true}]);
  const state=generated.results[0];assert.equal(state.artifacts.completeness,'complete',state.warning);assert.ok((await readFile(state.files['proposal.pdf'])).length);assert.equal(state.profiles.length,0,'Hypothetical customer assumptions must not become reusable seller prices');assert.equal(state.review.proposal.currency,currency);assert.equal(state.review.proposal.totals.monthlyCents,450000);assert.equal(state.review.proposal.totals.firstYearCents,5400000);
  assert.equal(state.review.proposal.lineItems[0].unitLabel,'license');
  for(const name of ['proposal.html','email.html','design.json']){const content=await readFile(state.files[name],'utf8');assert.ok(content.includes(symbol),name);assert.match(content,/hypothetical/i);}
  const mixed=await studio.turn('Extra costs $10 monthly.',[{action:'product',revision:state.revision,id:'extra',name:{value:'Extra',quote:'Extra'},price:{value:'10',currency:currency==='EUR'?'USD':'EUR',quote:'$10'},billing:{value:'monthly',quote:'monthly'}}],true);assert.equal(mixed.results[0].ok,false);
  const revised=await studio.turn('Max, quantity 35. Regenerate.',[{action:'batch',revision:state.revision,changes:[{action:'select',productId:'max',quantity:35,quote:'Max, quantity 35'},{action:'draft',draft:{...draft,recommendations:[{...draft.recommendations[0],quantity:35,evidenceQuote:'Max, quantity 35'}]}}],generate:true}]);
  assert.equal(revised.results[0].review.proposal.totals.monthlyCents,315000);assert.equal(revised.results[0].review.proposal.currency,currency);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('fixed EUR website price approval stays EUR; From EUR stays unpriced',async()=>{
 const root=await mkdtemp(join(tmpdir(),'eur-web-'));const service=new ProposalService(new WorkspaceStore(root));const url='https://eur.example/pricing';
 const studio=await studioSignals(service,false,false,'eur-web',async()=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),html:'<h1>Euro Seller</h1><h2>Fixed</h2><p>€90 per subscription per month</p><h2>Variable</h2><p>From €90 per license per month</p><h2>Custom</h2><p>Contact Sales</p>'}));
 try{
  const result=await studio.turn(`Euro Seller ${url}`,[{website:{action:'fetch',url,role:'pricing'}},{website:{action:'review',seller:{value:'Euro Seller',quote:'Euro Seller'},products:['Fixed','Variable','Custom'].map(name=>({name:{url,value:name}}))}}]);
  assert.equal(result.results[1].review.products[1].price.kind,'starting');assert.equal(result.results[1].review.products[1].price.amountCents,undefined);
  const negative=await studio.turn('Approve Variable',[{website:{action:'confirm'}}],true);assert.equal(negative.results[0].ok,false);
  const approved=await studio.turn('Approve Fixed at €90/month',[{website:{action:'confirm'}}]);assert.equal(approved.results[0].products[0].currency,'EUR');assert.equal(approved.results[0].products[0].unitPriceCents,9000);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});

test('Anthropic to Rivergate Studio signals: partial discovery, real attachment transport, authorized EUR hypothesis, generation and revisions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'anthropic-flow-'));const service=new ProposalService(new WorkspaceStore(root),process.env.PROPOSAL_TEST_REAL_PDF==='1'?undefined:async()=>Buffer.from('%PDF-1.7\nSTUB'));const thread='anthropic-hubspot';const url='https://claude.com/pricing';
 const studio=await studioSignals(service,false,false,thread,async()=>({url,requestedUrl:url,retrievedAt:new Date().toISOString(),partial:true,html:'<h1>Anthropic</h1><h2>Max</h2><p>From €90 per license monthly</p>'}));
 const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQKWgAAAHQARXs5nCTAAAAAElFTkSuQmCC';
 try{
  await studio.turn(`Seller Anthropic. Customer Rivergate. Pricing ${url}.`,[{website:{action:'fetch',url,role:'pricing'}},{website:{action:'review',seller:{value:'Anthropic',quote:'Seller Anthropic'},customer:{value:'Rivergate',quote:'Customer Rivergate'},products:[{id:'max',name:{url,value:'Max'}}]}}]);
  await studio.turn('Review the attached pricing screenshot.',[],false,'Image observations require confirmation.',[{data:image,mediaType:'image/png'}]);
  const key=service.store.sessionKey(thread);const attachmentId=Object.keys((await service.store.read()).attachments[key]!)[0]!;assert.ok(attachmentId);
  await studio.turn('What does the screenshot show?',[{action:'observeImage',revision:0,attachmentId,text:'Max: From €90 per license monthly.'}]);
  const absent=await studio.turn('Use the missing attachment',[{action:'observeImage',revision:1,attachmentId:'0'.repeat(64),text:'Invented price'}],true);assert.equal(absent.results[0].code,'UNSUPPORTED_ATTACHMENT');
  const unauthorized=await studio.turn('Approve Max',[{website:{action:'confirm'}}],true);assert.equal(unauthorized.results[0].ok,false);
  const message='I authorize a hypothetical estimate for Max at €90 per license per month, not an official quote. Max, quantity 50. Rivergate needs team coordination. Generate the proposal.';
  const need='Rivergate needs team coordination.';
  const draft={summary:'A hypothetical scope for evaluating team coordination.',needs:[{text:need,evidenceQuote:'paraphrased requirement'}],recommendations:[{productId:'max',quantity:50,rationale:'Evaluate the requested scope with the customer.',evidenceQuote:'Max, quantity 50'}],timeline:[],assumptions:[],openQuestions:['Confirm official pricing and capabilities before commitment.'],nextStep:'Review the hypothetical estimate.'};
  const generated=await studio.turn(message,[{action:'batch',revision:1,changes:[{action:'start',mode:'custom'},{action:'seller',fields:[{field:'name',value:'Anthropic',quote:'model paraphrase'}]},{action:'customer',fields:[{field:'company',value:'Rivergate',quote:'model paraphrase'}]},{action:'product',id:'max',name:{value:'Max',quote:'Max'},price:{value:'90',currency:'EUR',basis:'hypothetical',quote:'model paraphrase of ninety euros'},billing:{value:'monthly',quote:'per month'},unitLabel:{value:'license',quote:'license'}},{action:'select',productId:'max',quantity:50,quote:'Max, quantity 50'},{action:'draft',draft}],generate:true}]);
  const state=generated.results[0];assert.equal(state.artifacts.completeness,'complete',state.warning);assert.equal(state.review.proposal.currency,'EUR');assert.equal(state.review.proposal.totals.monthlyCents,450000);
  for(const file of ['proposal.pdf','proposal.html','email.html'])assert.equal((await studio.app.request(new URL(state.previews[file]).pathname)).status,200);
  const narrative=await studio.turn('Make the executive summary concise.',[{action:'reviseNarrative',revision:state.revision,summary:'A hypothetical team-coordination estimate.'}]);assert.equal(narrative.results[0].review.proposal.totals.firstYearCents,5400000);
  const revision=await studio.turn('Max, quantity 35. Regenerate.',[{action:'batch',revision:narrative.results[0].revision,changes:[{action:'select',productId:'max',quantity:35,quote:'Max, quantity 35'},{action:'draft',draft:{...draft,needs:[{text:need,evidenceQuote:need}],recommendations:[{...draft.recommendations[0],quantity:35,evidenceQuote:'Max, quantity 35'}]}}],generate:true}]);assert.equal(revision.results[0].review.proposal.totals.firstYearCents,3780000);
  assert.equal((await service.run({action:'read'},'','unrelated')).products.length,0);
 }finally{await studio.close();await rm(root,{recursive:true,force:true});}
});
