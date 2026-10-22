import {z} from 'zod';
import type {ProposalService} from './service.js';
import {assertOwner,evidenceHash,type UserTurn} from './evidence.js';
import {priceValueCents,unitPrice} from './price.js';

/** Meaning-only tool input. Provenance and optimistic revisions are application-owned. */
export const saveProposalSchema=z.strictObject({
 seller:z.string().min(1).max(100).optional(),customer:z.string().min(1).max(160).optional(),
 offerings:z.array(z.strictObject({
  name:z.string().min(1).max(100),quantity:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),included:z.boolean().default(true).describe('False only for explicitly optional or excluded offerings; no purchased quantity is needed then.'),
  unitPrice:z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(),currency:z.enum(['USD','EUR']).optional(),
  billing:z.enum(['monthly','once']).optional(),basis:z.enum(['verified','hypothetical']).optional(),
  description:z.string().max(400).optional(),
 })).min(1).max(12).optional().describe('Include purchased offerings and optionally explicitly excluded services with included:false. Existing catalog prices may be omitted; never alter a price to fit a budget.'),
 summary:z.string().min(1).max(600).optional().describe('Optional nonmonetary narrative; no invented capabilities.'),
 requirements:z.array(z.string().min(1).max(400)).max(5).optional().describe('Optional requirements supplied by the salesperson; do not infer them from a customer website.'),
});
const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];

