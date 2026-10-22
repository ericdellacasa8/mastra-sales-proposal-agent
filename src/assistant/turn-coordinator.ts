import {z} from 'zod';
import {saveProposal,saveProposalSchema} from './save-proposal.js';
import {assertOwner,evidenceHash,type UserTurn} from './evidence.js';
import {authorizedWebsiteUrls} from './website-urls.js';
import {WebsiteDiscovery} from './website-discovery.js';
import {type WebPage} from './website-fetch.js';
import {type ProposalService,safeError} from './service.js';
import {requestedSample} from './conversation.js';

const offering=saveProposalSchema.shape.offerings.unwrap().element.extend({included:z.boolean().optional()});
export const candidateSchema=saveProposalSchema.extend({
 intent:z.enum(['research','proposal','revision','conversation']),
 offerings:z.array(offering).max(12).optional(),
 websiteProducts:z.array(z.strictObject({name:z.string().min(1).max(100),url:z.url()})).max(12).optional(),
 websiteRoles:z.array(z.strictObject({url:z.url(),role:z.enum(['seller','pricing','customer'])})).max(8).optional(),
 imageObservations:z.array(z.strictObject({index:z.number().int().min(0).max(2),text:z.string().min(1).max(3000)})).max(3).optional(),
});
export type Candidate=z.infer<typeof candidateSchema>;
export type Outcome={status:'research'|'clarification_required'|'approval_required'|'ready'|'complete'|'rendering_failed';text:string;revision?:number;previews?:Record<string,string>;investment?:Record<string,string>;error?:string};
export type CapturedTurn=UserTurn&{thread:string;text:string;baseRevision:number};
const researchOnly=(text:string)=>/research.only|do not (?:generate|create)|don't (?:generate|create)|do not generate yet|don't generate yet/i.test(text);
const creation=(text:string)=>!researchOnly(text)&&/\b(?:generate|create|prepare|make|draft|want|need)\b[^.!?\n]{0,160}\bproposal\b|\bproposal\b[^.!?\n]{0,60}\b(?:please|now)\b/i.test(text);
const clean=(text:string)=>text.replace(/<[^>]*>/g,'').slice(0,300);

