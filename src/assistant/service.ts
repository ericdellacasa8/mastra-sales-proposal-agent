import {proposalInputSchema,type ProposalInput} from './proposal-input.js';
import {resolveFactQuote,resolvePriceQuote,resolveProductLabel,isProposalRecipient} from './recovery.js';
import {capturedImages} from './attachments.js';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {selectionSpan} from './selection.js';
import { unitPrice as price, priceValueCents, PriceEvidenceError } from './price.js';
import {captureUser,assertOwner,factSource,evidenceHash,type UserTurn} from './evidence.js';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { operationSchema, workspaceOperationSchema, sessionSchema, type Operation, type Session, type Workspace } from './contracts.js';
import { previewLinks } from './previews.js';
import { WorkspaceStore } from './store.js';
import { commercialSchema, defaultColors } from '../proposal/commercial.js';
import { discoverySchema, draftSchema } from '../proposal/schema.js';
import { finalizeProposal } from '../proposal/finalize.js';
import { loadFixture } from '../proposal/fixtures.js';
import { renderProposal } from '../rendering/render.js';
import { renderPdf } from '../rendering/pdf.js';
import { money } from '../rendering/sections.js';
import { verifyPreview, writePreview } from '../services/artifacts.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalized = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
function evidence(quote: string, message: string) {
  if (!message.includes(quote)) throw new Error('Quote must come verbatim from the current salesperson message, not a model response or tool result.');
}
function fact(value: string, quote: string, message: string) {
  evidence(quote, message);
  if (!normalized(quote).includes(normalized(value))) throw new Error('Extract the exact supplied value; ask instead of inventing it.');
  return value;
}
function appendNotes(s: Session, text: string) {
  if (!s.notes.includes(text)) s.notes = [s.notes, text].filter(Boolean).join('\n');
  if (s.notes.length > 12_000) throw new Error('Discovery notes exceed 12,000 characters. Start a new proposal with concise notes.');
}
function commercial(s: Session) {
  const optional=s.products.filter(p=>s.provenance[`optional.${p.id}`]&&!s.selections.some(item=>item.productId===p.id)&&p.unitPriceCents!==undefined&&p.billing).map(p=>`Optional offering — ${p.name}: ${money(p.unitPriceCents!,s.currency)} ${p.billing==='monthly'?'per month':'one-time'}, excluded from committed totals.`);
  return commercialSchema.parse({ seller: s.seller, ...(s.contract?{contract:s.contract}:{}), catalog: { version: `conversation-${digest(s.products).slice(0, 12)}`, currency: s.currency, products: s.products }, terms: [...s.terms,...optional] });
}
function proposal(s: Session) {
  if (s.pendingQuantities.length) throw new Error(nextQuestion(s));
  const draft = draftSchema.parse(s.draft);
  // Reject high-stakes assurances unless their exact wording is supplied in the
  // seller's catalog. Evidence matching alone does not verify semantic truth.
  const assurances = [draft.headline ?? '', draft.summary, draft.nextStep, ...draft.recommendations.map(r => r.rationale), ...draft.timeline.map(t => t.detail)];
  for (const text of assurances) {
    if (/\b(?:HIPAA|GDPR|SOC\s*2|ISO\s*27001|guarantee(?:d|s)?|certified|certification)\b/i.test(text) && !s.products.some(p => normalized(p.description ?? '').includes(normalized(text)))) throw new Error('Unsupported assurance or compliance claim. Ask a question instead of asserting it.');
  }
  if (draft.recommendations.length !== s.selections.length || draft.recommendations.some(r => !s.selections.some(v => v.productId === r.productId && v.quantity === r.quantity))) throw new Error('Draft selections must exactly match the salesperson-confirmed scope.');
  draft.recommendations = draft.recommendations.map(r => ({ ...r, evidenceQuote: s.selections.find(v => v.productId === r.productId)!.evidenceQuote }));
  const quantityNotice = 'Quantity check: multiple one-time service units or at least fifty units were requested. Review the supplied quantities in the pricing table before any commitment.';
  draft.assumptions = draft.assumptions.filter(value => value !== quantityNotice);
  if (quantityWarnings(s).length) {
    if (draft.assumptions.length >= 5) throw new Error('Combine assumptions to leave one slot for the supplied-quantity warning.');
    draft.assumptions.push(quantityNotice);
  }
  return finalizeProposal({ customer: s.customer, notes: s.notes }, draft, commercial(s));
}
function quantityWarnings(s: Session) {
  return s.selections.filter(v => v.quantity >= 50 || (v.quantity > 1 && s.products.find(p => p.id === v.productId)?.billing === 'once'))
    .map(v => `Quantity check: ${v.quantity} units of ${s.products.find(p => p.id === v.productId)?.name}. This is the supplied quantity; review it before any commitment.`);
}
export function nextQuestion(s: Session) {
  if (!s.mode) return 'Would you like to try with sample data, or create your own proposal?';
  if (!s.seller.name) return 'What is your seller company name?';
  if (!s.products.length) return 'What product or service should we propose? Please describe it and its unit price and billing period.';
  for (const p of s.products) {
    if (!p.name) return `What is the name for ${p.id}?`;
    if (p.unitPriceCents === undefined) return `What is the authoritative ${s.currency} unit price for ${p.name}? I will not invent a price.`;
    if (!p.billing) return `Is ${p.name} billed monthly or as a one-time fee? Other billing models are not supported yet.`;
  }
  if (!s.customer.company) return 'What is the customer company name?';
  if (!s.notes.trim()) return 'What did the customer tell you about their requirements, goals and constraints? Paste the discovery notes or describe them.';
  if (s.pendingQuantities.length) return `What quantity of ${s.pendingQuantities.map(id => s.products.find(p => p.id === id)?.name ?? id).join(', ')} should I include?`;
  if (!s.selections.length) return 'Which products should be included, and how many units of each? Please confirm quantities explicitly, including one-time services.';
  if (s.artifacts?.current) return s.artifacts.completeness === 'complete'
    ? 'Your local preview is ready. What would you like to revise, or would you like to start another proposal?'
    : 'HTML and design JSON are ready, but PDF generation failed. Report the error and existing paths. Retry only when the salesperson requests it after fixing Chromium; do not restart onboarding.';
  if (!s.draft) return 'Ready to prepare a grounded draft from the confirmed scope. Keep assumptions and unanswered questions explicit.';
  return 'Ready to generate the local draft now. No confirmation is required; delivery is unavailable.';
}
function view(s: Session, workspace: Workspace, resource='local-owner') {
  const links = s.artifacts?.current ? previewLinks(s.artifacts.directory) : undefined;
  const previewMarkdown = links ? [
    ...(s.artifacts?.completeness === 'complete' ? [`[PDF proposal](${links['proposal.pdf']})`] : []),
    `[HTML proposal](${links['proposal.html']})`, `[HTML email](${links['email.html']})`,
  ].join(' · ') : undefined;
  return { ...s, ...(s.artifacts?.current&&s.artifacts.completeness==='html-only'?{renderingError:{code:'RENDERING_FAILURE',recovery:'retry_generation',retryable:true,maxRetries:1},warning:`PDF generation failed: ${s.artifacts.error??'Chromium unavailable'}. HTML and design JSON exist, but no PDF. Fix Chromium and ask to regenerate; do not restart onboarding.`}:{}), previewMarkdown, quantityWarnings: quantityWarnings(s), ...(s.review ? { pricing: s.review.proposal.lineItems.map(item => ({ name: item.name, quantity: item.quantity, unitLabel: item.unitLabel, billing: item.billing, unitPrice: money(item.unitPriceCents,s.currency), lineTotal: money(item.lineTotalCents,s.currency) })), investment: Object.fromEntries(Object.entries(s.review.proposal.totals).map(([k, v]) => [k, money(v,s.currency)])) } : {}),
    ...(s.artifacts?.current ? { previews: Object.fromEntries(Object.entries(previewLinks(s.artifacts.directory)).filter(([name]) => name !== 'proposal.pdf' || s.artifacts!.completeness === 'complete')), files: Object.fromEntries(['email.html','email.txt','proposal.html','design.json','proposal.json', ...(s.artifacts.completeness === 'complete' ? ['proposal.pdf'] : [])].map(name => [name, join(s.artifacts!.directory, name)])) } : {}),
    profiles: Object.entries(workspace.profiles).filter(([id]) => (workspace.profileResources[id] ?? 'local-owner') === resource).map(([id, p]) => ({ id, name: p.seller.name })), nextQuestion: nextQuestion(s), deliveryAvailable: false, supportedCurrencies: ['USD','EUR'], supportedBilling: ['monthly', 'once'] };
}