async function applyProposal(service:ProposalService,input:unknown,text:string,thread:string,turn:UserTurn,baseRevision?:number,continuing=false,clarificationOffering?:string,clarificationField:'billing'|'quantity'|'price'='billing') {
 const parsed=saveProposalSchema.parse(input);
 if(!text.trim()||/research.only|do not (?:generate|create)|don't (?:generate|create)|once (?:you have full context|fetched)/i.test(text))throw new Error('Research only: no proposal was created. Collect confirmed commercial facts before saving a proposal.');
 if(!continuing&&!/proposal|generat|creat|prepar|proceed|update|change|increase|decrease|revise|shorten|concise|use|include/i.test(text)&&! /^(?:yes|go ahead|[ab])[.!\s]*$/i.test(text))throw new Error('No proposal creation or revision request was supplied in this turn.');
 await service.capture(turn,text,thread);
 const workspace=await service.store.read(),key=service.store.sessionKey(thread);assertOwner(workspace,key,turn.resource);
 const state=await service.run({action:'read'},'',thread,turn);
 if(baseRevision!==undefined&&baseRevision!==state.revision&&state.lastOperation?.messageId!==turn.messageId&&state.websiteApproval?.confirmationMessageId!==turn.messageId)throw new Error('State changed in another operation. No changes saved; review the current proposal before issuing a new revision request.');
 const request={...parsed,offerings:parsed.offerings??state.selections.map(selection=>({name:state.products.find(p=>p.id===selection.productId)!.name!,quantity:selection.quantity,included:true,unitPrice:undefined,currency:undefined,billing:undefined,basis:undefined,description:undefined}))};
 if(!request.offerings.length)throw new Error('Provide at least one offering and its commercial terms.');
 const sources=Object.entries(workspace.sources[key]??{}).map(([id,s])=>{if(s.hash!==evidenceHash(s.text))throw new Error('Stored evidence integrity check failed.');return {id,text:s.text};});
 const newest=[...sources].reverse();
 const fact=(value:string)=>{
  const matches=newest.flatMap(s=>{const match=s.text.match(new RegExp(escape(value),'i'));return match?[{value,quote:match[0],id:s.id}]:[];});
  if(!matches.length)throw new Error(`Missing captured human evidence for supplied name or requirement. Omit optional descriptions; clarify only the missing fact.`);
  const chosen=matches[0]!;const source=sources.find(s=>s.id===chosen.id)!;
  const clause=source.text.split(/\n|(?<=[.!?])\s+/).find(part=>part.includes(chosen.quote));
  return {value,quote:clause??source.text};
 };
 const seller=request.seller??state.seller.name,customer=request.customer??state.customer.company;
 if(!seller||!customer)throw new Error('Provide the seller and customer company names. Contact details are optional.');
 const changes:unknown[]=[];
 if(!state.mode)changes.push({action:'start',mode:'custom'});
 if(seller!==state.seller.name)changes.push({action:'seller',fields:[{field:'name',...fact(seller)}]});
 if(customer!==state.customer.company)changes.push({action:'customer',fields:[{field:'company',...fact(customer)}]});
 const recommendations:Array<{productId:string;quantity:number;rationale:string;evidenceQuote:string}>=[];
 for(const originalItem of request.offerings){
  const item={...originalItem};
  // Drop optional marketing qualifiers only when the remaining name is verbatim human text.
  if(!sources.some(s=>s.text.toLowerCase().includes(item.name.toLowerCase()))){
   const plain=item.name.replace(/^optional\s+/i,'').replace(/\s*\([^)]*\)\s*$/,'').trim();
   if(plain&&sources.some(s=>new RegExp(`\\b${escape(plain)}\\b`,'i').test(s.text)))item.name=plain;
  }
  const existing=state.products.find(p=>p.name?.toLowerCase()===item.name.toLowerCase());
  const id=existing?.id??`item-${evidenceHash(item.name.toLowerCase()).slice(0,12)}`;
  let price=item.unitPrice,currency=item.currency,billing=item.billing;
  if(existing?.unitPriceCents!==undefined){
   if(price!==undefined&&priceValueCents(price)!==existing.unitPriceCents||currency&&currency!==state.currency||billing&&billing!==existing.billing)throw new Error('Approved catalog price or billing conflict. Keep the existing commercial terms; a separately verified catalog change is required.');
   price=String(existing.unitPriceCents/100);currency=state.currency;billing=existing.billing;
  }else{
   if(price===undefined||!currency)throw new MissingCommercial(originalItem.name,'price');
   const name=fact(item.name);
   const priceReply=continuing&&clarificationField==='price'&&clarificationOffering?.toLowerCase()===originalItem.name.toLowerCase();
   const candidates=priceReply?newest.filter(source=>source.id===turn.messageId):newest.filter(source=>source.text.toLowerCase().includes(item.name.toLowerCase()));
   let quote:string|undefined,priceSource:string|undefined,billingSource:string|undefined;
   for(const source of candidates){
    const clauses=source.text.split(/\n|;|(?<=[.!?])\s+/).filter(clause=>priceReply||clause.toLowerCase().includes(item.name.toLowerCase()));
    for(const original of clauses){
     const nameAt=Math.max(0,original.toLowerCase().indexOf(item.name.toLowerCase()));
     const clause=original.slice(nameAt).split(/\band\s+(?=(?:one|two|three|\d+|an?|the)\s)/i)[0]!;
     const tokens=[...clause.matchAll(/(?:€|\$|\bEUR|\bUSD)\s*\d[\d,.]*/gi)];
     if(!tokens.length)continue;
     if(tokens.length!==1)throw new Error(`Ambiguous price evidence for ${item.name}; specify which amount applies.`);
     const token=tokens[0]![0].replace(/[,.]+$/,'');
     // The newest explicit price for this offering must match, not an older convenient value.
     unitPrice(price,token,clause,false,currency,item.basis==='hypothetical');
     quote=token;priceSource=clause;
     // A trailing 'both' cadence scopes to exactly two priced offerings in this sentence.
     const shared=original.match(/\bboth\s+(?:one[ -]time(?:\s+fees?)?|monthly(?:\s+fees?)?)\b/i);
     const amounts=[...original.matchAll(/(?:€|\$|\bEUR|\bUSD)\s*\d[\d,.]*/gi)];
     billingSource=shared&&amounts.length===2&&shared.index! > amounts[1]!.index!?`${clause} ${shared[0]}`:clause;
     break;
    }
    if(quote)break;
   }
   if(!quote||!priceSource)throw new Error(`No captured human price for ${item.name}. Website candidates need catalog approval; image observations alone cannot authorize prices.`);
   if(continuing&&clarificationField==='billing'&&clarificationOffering?.toLowerCase()===originalItem.name.toLowerCase()){
    const tokens=[...text.matchAll(/(?:€|\$|\bEUR|\bUSD)\s*\d[\d,.]*/gi)];
    if(tokens.length===1){unitPrice(price,tokens[0]![0],text,false,currency,item.basis==='hypothetical');billingSource=text;}
    else if(/^(?:once|one[ -]time|monthly)[.!\s]*$/i.test(text))billingSource=text;
   }
   const monthly=billingSource?.match(/per\s+month|\/\s*mo(?:nth)?\b|monthly/i);
   const once=billingSource?.match(/one[ -]time|once|project fee/i);
   if(monthly&&once)throw new Error(`Conflicting billing terms for ${item.name}. Clarify the cadence.`);
   const resolved=monthly?'monthly':once?'once':undefined;
   if(!resolved)throw new MissingCommercial(originalItem.name,'billing');
   if(billing&&billing!==resolved)throw new Error(`Billing conflicts with captured evidence for ${item.name}.`);
   billing=resolved;const cadence=(monthly??once)!;
   const imageBacked=Object.values(workspace.attachments[key]??{}).some(a=>a.observation?.toLowerCase().includes(item.name.toLowerCase()));
   const hypothetical=imageBacked||item.basis==='hypothetical'||/hypothetical|assum(?:e|ption)|illustrative/i.test(priceSource);
   const description=item.description?(()=>{try{return fact(item.description!);}catch{return undefined;}})():undefined;
   changes.push({action:'product',id,name,description,price:{value:price,quote,currency,basis:hypothetical?'hypothetical':'verified'},billing:{value:billing,quote:cadence[0]}});
  }
  if(!item.included){
   if(!sources.some(s=>s.text.toLowerCase().includes(item.name.toLowerCase())&&/optional|excluded/i.test(s.text)))throw new Error(`No explicit optional/excluded status for ${item.name}.`);
   continue;
  }
  if(item.quantity===undefined)throw new MissingCommercial(originalItem.name,'quantity');
  const prior=state.selections.find(s=>s.productId===id);
  let quantityQuote=prior?.quantity===item.quantity?prior.evidenceQuote:undefined;
  if(!quantityQuote){
   // Latest relevant human selection wins. Generic seat/unit wording is only safe for one offering.
   for(const source of newest){
    if(!source.text.toLowerCase().includes(item.name.toLowerCase())&&request.offerings.length!==1)continue;
    const selectionName=escape(item.name)+(/\b(?:seat|license|subscription|unit)$/i.test(item.name)?'s?':'');
    const unit=request.offerings.length===1?'|seats?|licenses?|subscriptions?|units?':'';
    const matches=[...source.text.matchAll(new RegExp(`\\b(\\d+|${words.slice(1).join('|')})\\s+(?:${selectionName}${unit})(?![a-z])|\\b${escape(item.name)}[, :]+(?:quantity\\s+)?(\\d+)\\b`,'gi'))];
    if(!matches.length)continue;
    const values=matches.map(m=>{const n=m[1]??m[2]!;return /^\d+$/.test(n)?Number(n):words.indexOf(n.toLowerCase());});
    if(values.some(n=>n!==item.quantity)||new Set(values).size!==1)throw new Error(`Conflicting quantity for ${item.name}; use the latest explicit selection.`);
    if(/\b(?:exclude|excluded|optional|not|or)\b/i.test(source.text)&&source.text.toLowerCase().includes(item.name.toLowerCase())){
     const clause=source.text.split(/[.!?\n]/).find(c=>c.includes(matches[0]![0]))??source.text;
     if(/\b(?:exclude|excluded|optional|not|or)\b/i.test(clause))throw new Error(`Ambiguous or excluded purchase selection for ${item.name}.`);
    }
    quantityQuote=matches[0]![0];break;
   }
  }
  if(!quantityQuote)throw new MissingCommercial(originalItem.name,'quantity');
  if(prior?.quantity!==item.quantity)changes.push({action:'select',productId:id,quantity:item.quantity,quote:quantityQuote});
  recommendations.push({productId:id,quantity:item.quantity,rationale:state.draft?.recommendations.find(r=>r.productId===id)?.rationale??`Provide the requested ${item.name}.`,evidenceQuote:quantityQuote});
 }
 for(const prior of state.selections.filter(p=>!recommendations.some(r=>r.productId===p.productId))){
  const name=state.products.find(p=>p.id===prior.productId)?.name??prior.productId;
  const match=text.match(new RegExp(`(?:remove|exclude|omit|drop)\\s+(?:the\\s+)?${escape(name)}`,'i'));
  if(!match)throw new Error(`Removing ${name} requires an explicit current scope change; include unchanged selections in the request.`);
  changes.push({action:'remove',productId:prior.productId,quote:match[0]});
 }
 if(!recommendations.length)throw new Error('Choose at least one explicitly purchased offering.');
 const timeline=state.draft?.timeline??sources.flatMap(source=>source.text.split(/\n|(?<=[.!?])\s+/)).filter(clause=>/\bmilestones?\b/i.test(clause)&&!/[$€]|\b(?:USD|EUR)\b/.test(clause)&&clause.length<=400).slice(-4).map(clause=>({phase:'Implementation',detail:clause,evidenceQuote:clause}));
 const needs=request.requirements?.length?request.requirements.map(value=>({text:value,evidenceQuote:fact(value).quote})):state.draft?.needs??recommendations.map(r=>({text:'Provide the requested offering and quantity.',evidenceQuote:r.evidenceQuote}));
 const draft={...state.draft,summary:request.summary??state.draft?.summary??`A proposal for ${customer} based on the requested scope.`,needs,recommendations,timeline,assumptions:state.draft?.assumptions??[],openQuestions:state.draft?.openQuestions??[],nextStep:state.draft?.nextStep??'Review the scope and agree next steps.'};
 if(!changes.length&&JSON.stringify(draft)===JSON.stringify(state.draft))return service.run({action:'generate',revision:state.revision},text,thread,turn);
 changes.push({action:'draft',draft});
 // Existing service owns the atomic lock, expected-revision check, evidence validation and renderer.
 return service.run({action:'batch',revision:state.revision,changes,generate:true},text,thread,turn);
}