/** One application-owned progression path; candidate extraction cannot authorize prices or choose mutations. */
export class TurnCoordinator {
 readonly discovery:WebsiteDiscovery;
 constructor(readonly service:ProposalService,fetch?: (url:string)=>Promise<WebPage>){this.discovery=new WebsiteDiscovery(service.store,fetch);}
 async begin(text:string,thread:string,turn:UserTurn,raw?:unknown){
  await this.service.capture(turn,text,thread,raw);
  const key=this.service.store.sessionKey(thread);let w=await this.service.store.read();assertOwner(w,key,turn.resource);
  const errors:string[]=[];
  const urls=authorizedWebsiteUrls(w,key).filter(u=>u.sourceMessageId===turn.messageId||/\b(?:fetch|review|research|retry|refresh)\b/i.test(text));
  // Source ingestion never creates a proposal. Each failed page is independent.
  if(!/\b(?:do not|don't)\s+(?:fetch|browse|visit)\b/i.test(text))for(const {url,sourceMessageId} of urls.slice(0,8)){
   if(w.websites[key]?.sources.some(s=>s.requestedUrl===url)&&!/\b(?:refresh|retry)\b/i.test(text))continue;
   const supplied=w.sources[key]?.[sourceMessageId]?.text??text;
   const offset=supplied.indexOf(url)>=0?supplied.indexOf(url):supplied.indexOf(new URL(url).hostname);
   const labels=[...supplied.slice(0,Math.max(0,offset)).matchAll(/\b(customer|prospect|buyer|seller|pricing|our company|my company)\b/gi)];
   const customer=/customer|prospect|buyer/i.test(labels.at(-1)?.[1]??'');
   try{await this.discovery.run({action:'fetch',url,role:customer?'customer':/pricing|plans/i.test(new URL(url).pathname)?'pricing':'seller'},text,thread,turn);}
   catch(error){errors.push(`${url}: ${safeError(error)}`);}
  }
  await this.service.store.update(async state=>{assertOwner(state,key,turn.resource);const context=state.turns[key]??={candidate:{},requested:false,fetchErrors:[]};context.fetchErrors=errors;});
  w=await this.service.store.read();
  return {turn:{...turn,text,thread,baseRevision:w.sessions[key]?.revision??0},snapshot:{proposal:w.sessions[key],pending:w.turns[key],sources:w.sources[key],websites:w.websites[key],attachments:Object.values(w.attachments[key]??{}).map((a,index)=>({index,status:a.status,observation:a.observation})),attachmentErrors:w.attachmentErrors[key]}};
 }
 async accept(raw:unknown,turn:CapturedTurn):Promise<Outcome>{
  const input=candidateSchema.parse(raw),{text,thread}=turn,key=this.service.store.sessionKey(thread);
  let w=await this.service.store.read();assertOwner(w,key,turn.resource);
  const context=w.turns[key]??{candidate:{},requested:false,fetchErrors:[]};
  const requestHash=evidenceHash(input);
  if(context.lastMessageId===turn.messageId){
   if(context.requestHash===requestHash&&context.outcome)return context.outcome as Outcome;
   return {status:'clarification_required',text:'This message has already been processed. Please describe the next change.'};
  }
  if((w.sessions[key]?.revision??0)!==turn.baseRevision)return {status:'clarification_required',text:'The proposal changed during this turn. Please review the latest scope before making another change.'};
  const prior=context.candidate as Partial<Candidate>;
  const candidate:Candidate={...prior,...input,offerings:input.offerings?[
   ...(prior.offerings??[]).map(old=>({...old,...input.offerings!.find(next=>next.name.toLowerCase()===old.name.toLowerCase())})),
   ...input.offerings.filter(next=>!prior.offerings?.some(old=>old.name.toLowerCase()===next.name.toLowerCase()))
  ]:prior.offerings};
  // Removal is an explicit, genuine instruction, never inferred from an omitted array entry.
  if(candidate.offerings)candidate.offerings=candidate.offerings.filter(item=>!new RegExp(`\\b(?:remove|drop|omit)\\s+(?:the\\s+)?${item.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(text));
  const cancelled=/\b(?:cancel|abandon)\b/i.test(text);
  const requested=!cancelled&&(creation(text)||Boolean(context.requested)||Boolean(w.sessions[key]?.draft&&input.intent==='revision'&&!researchOnly(text)));
  const authorizationMessageId=creation(text)?turn.messageId:context.authorizationMessageId;
  await this.service.store.update(async state=>{
   assertOwner(state,key,turn.resource);
   if((state.sessions[key]?.revision??0)!==turn.baseRevision)throw new Error('Concurrent proposal change; no candidate update saved.');
   state.turns[key]={...context,candidate:cancelled?{}:candidate,requested,authorizationMessageId};
  });
  const finish=async(outcome:Outcome)=>{
   const notices=context.fetchErrors.filter(error=>!outcome.text.includes(error));if(notices.length)outcome={...outcome,text:`${outcome.text}\n\n${notices.join('\n')}`};
   await this.service.store.update(async state=>{assertOwner(state,key,turn.resource);const current=state.turns[key]!;if(current.lastMessageId&&current.lastMessageId!==context.lastMessageId&&current.lastMessageId!==turn.messageId)throw new Error('Concurrent turn result; no result overwritten.');Object.assign(current,{lastMessageId:turn.messageId,requestHash,outcome,...(['complete','rendering_failed'].includes(outcome.status)?{requested:false}:{})});});return outcome;
  };
  if(cancelled)return finish({status:'research',text:'The pending proposal is cancelled. Saved commercial records are unchanged.'});
  try{
   // Observations are explicitly unverified and cannot populate the human source ledger.
   let expectedRevision=turn.baseRevision;
   for(const observation of input.imageObservations??[]){
    const entries=Object.entries((await this.service.store.read()).attachments[key]??{}),image=entries[observation.index];
    if(!image)throw new Error('Image bytes are unavailable. Provide the relevant facts in text.');
    const result=await this.service.run({action:'observeImage',revision:expectedRevision,attachmentId:image[0],text:observation.text},text,thread,turn);
    expectedRevision=result.revision;
   }
   if(input.websiteRoles?.length)await this.service.store.update(async state=>{
    assertOwner(state,key,turn.resource);
    for(const role of input.websiteRoles!)for(const source of state.websites[key]?.sources??[])if(source.url===role.url||source.requestedUrl===role.url){if(source.role==='customer'&&role.role!=='customer')throw new Error('Customer website information cannot define the seller catalog.');source.role=role.role;}
   });
   w=await this.service.store.read();
   const website=w.websites[key];
   // A model reference is not fetched evidence. Customer products and unavailable
   // pages stay source/context data, never prerequisites for the seller catalog.
   candidate.websiteProducts=candidate.websiteProducts?.filter(product=>website?.sources.some(source=>
    (source.url===product.url||source.requestedUrl===product.url)&&['seller','pricing'].includes(source.role)));
   await this.service.store.update(async state=>{assertOwner(state,key,turn.resource);state.turns[key]!.candidate.websiteProducts=candidate.websiteProducts;});
   if(candidate.websiteProducts?.length&&(!website?.review||candidate.websiteProducts.some(p=>!website.review!.products.some(old=>old.name===p.name&&old.sourceUrl===p.url)))){
    const company=(name:string|undefined,role:'seller'|'customer')=>{
     if(!name)throw new Error(`What is the ${role} company name?`);
     for(const source of Object.values(w.sources[key]??{})){if(source.hash!==evidenceHash(source.text))throw new Error('Source integrity failure.');const at=source.text.toLowerCase().indexOf(name.toLowerCase());if(at>=0)return {value:source.text.slice(at,at+name.length),quote:source.text.slice(at,at+name.length)};}
     for(const source of website?.sources??[]){const at=source.text.toLowerCase().indexOf(name.toLowerCase());if(at>=0)return {value:source.text.slice(at,at+name.length),quote:source.text.slice(at,at+name.length),url:source.url};}
     throw new Error(`What is the ${role} company name?`);
    };
    await this.discovery.run({action:'review',seller:company(candidate.seller??w.sessions[key]?.seller.name,'seller'),...(candidate.customer?{customer:company(candidate.customer,'customer')}:{}),products:candidate.websiteProducts.map(p=>({name:{value:p.name,url:p.url}}))},text,thread,turn);
   }
   w=await this.service.store.read();
   const review=w.websites[key]?.review;
   if(review&&/^(?:yes[,!]?\s*)?(?:please\s+)?(?:approve|accept|import)\b/i.test(text)){
    if(((await this.service.store.read()).sessions[key]?.revision??0)!==expectedRevision)throw new Error('Concurrent proposal change. Review current scope before continuing.');
    const approval=await this.discovery.run({action:'confirm'},text,thread,turn);
    if('revision' in approval&&typeof approval.revision==='number')expectedRevision=approval.revision;
   }
   w=await this.service.store.read();
   const sample=requestedSample(text);
   const state=await this.service.run({action:'read'},'',thread,turn);
   if(state.revision!==expectedRevision)throw new Error('Concurrent proposal change. No proposal update applied.');
   const completed=(result:Awaited<ReturnType<ProposalService['run']>>):Outcome=>{
    if(result.artifacts?.completeness!=='complete')return {status:'rendering_failed',text:`The proposal is saved, but PDF rendering failed. ${result.warning??'Please retry generation after resolving Chromium.'}\n\n${result.previewMarkdown}`,error:result.artifacts?.error,revision:result.revision,previews:result.previews};
    return {status:'complete',text:`Proposal for ${result.customer.company} from ${result.seller.name}.\n\nMonthly: ${result.investment?.monthlyCents}; one-time: ${result.investment?.oneTimeCents}; first year: ${result.investment?.firstYearCents}.\n\n${result.previewMarkdown}`,revision:result.revision,previews:result.previews,investment:result.investment};
   };
   if(sample)return finish(completed(await this.service.run({action:'start',mode:sample,revision:state.revision},text,thread,turn)));
   if(state.artifacts?.completeness==='html-only'&&state.artifacts.current&&/^(?:please\s+)?(?:retry|regenerate|generate again)[.!\s]*$/i.test(text))return finish(completed(await this.service.run({action:'generate',revision:state.revision},text,thread,turn)));
   const unapproved=review?.products.filter(p=>!state.products.some(product=>product.id===p.id))??[];
   const selectedUnapproved=candidate.offerings?.some(item=>item.included!==false&&item.basis!=='hypothetical'&&unapproved.some(p=>p.name.toLowerCase()===item.name.toLowerCase()));
   const catalog=review?.products.map(p=>`${p.name}: ${p.price.quote} — ${state.products.some(item=>item.id===p.id)?'approved':p.price.kind==='fixed'?'awaiting approval':p.price.reason}`).join('\n');
   if(selectedUnapproved||review&&!state.products.length&&!candidate.offerings?.some(item=>item.basis==='hypothetical'))return finish({status:'approval_required',text:`${catalog}\n\nWhich eligible offerings do you approve for the catalog?`});
   if(researchOnly(text)||!requested){
    const sourceText=(w.websites[key]?.sources??[]).map(source=>`${source.url}: ${clean(source.text)}`).join('\n\n');
    return finish({status:'research',text:[catalog??sourceText,...context.fetchErrors,...(w.attachmentErrors[key]??[]),input.imageObservations?.length?'Screenshot observations retained as unverified. Confirm numeric commercial terms before quoting.':undefined,!catalog&&!sourceText&&!context.fetchErrors.length?'I have retained the supplied information. What would you like to propose?':undefined].filter(Boolean).join('\n\n')});
   }
   if(!candidate.seller&&!state.seller.name)return finish({status:'clarification_required',text:'What is the seller company name?'});
   if(!candidate.customer&&!state.customer.company)return finish({status:'clarification_required',text:'Which customer company is this proposal for?'});
   const business={seller:candidate.seller,customer:candidate.customer,offerings:candidate.offerings,summary:candidate.summary,requirements:candidate.requirements};
   // The old mutation API stays internal; revision/evidence are never candidate fields.
   return finish(completed(await saveProposal(this.service,business,text,thread,turn,state.revision)));
  }catch(error){
   const detail=safeError(error);
   const question=/Missing (?:explicit |purchased )?quantity for ([^.]+)\./.exec(detail);
   const text=/hypothetical.*authoriz|authoriz.*hypothetical|Missing.*(?:price|currency)/i.test(detail)&&candidate.offerings?.some(item=>item.basis==='hypothetical')?'Do you authorize the screenshot-derived unit price as a hypothetical estimate, rather than verified published pricing?':question?`How many ${question[1]} should be included?`:/Missing.*(?:price|currency)/i.test(detail)?'What is the unit price and currency for the offering?':/Missing.*billing/i.test(detail)?'Is the offering billed monthly or once?':/Concurrent|State changed|state changed/.test(detail)?'The proposal changed during this turn. Please review the current scope before another update.':/Quote|quote|Batch changes|sourceMessageId|captured human|schema/i.test(detail)?'I could not verify that update against the captured information. No proposal was generated; the supplied information remains available.':detail;
   return finish({status:'clarification_required',text,error:detail});
  }
 }
}