export class ProposalService {
  constructor(readonly store = new WorkspaceStore(), private readonly pdf = renderPdf) {}
  /** V1 text extraction only: no website, image, quotation or catalog-approval operations. */
  async submitInput(input:ProposalInput,text:string,thread:string,turn:UserTurn,baseRevision:number) {
    return this.store.update(async workspace=>{
      const key=this.store.sessionKey(thread);assertOwner(workspace,key,turn.resource);
      const prior=workspace.sessions[key]??sessionSchema.parse({});
      const pending=workspace.v1Turns[key]??{candidate:{},requested:false,fetchErrors:[]};
      if(pending.lastMessageId===turn.messageId&&pending.outcome)return {status:String(pending.outcome.status),text:String(pending.outcome.text),...pending.outcome};
      if(prior.revision!==baseRevision)throw new Error('The proposal changed concurrently. Retry using the current proposal.');
      // Optional extraction fields are patches: an omitted SDK field cannot erase collected facts.
      input=proposalInputSchema.parse(Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined)));
      if(input.offerings)input.offerings=input.offerings.map(item=>Object.fromEntries(Object.entries(item).filter(([,value])=>value!==undefined)) as typeof item);
      const old=pending.candidate as Partial<ProposalInput>;
      // Resolve an explicit aggregate fee from the captured turn when extraction omitted it.
      // Deliberately accept only a single, unqualified amount; conditional/multiple fees need clarification.
      const fee=text.trim().match(/^(?:apply|add|include)\s+(?:a\s+)?one[ -]time fees?\s+(?:of\s+)?(\$|€|USD\s*|EUR\s*)(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s*[.!]?$/i);
      if(fee){
        const currency=/€|EUR/i.test(fee[1]!)?'EUR' as const:'USD' as const;
        const unitPrice=Number(fee[2]!.replaceAll(',',''));
        const existing=(old.offerings??[]).filter(item=>item.billing==='once'&&item.included!==false);
        const supplied=input.offerings?.filter(item=>item.billing==='once'&&item.included!==false)??[];
        if(existing.some(item=>normalized(item.name)!=='one-time fee')||existing.length>1||supplied.length>1)throw new Error('Which one-time charge should this amount apply to?');
        if(supplied.some(item=>item.unitPrice!==unitPrice||item.currency!==currency||(item.quantity!==undefined&&item.quantity!==1)))throw new Error('The extracted fee conflicts with the supplied amount. Use the stated one-time total.');
        const name=supplied[0]?.name??existing[0]?.name??'One-time fee';
        input={...input,offerings:[...(input.offerings??[]).filter(item=>item.name!==name),{name,quantity:1,unitPrice,currency,billing:'once',included:true}]};
      }
      const merged=proposalInputSchema.parse({...old,...input,offerings:input.offerings?[...(old.offerings??[]).map(p=>({...p,...input.offerings!.find(n=>normalized(n.name)===normalized(p.name))})),...input.offerings.filter(n=>!old.offerings?.some(p=>normalized(n.name)===normalized(p.name)))]:old.offerings});
      // Duration is not inferred from annualized arithmetic or model defaults.
      if(input.termMonths!==undefined&&input.termMonths!==old.termMonths){
        const numbers=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
        const durations=[...text.matchAll(/\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[ -]+(months?|years?)\b/gi)].map(match=>(/^\d+$/.test(match[1]!)?Number(match[1]):/^(a|an)$/i.test(match[1]!)?1:numbers.indexOf(match[1]!.toLowerCase()))*(/^year/i.test(match[2]!)?12:1));
        if(!durations.includes(input.termMonths))input={...input,termMonths:undefined};
        if(input.termMonths===undefined)merged.termMonths=old.termMonths;
      }
      if(input.noFixedCommitment===true&&old.noFixedCommitment!==true&&!/\bno\s+(?:fixed\s+)?(?:commitment|term)|month[ -]to[ -]month|without\s+(?:a\s+)?(?:fixed\s+)?commitment/i.test(text)){
        input={...input,noFixedCommitment:undefined};merged.noFixedCommitment=old.noFixedCommitment;
      }
      if(input.noFixedCommitment===true&&input.termMonths!==undefined)throw new Error('Specify a fixed duration or no fixed commitment, not both.');
      if(input.noFixedCommitment===true)merged.termMonths=undefined;
      if(input.termMonths!==undefined)merged.noFixedCommitment=false;
      const immediate=!/\b(?:do not|don't|not)\b/i.test(text)&&/\b(?:generate|create|prepare)\b/i.test(text);
      const confirmation=!/\b(?:do not|don't|not)\b/i.test(text)&&/\b(?:confirm|confirmed|generate)\b/i.test(text);
      const research=input.intent==='research'||/research.only|do not (?:generate|create)|don't (?:generate|create)/i.test(text);
      // Partial business fields begin collection, not permission to render.
      // A conversational help request need not be classified as an immediate proposal.
      const collecting=!prior.artifacts&&input.intent==='conversation'&&Boolean(input.seller||input.customer||input.offerings?.length);
      const requested=!research&&(collecting||pending.requested||input.intent==='proposal'||input.intent==='revision'||(pending.stage==='review'&&confirmation));
      workspace.v1Turns[key]={...pending,candidate:merged,requested,fetchErrors:[]};
      const finish=(status:string,message:string,extra:Record<string,unknown>={})=>{
        if(status==='clarification_required')workspace.v1Turns[key]!.progressive=true;
        const outcome={status,text:message,...extra};Object.assign(workspace.v1Turns[key]!,{lastMessageId:turn.messageId,outcome,requested:status==='complete'||status==='rendering_failed'?false:requested});return outcome;
      };
      if(!requested)return finish('research','Describe the proposal in text. This V1 does not research websites or extract screenshots.');
      if(!merged.seller)return finish('clarification_required','What is the seller company name?');
      if(!merged.customer)return finish('clarification_required','What is the customer company name?');
      if(!merged.offerings?.length)return finish('clarification_required','What offering should the proposal include?');
      for(const item of merged.offerings)for(const field of ['quantity','unitPrice','currency','billing'] as const)if(item[field]===undefined&&!(field==='quantity'&&item.included===false))return finish('clarification_required',`What is the ${field==='unitPrice'?'unit price':field==='billing'?'billing cadence (monthly or one-time)':field} for ${item.name}?`);
      const currencies=new Set(merged.offerings.map(p=>p.currency));if(currencies.size!==1)throw new Error('Use one currency per proposal; currency conversion is unsupported.');
      if(!merged.offerings.some(p=>p.included!==false))return finish('clarification_required','Which offering should be included in the committed total?');
      const recurring=merged.offerings.some(item=>item.included!==false&&item.billing==='monthly');
      if(recurring&&!merged.termMonths&&merged.noFixedCommitment!==true)return finish('clarification_required','Does a fixed contract term apply? Specify the number of months, or say no fixed commitment.');
      const postGeneration=Boolean(prior.artifacts);
      const oneShot=!pending.progressive&&immediate;
      const flow=workspace.v1Turns[key]!;
      if(!postGeneration&&!oneShot&&!immediate&&!merged.customerGoal&&!flow.discoveryAsked){
        flow.discoveryAsked=true;flow.stage='discovery';flow.progressive=true;
        return finish('clarification_required',`What is the main outcome ${merged.customer} wants to achieve with this offering? You can also skip this.`);
      }
      if(pending.stage==='discovery')flow.discoveryAsked=true;
      const s=sessionSchema.parse({revision:prior.revision,mode:'custom',seller:{name:merged.seller,colors:defaultColors},customer:{company:merged.customer},currency:merged.offerings[0]!.currency,contract:recurring?(merged.termMonths?{kind:'fixed',months:merged.termMonths}:{kind:'no_fixed'}):undefined,artifacts:prior.artifacts});
      // These are normalized user-input records, not quotations or verified public evidence.
      s.terms=['Commercial inputs supplied by the salesperson; not independently verified public pricing.'];
      s.products=merged.offerings.map(item=>({id:`item-${digest(normalized(item.name)).slice(0,12)}`,name:item.name,description:item.description??item.name,unitPriceCents:Math.round(item.unitPrice!*100),currency:item.currency,billing:item.billing,maxQuantity:Number.MAX_SAFE_INTEGER,requires:[]}));
      for(const item of merged.offerings)if(Math.abs(item.unitPrice!*100-Math.round(item.unitPrice!*100))>0.00001)throw new Error('Unit prices support at most two decimal places.');
      s.selections=merged.offerings.flatMap((item,i)=>item.included===false?[]:[{productId:s.products[i]!.id,quantity:item.quantity!,evidenceQuote:`Structured salesperson input: ${item.name}, quantity ${item.quantity}.`}]);
      s.notes=s.selections.map(p=>p.evidenceQuote).join('\n');
      merged.offerings.forEach((item,i)=>{if(item.included===false)s.provenance[`optional.${s.products[i]!.id}`]={sourceMessageId:turn.messageId,quote:'Structured salesperson input: excluded',valueHash:digest(item)};});
      const summary=merged.summary??`Proposal for ${merged.customer} covering the requested scope.`;
      s.draft={summary:[summary,...(merged.customerGoal&&!summary.includes(merged.customerGoal)?[`Customer goal: ${merged.customerGoal}`]:[]),...(merged.termMonths&&!summary.includes(`${merged.termMonths} months`)?[`Requested term: ${merged.termMonths} months.`]:[])].join(' '),needs:[{text:merged.customerGoal??'Provide the requested scope.',evidenceQuote:s.selections[0]!.evidenceQuote}],recommendations:s.selections.map(p=>({...p,rationale:(()=>{const description=s.products.find(v=>v.id===p.productId)!.description!;return /[$€£]|\b(?:USD|EUR|GBP|dollars?|euros?)\b|\d\s*%/i.test(description)?'Provide the requested scope.':description;})()})),timeline:merged.scope?[{phase:'Implementation',detail:merged.scope,evidenceQuote:null}]:[],assumptions:[],openQuestions:[],nextStep:'Review the scope and agree next steps.'};
      const pricing=proposal(s).totals;
      const currency=s.currency;
      const totalsText=`Monthly recurring: ${money(pricing.monthlyCents,currency)}; one-time fees: ${money(pricing.oneTimeCents,currency)}. ${recurring?`Annualized recurring run-rate: ${money(pricing.annualizedRecurringCents!,currency)} (not a commitment). ${s.contract?.kind==='fixed'?`Contract term: ${s.contract.months} months; committed contract total: ${money(pricing.committedCents!,currency)}.`:'No fixed commitment; no committed contract total.'}`:`Committed one-time total: ${money(pricing.oneTimeCents,currency)}.`}`;
      const materialHash=digest({seller:merged.seller,customer:merged.customer,offerings:merged.offerings.map(({description,included,...commercial})=>({...commercial,included:included!==false})),termMonths:merged.termMonths,noFixedCommitment:merged.noFixedCommitment});
      const changed=pending.reviewHash!==undefined&&pending.reviewHash!==materialHash;
      if(!postGeneration&&!oneShot&&!(confirmation&&!changed)){
        flow.stage='review';flow.reviewHash=materialHash;flow.progressive=true;
        const lines=merged.offerings.map(item=>`${item.name}: ${item.quantity??'unspecified'} × ${money(Math.round(item.unitPrice!*100),currency)} ${item.billing==='monthly'?'per month':'one-time'}${item.included===false?' — optional, excluded':''}`).join('\n');
        return finish('confirmation_required',`${merged.seller} → ${merged.customer}\n${lines}\n\n${totalsText}\n\nConfirm or say generate to create the previews, or tell me what to correct.`);
      }
      workspace.sessions[key]=s;
      const result=await this.apply(workspace,{action:'generate',revision:s.revision},text,thread,turn);
      return finish(result.artifacts?.completeness==='complete'?'complete':'rendering_failed',`${result.artifacts?.completeness==='complete'?'Proposal generated.':result.warning}\n\n${totalsText}\n\n${result.previewMarkdown}`,{previews:result.previews,revision:result.revision});
    });
  }
  async capture(turn:UserTurn, text:string, thread:string, raw?:unknown) {
    return this.store.update(async workspace => {
      const key=this.store.sessionKey(thread);captureUser(workspace,key,turn,text);
      if(raw)for(const image of capturedImages(raw)) {
        if(image.error){workspace.attachmentErrors[key]=[image.error];continue;}
        const reference=join(this.store.root,'evidence',key,image.hash!);
        await mkdir(join(this.store.root,'evidence',key),{recursive:true,mode:0o700});
        await writeFile(reference,image.bytes!,{mode:0o600});
        const records=workspace.attachments[key]??={};
        records[image.hash!]??={sourceMessageId:turn.messageId,reference,hash:image.hash!,mime:image.mime!,capturedAt:new Date().toISOString(),status:'unverified-image'};
      }
    });
  }
  async run(input: unknown, message: string, thread = 'local', suppliedTurn?:UserTurn) {
    // Direct service callers are trusted application code, not exposed model arguments.
    const turn=suppliedTurn ?? {messageId:`internal-${evidenceHash(message)}`,resource:'local-owner'};
    const request = workspaceOperationSchema.parse(input);
    if (request.action === 'batch') {
      if (!message.trim()) throw new Error('A real salesperson message is required for changes.');
      return this.store.update(async workspace => {
        const key = this.store.sessionKey(thread);
        captureUser(workspace,key,turn,message);
        const revision = workspace.sessions[key]?.revision ?? 0;
        const receipt=workspace.sessions[key]?.lastOperation;
        if(receipt?.messageId===turn.messageId&&receipt.hash===evidenceHash(request)&&receipt.revision===revision) {
          const saved=workspace.sessions[key]!;
          if(saved.artifacts?.current&&saved.artifacts.completeness==='html-only') {const result=await this.apply(workspace,{action:'generate',revision},message,thread,turn);workspace.sessions[key]!.lastOperation={...receipt,revision:workspace.sessions[key]!.revision};return result;}
          return view(saved,workspace,turn.resource);
        }
        if (request.revision !== revision) throw new Error('State changed. Read the latest revision before applying changes.');
        let result;
        for (const [index, change] of request.changes.entries()) {
          const op = operationSchema.parse({ ...(change as object), revision: revision + index });
          if (op.action === 'read') throw new Error('Batch changes cannot contain reads.');
          if (op.action === 'start' && op.mode !== 'custom') throw new Error('Use GenerateSample for sample initialization.');
          try { result = await this.apply(workspace, op, message, thread,turn,true); }
          catch(error) {
            const detail=`Batch changes[${index}] (${op.action}) failed; no batch changes were saved. ${error instanceof PriceEvidenceError ? error.message : safeError(error)}`;
            if(error instanceof Error){error.message=detail;throw error;}
            throw new Error(detail);
          }
        }
        if (request.generate || workspace.sessions[key]?.draft) result = await this.apply(workspace, { action: 'generate', revision: workspace.sessions[key]!.revision }, message, thread,turn);
        workspace.sessions[key]!.lastOperation={messageId:turn.messageId,hash:evidenceHash(request),revision:workspace.sessions[key]!.revision};
        return result!;
      });
    }
    const operation = request;
    const key = this.store.sessionKey(thread);
    if (operation.action === 'read') {
      const workspace = await this.store.read();
      if(suppliedTurn)assertOwner(workspace,key,turn.resource);
      return view(workspace.sessions[key] ?? sessionSchema.parse({}), workspace,turn.resource);
    }
    if (!message.trim()) throw new Error('A real salesperson message is required for changes.');
    return this.store.update(async workspace => {
      captureUser(workspace,key,turn,message);
      const s=workspace.sessions[key],receipt=s?.lastOperation,operationHash=evidenceHash(operation);
      if(receipt?.messageId===turn.messageId&&receipt.hash===operationHash&&receipt.revision===s?.revision) {
        if(s.artifacts?.current&&s.artifacts.completeness==='html-only'){const result=await this.apply(workspace,{action:'generate',revision:s.revision},message,thread,turn);workspace.sessions[key]!.lastOperation={...receipt,revision:workspace.sessions[key]!.revision};return result;}
        return view(s,workspace,turn.resource);
      }
      const result=await this.apply(workspace,operation,message,thread,turn);
      workspace.sessions[key]!.lastOperation={messageId:turn.messageId,hash:operationHash,revision:workspace.sessions[key]!.revision};
      return result;
    });
  }
  private async apply(workspace: Workspace, operation: Exclude<Operation, {action:"read"}>, message: string, thread: string, turn:UserTurn, deferRendering=false) {
      const key = this.store.sessionKey(thread);
      let s = workspace.sessions[key] ?? sessionSchema.parse({});
      if (operation.revision !== s.revision) throw new Error('State changed. Read the latest revision before applying changes.');
      // The model extracts values; the server binds exact available human evidence.
      const bind=(f:{value:string;quote:string}|null|undefined)=>{if(f)f.quote=resolveFactQuote(workspace,key,turn.messageId,f.value,f.quote);};
      if(operation.action==='customer'&&!s.customer.company&&!operation.fields.some(f=>f.field==='company'||f.field==='email')) {
        const name=operation.fields.find(f=>f.field==='name');
        if(name&&isProposalRecipient(name.value,Object.values(workspace.sources[key]??{}).map(record=>record.text)))name.field='company';
      }
      if(operation.action==='product'&&operation.name)Object.assign(operation.name,resolveProductLabel(operation.name.value,operation.name.quote));
      if(operation.action==='seller'||operation.action==='customer')operation.fields.forEach(bind);
      if(operation.action==='product')for(const field of ['name','description','unitLabel'] as const)bind(operation[field]);
      if(operation.action==='terms')operation.terms.forEach(bind);
      if(operation.action==='draft')for(const need of operation.draft.needs)need.evidenceQuote=resolveFactQuote(workspace,key,turn.messageId,need.text,need.evidenceQuote);
      const source=(path:string,value:unknown,quote:string,existing:unknown,id?:string)=>factSource(workspace,key,s,turn,path,value,quote,existing,id);
      const oldRevision = s.revision;
      let renderError: string | undefined;
      if(operation.action==='observeImage') {
        const attachment=workspace.attachments[key]?.[operation.attachmentId];
        if(!attachment)throw new Error('Unsupported attachment: no captured image exists in this thread.');
        let bytes:Buffer;try{bytes=await readFile(attachment.reference);}catch{throw new Error('Unsupported attachment: captured image bytes are unavailable.');}
        if(createHash('sha256').update(bytes).digest('hex')!==attachment.hash)throw new Error('Stored attachment evidence integrity check failed.');
        attachment.observation=operation.text;
        s.revision++;workspace.sessions[key]=s;
        return {...view(s,workspace,turn.resource),imageObservation:attachment,warning:'Image-derived text is unverified, not website or salesperson evidence. Ask the salesperson to confirm commercial facts before importing them.'};
      }
      if ((operation.action==='start'||operation.action==='reuse')&&s.websiteApproval)throw new Error('This thread already has a proposal. Open a new Studio thread for an independent proposal; reuse the verified seller profile there. Read the current revision to revise this proposal instead.');
      if (operation.action === 'start') {
        s = sessionSchema.parse({ mode: operation.mode === 'custom' ? 'custom' : 'sample' });
        if (operation.mode !== 'custom') {
          const fixture = loadFixture(operation.mode);
          Object.assign(s, { currency:fixture.commercial.catalog.currency,seller: fixture.commercial.seller, products: fixture.commercial.catalog.products, terms: fixture.commercial.terms, customer: fixture.discovery.customer, notes: fixture.discovery.notes, draft: fixture.draft, selections: fixture.draft.recommendations.map(({ productId, quantity, evidenceQuote }) => ({ productId, quantity, evidenceQuote })) });
        }
      } else if (operation.action === 'reuse') {
        const profile = (workspace.profileResources[operation.profileId] ?? 'local-owner') === turn.resource ? workspace.profiles[operation.profileId] : undefined;
        if (!profile) throw new Error('Unknown seller profile. Read the available profiles first.');
        s = sessionSchema.parse({ mode: 'custom' });
        Object.assign(s, { mode: 'custom', currency:profile.catalog.currency,seller: profile.seller, products: profile.catalog.products, terms: profile.terms });
        s.draft = undefined;
      } else {
        if (!s.mode) throw new Error('Workspace is not initialized; no prior batch changes were saved. For supplied business facts, submit start with mode custom, then the unsaved facts in one batch at revision 0. Do not ask the user to choose onboarding again.');
        switch (operation.action) {
          case 'seller': {
            const fields: Record<string, unknown> = { ...s.seller };
            for (const f of operation.fields) {
              const value = fact(f.value, f.quote, source(`seller.${f.field}`,f.value,f.quote,(s.seller as Record<string,unknown>)[f.field],f.sourceMessageId));
              if (['accent','ink','muted','soft','dark'].includes(f.field)) fields.colors = { ...defaultColors, ...(fields.colors as Record<string,string> | undefined), [f.field]: value };
              else fields[f.field] = ['colors', 'logo', 'artwork'].includes(f.field) ? JSON.parse(value) : value;
            }
            s.seller = sessionSchema.shape.seller.parse(fields); s.draft = undefined; break;
          }
          case 'customer': {
            const fields = { ...s.customer };
            for (const f of operation.fields) fields[f.field] = fact(f.value, f.quote, source(`customer.${f.field}`,f.value,f.quote,s.customer[f.field],f.sourceMessageId));
            s.customer = sessionSchema.shape.customer.parse(fields); s.draft = undefined; break;
          }
          case 'product': {
            const existing = s.products.find(p => p.id === operation.id);
            const p = existing ?? { id: operation.id, maxQuantity: Number.MAX_SAFE_INTEGER, requires: [] };
            for (const field of ['name', 'description', 'unitLabel'] as const) {
              const f = operation[field]; if (f) p[field] = fact(f.value, f.quote, source(`product.${p.id}.${field}`,f.value,f.quote,p[field],f.sourceMessageId));
            }
            if (operation.price) {
              Object.assign(operation.price,resolvePriceQuote(workspace,key,turn.messageId,operation.price.value,operation.price.quote,operation.price.currency,operation.price.basis==='hypothetical'));
              try {
                const currency=operation.price.currency??(/[€]|\bEUR\b/i.test(operation.price.quote)?'EUR':'USD');
                if(s.products.some(other=>other.id!==p.id&&other.unitPriceCents!==undefined)&&s.currency!==currency)throw new Error('Mixed-currency catalog: use a separate proposal; no exchange rate or conversion is supported.');
                const hypothetical=operation.price.basis==='hypothetical';
                const priceMessage=source(`product.${p.id}.unitPriceCents`,priceValueCents(operation.price.value),operation.price.quote,p.unitPriceCents,operation.price.sourceMessageId);
                const candidate=workspace.websites[key]?.review?.products.find(c=>c.id===p.id||c.name.toLowerCase()===p.name?.toLowerCase());
                const imageStarting=Object.values(workspace.attachments[key]??{}).some(a=>a.observation?.toLowerCase().includes(p.name?.toLowerCase()??'!')&&/from|starting|custom/i.test(a.observation));
                if(!hypothetical&&(candidate||imageStarting)&&!existing)throw new Error('Website/image candidate prices require catalog approval or explicit authorization of a labeled hypothetical estimate; do not import them as verified salesperson prices.');
                if(p.priceBasis==='hypothetical'&&!hypothetical)throw new Error('A hypothetical estimate cannot be relabeled as a verified published price. Obtain a new source-backed catalog review.');
                if(hypothetical&&/\b(?:do not|don't|not|never)\s+(?:authorize|approve|use|assume)\b/i.test(priceMessage))throw new Error('Hypothetical pricing was not authorized.');
                if(hypothetical&&!((/\b(?:hypothetical|assum(?:e|ption)|illustrative)\b/i.test(priceMessage)&&/\b(?:approve|authorize|use|assume)\b/i.test(priceMessage))||(/\bi\s+conf(?:i)?rm\b/i.test(priceMessage)&&!/[?]|\bnot\b|don't|do not/i.test(priceMessage))))throw new Error('Explicit salesperson authorization of a hypothetical pricing assumption is required.');
                p.unitPriceCents=price(operation.price.value,operation.price.quote,priceMessage,priceMessage===message&&p.unitPriceCents===undefined&&nextQuestion(s).startsWith('What is the authoritative'),currency,hypothetical);
                s.currency=currency;p.currency=currency;p.priceBasis=hypothetical?'hypothetical':'verified';
                if(hypothetical)p.assumption={quote:operation.price.quote,sourceMessageId:s.provenance[`product.${p.id}.unitPriceCents`]!.sourceMessageId};else delete p.assumption;
              }
              catch (error) { if (error instanceof PriceEvidenceError) error.productId = operation.id; throw error; }
            }
            if (operation.billing) {
              const texts=Object.values(workspace.sources[key]??{}).map(record=>record.text);
              if(!texts.some(text=>text.includes(operation.billing!.quote))&&operation.price&&texts.some(text=>text.includes(operation.price!.quote))) {
                const cadence=operation.price.quote.match(operation.billing.value==='monthly'?/per month|\/\s*mo(?:nth)?\b|monthly/i:/one[ -]time|once|project fee/i);
                if(cadence)operation.billing.quote=cadence[0];
              }
              evidence(operation.billing.quote, source(`product.${p.id}.billing`,operation.billing.value,operation.billing.quote,p.billing,operation.billing.sourceMessageId));
              const pattern = operation.billing.value === 'monthly' ? /monthly|per month|\/\s*mo(?:nth)?\b/i : /one[ -]time|once|project fee/i;
              if (!pattern.test(operation.billing.quote)) throw new Error('Clarify monthly versus one-time billing explicitly.');
              p.billing = operation.billing.value;
            }
            const optionalSources=Object.values(workspace.sources[key]??{}).flatMap(record=>record.text.split(/(?<=[.!?])\s+|\n/)).filter(text=>p.name&&text.toLowerCase().includes(p.name.toLowerCase())&&/\boptional\b/i.test(text)&&/\bexcluded\b/i.test(text)&&!/\b(?:not|never|no longer)\s+(?:optional|excluded)\b|\b(?:don't|do not)\s+exclude/i.test(text));
            if(optionalSources.length===1)source(`optional.${p.id}`,true,optionalSources[0]!,s.provenance[`optional.${p.id}`]?true:undefined);
            if (!p.description && p.name) p.description = p.name; // Factual label, no invented capabilities.
            if (!existing) s.products.push(p);
            s.draft = undefined; break;
          }
          case 'notes': {
            // A model summary is not a quotation. Import genuine source text instead;
            // never persist or promote the model's paraphrase as discovery evidence.
            const sources = workspace.sources[key] ?? {};
            const exact = Object.entries(sources).filter(([,record]) => record.text.includes(operation.text));
            const texts = exact.length ? [operation.text] : Object.values(sources).map(record => record.text);
            if (!texts.length) throw new Error('No captured salesperson notes are available.');
            for (const text of new Set(texts)) {
              evidence(text, source(`notes.${digest(text)}`,text,text,s.notes.includes(text)?text:undefined));
              appendNotes(s, text);
            }
            s.draft = undefined; break;
          }
          case 'terms': s.terms = operation.terms.map((f,i) => fact(f.value, f.quote, source(`terms.${i}`,f.value,f.quote,s.terms[i],f.sourceMessageId))); s.draft = undefined; break;
          case 'select': {
            const product=s.products.find(p=>p.id===operation.productId);
            if(!product)throw new Error('Select an existing catalog product.');
            if(operation.quantity!==undefined) {
              const captured=workspace.sources[key]?.[turn.messageId];
              if(!captured||captured.hash!==evidenceHash(captured.text))throw new Error('Stored evidence integrity check failed.');
              const resolved=selectionSpan(captured.text,product.name??product.id,operation.quantity);
              if(s.provenance[`optional.${product.id}`]&&!resolved)throw new Error(`selection.${product.id}: this offering was explicitly optional and excluded. A genuine explicit purchase selection is required.`);
              if(resolved)operation.quote=resolved;
            }
            evidence(operation.quote, source(`${operation.quantity===undefined?'pending':'selection'}.${operation.productId}`,operation.quantity ?? true,operation.quote,operation.quantity===undefined?(s.pendingQuantities.includes(operation.productId)?true:undefined):s.selections.find(v=>v.productId===operation.productId)?.quantity,operation.sourceMessageId));
            if (!s.products.some(p => p.id === operation.productId)) throw new Error('Select an existing catalog product.');
            if (operation.quantity === undefined) {
              if (!s.selections.some(v => v.productId === operation.productId) && !s.pendingQuantities.includes(operation.productId)) s.pendingQuantities.push(operation.productId);
              break;
            }
            s.pendingQuantities = s.pendingQuantities.filter(id => id !== operation.productId);
            if (/[$€£]|\b(?:USD|dollars?|price|cost)\b/i.test(operation.quote) || (/^\d+$/.test(operation.quote.trim()) && message.trim() !== operation.quote.trim())) throw new Error('Quote an explicit quantity separately from a price; ask if unclear.');
            const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
            const tokens: string[] = operation.quote.toLowerCase().match(/\b\w+\b/g) ?? [];
            if (!tokens.includes(String(operation.quantity)) && !tokens.includes(words[operation.quantity] ?? '')) throw new Error('Ask the salesperson for an explicit quantity. Use digits for quantities above twelve.');
            s.selections = s.selections.filter(v => v.productId !== operation.productId);
            s.selections.push({ productId: operation.productId, quantity: operation.quantity, evidenceQuote: operation.quote });
            appendNotes(s, operation.quote); s.draft = undefined; break;
          }
          case 'remove':
            evidence(operation.quote, source(`selection.${operation.productId}`,'removed',operation.quote,s.selections.find(v=>v.productId===operation.productId)?.quantity,operation.sourceMessageId));
            const removed=s.products.find(p=>p.id===operation.productId);
            const switchFrom=removed&&new RegExp(`(?:change|switch)[\\s\\S]*\\bfrom ${removed.name?.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')} to `,'i').test(operation.quote);
            if (!switchFrom&&!/remove|exclude|without|drop|omit/i.test(operation.quote)) throw new Error('Ask which item to remove from the scope.');
            s.pendingQuantities = s.pendingQuantities.filter(id => id !== operation.productId);
            s.selections = s.selections.filter(v => v.productId !== operation.productId); s.draft = undefined; break;
          case 'reviseNarrative': {
            if (!s.draft) throw new Error('No saved draft to revise. Generate an initial proposal first.');
            if (operation.summary !== undefined) s.draft.summary = operation.summary;
            const seen = new Set<string>();
            for (const benefit of operation.benefits ?? []) {
              if (seen.has(benefit.productId)) throw new Error('Duplicate benefit product.');
              seen.add(benefit.productId);
              const recommendation = s.draft.recommendations.find(r => r.productId === benefit.productId);
              if (!recommendation) throw new Error('Benefits must refer to an existing selected product.');
              recommendation.rationale = benefit.rationale;
            }
            // Narrative is authored copy, not a captured fact or a new requirement.
            s.draft = proposal(s).content;
            break;
          }
          case 'draft':
            // A missing notes operation must not discard previously captured needs.
            // Recover only exact human excerpts, with the same provenance checks.
            for(const quote of [...operation.draft.needs.map(n=>n.evidenceQuote),...operation.draft.timeline.map(t=>t.evidenceQuote).filter((q):q is string=>q!==null)]) {
              if(!s.notes.includes(quote)) {
                evidence(quote,source(`notes.${digest(quote)}`,quote,quote,undefined));
                appendNotes(s,quote);
              }
            }
            // Move only catalog-matching optional-price prose to derived commercial terms.
            // All other monetary narrative still fails the existing validator.
            operation.draft.assumptions=operation.draft.assumptions.map(text=>{
              if(!/[$€]|\b(?:USD|EUR)\b/i.test(text)||!/\boptional\b/i.test(text)||!/\bexcluded\b/i.test(text))return text;
              const candidates=s.products.filter(p=>p.name&&text.toLowerCase().includes(p.name.toLowerCase())&&s.provenance[`optional.${p.id}`]&&!s.selections.some(item=>item.productId===p.id));
              if(candidates.length!==1)return text;
              const p=candidates[0]!;
              const amounts=text.match(/(?:[$€]|\bUSD|\bEUR)\s*\d[\d,.]*/g)??[];
              if(amounts.length!==1||/discount|starting|custom|guarantee/i.test(text))return text;
              try{price(String(p.unitPriceCents!/100),amounts[0]!,text,false,s.currency); }catch{return text;}
              if(!(p.billing==='monthly'?/per month|\/\s*mo(?:nth)?\b|monthly/i:/one[ -]time|once/i).test(text))return text;
              return `${p.name} is optional and excluded from committed totals.`;
            });
            s.draft = operation.draft;
            // Validates authority, evidence, exact scope, dependencies and monetary prose.
            s.draft = proposal(s).content; break;
          case 'review': {
            proposal(s); // Validate now; publish one snapshot through finalization below.
            break;
          }
          case 'generate': break; // Render the current validated state below.

        }
      }
      if (!['read','review','generate'].includes(operation.action)) {
        s.review = undefined;
        if (s.artifacts) s.artifacts.current = false;
      }
      // Starting a sample is a complete draft-generation operation, not a choice gate.
      // Always finalize again: no stale review or model-supplied total is authoritative.
      if (!deferRendering && (operation.action === 'generate' || operation.action === 'draft' || operation.action === 'review' || operation.action === 'reviseNarrative' || (operation.action === 'start' && operation.mode !== 'custom'))) {
        const p = proposal(s), c = commercial(s);
        const inputHash=digest({draft:s.draft,seller:s.seller,customer:s.customer,products:s.products,contract:s.contract,terms:s.terms,notes:s.notes,selections:s.selections,optional:Object.entries(s.provenance).filter(([path])=>path.startsWith('optional.'))});
        if(s.artifacts?.completeness==='complete'&&s.artifacts.inputHash===inputHash) {
          try {
            await verifyPreview(s.artifacts.directory);
            // The persisted review and artifacts must always reference the same proposal ID.
            s.review={proposal:JSON.parse(await readFile(join(s.artifacts.directory,'proposal.json'),'utf8')),commercial:commercial(s)};
            s.artifacts.current=true;
            if(operation.action!=='generate')s.revision=oldRevision+1;
            s.artifacts.revision=s.revision;workspace.sessions[key]=sessionSchema.parse(s);
            return view(s,workspace,turn.resource);
          } catch { /* Missing/corrupt bundle: regenerate through normal validation. */ }
        }
        const rendered = renderProposal(p, c);
        const directory = join(this.store.root, 'previews', key, p.id);
        let pdf: Buffer | undefined;
        try { pdf = await this.pdf(rendered.documentHtml, rendered.proposal.seller); }
        catch (error) { renderError = safeError(error); }
        await writePreview(directory, rendered, pdf);
        const manifest = await verifyPreview(directory);
        const profileId=digest([turn.resource,c.seller.name]).slice(0,16);
        // Hypothetical assumptions are proposal-specific, not reusable seller prices.
        if(c.catalog.products.every(product=>product.priceBasis!=='hypothetical')) {workspace.profiles[profileId] = {...c,terms:s.terms}; workspace.profileResources[profileId]=turn.resource;}
        s.artifacts = { directory, completeness: manifest.completeness, current: true, inputHash, revision:oldRevision+1, ...(renderError?{error:renderError}:{}) };
        s.review = { proposal: p, commercial: c };
      }
      s.revision = oldRevision + 1;
      workspace.sessions[key] = sessionSchema.parse(s);
      return view(s, workspace,turn.resource);
  }
}

export function safeError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  return error instanceof Error && !('code' in error) ? error.message : 'Local operation failed. Check workspace permissions and retry.';
}