class MissingCommercial extends Error {
 constructor(readonly offering:string,readonly field:'billing'|'quantity'|'price'){super(field==='price'?`Missing explicit price or currency for ${offering}. What is the unit price and currency?`:field==='billing'?`Missing explicit billing for ${offering}. Is this monthly or one-time?`:`Missing explicit quantity for ${offering}. How many should be included?`);}
}

/** Pending clarification is intent, never approved commercial state. Bound to its source and revision. */
export async function saveProposal(service:ProposalService,input:unknown,text:string,thread:string,turn:UserTurn,baseRevision?:number){
 const parsed=saveProposalSchema.parse(input);
 await service.capture(turn,text,thread);
 const key=service.store.sessionKey(thread),workspace=await service.store.read();assertOwner(workspace,key,turn.resource);
 const pending=workspace.pendingProposals[key];
 const coordinated=workspace.turns[key];
 const authorization=coordinated?.authorizationMessageId?workspace.sources[key]?.[coordinated.authorizationMessageId]:undefined;
 const authorizedContinuation=Boolean(coordinated?.requested&&authorization&&authorization.hash===evidenceHash(authorization.text)&&/\bproposal\b/i.test(authorization.text));
 const explicit=/proposal|generat|creat|prepar|proceed|update|change|increase|decrease|revise|shorten|concise|use|include/i.test(text);
 const newRequest=/\b(?:new proposal|start over)\b/i.test(text)||(parsed.seller!==undefined&&parsed.seller!==pending?.request.seller)||(parsed.customer!==undefined&&parsed.customer!==pending?.request.customer);
 if(pending&&/\b(?:cancel|abandon|stop)\b/i.test(text)){
  await service.store.update(async w=>{assertOwner(w,key,turn.resource);if(w.pendingProposals[key]?.sourceMessageId===pending.sourceMessageId)delete w.pendingProposals[key];});
  throw new Error('Pending proposal cancelled. No proposal was generated.');
 }
 const continuing=!newRequest&&!!pending&&(pending.field==='quantity'?/\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(text):/once|one[ -]time|monthly|per month|[€$]|\b(?:USD|EUR)\b/i.test(text));
 if(continuing){
  const source=workspace.sources[key]?.[pending.sourceMessageId];
  if(!source||source.hash!==evidenceHash(source.text))throw new Error('Pending proposal source is unavailable or corrupted. No changes saved.');
  if((workspace.sessions[key]?.revision??0)!==pending.revision)throw new Error('Pending proposal state changed. Review current scope before continuing.');
 }
 const prior=continuing?saveProposalSchema.parse(pending.request):undefined;
 const request=prior?{...prior,...parsed,offerings:parsed.offerings?[
  ...(prior.offerings??[]).map(old=>({...old,...parsed.offerings!.find(next=>next.name.toLowerCase()===old.name.toLowerCase())})),
  ...parsed.offerings.filter(next=>!prior.offerings?.some(old=>old.name.toLowerCase()===next.name.toLowerCase()))
 ]:prior.offerings}:parsed;
 try{
  const result=await applyProposal(service,request,text,thread,turn,baseRevision,continuing||authorizedContinuation,pending?.offering,pending?.field);
  if(pending)await service.store.update(async w=>{if(w.pendingProposals[key]?.sourceMessageId===pending.sourceMessageId)delete w.pendingProposals[key];});
  return result;
 }catch(error){
  if(error instanceof MissingCommercial&&(explicit||continuing))await service.store.update(async w=>{
   assertOwner(w,key,turn.resource);
   const revision=workspace.sessions[key]?.revision??0;
   if((w.sessions[key]?.revision??0)!==revision)throw new Error('Workspace changed; clarification was not saved.');
   w.pendingProposals[key]={sourceMessageId:continuing?pending.sourceMessageId:turn.messageId,revision,offering:error.offering,field:error.field,request};
  });
  throw error;
 }
}
