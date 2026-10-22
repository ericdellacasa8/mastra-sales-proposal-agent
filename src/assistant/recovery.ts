import {unitPrice} from './price.js';
import {evidenceHash} from './evidence.js';
import type {Workspace} from './contracts.js';
/** Repair malformed quotations using exact human bytes, never model/image observations. */
export function resolveFactQuote(workspace:Workspace,key:string,messageId:string,value:string,quote:string) {
 const sources=workspace.sources[key]??{};
 if(Object.values(sources).some(s=>s.text.includes(quote)))return quote;
 const matches=Object.entries(sources).filter(([,s])=>s.text.includes(value));
 const chosen=matches.find(([id])=>id===messageId)??(matches.length===1?matches[0]:undefined);
 if(!chosen)return quote;
 if(chosen[1].hash!==evidenceHash(chosen[1].text))throw new Error('Stored evidence integrity check failed.');
 return value;
}
export function failureDetails(error:unknown) {
 const message=error instanceof Error?error.message:String(error);
 const cases=[
  [/state changed|stale revision/i,'STALE_REVISION','read_workspace',true],
  [/unsupported attachment|captured image/i,'UNSUPPORTED_ATTACHMENT','ask_for_supported_input',false],
  [/conflict|different.*currency|mixed.currency|not authorized|authorization|approval|unapproved|cannot be relabeled/i,'CONFLICTING_APPROVAL','clarify_authorization',false],
  [/ambiguous|which.*plan|which.*quantity|which catalog|should.*purchased/i,'AMBIGUOUS_SELECTION','ask_one_selection_question',false],
  [/PDF|Chromium|render/i,'RENDERING_FAILURE','report_available_previews',false],
  [/evidence|quote|verbatim|source|price/i,'MISSING_EVIDENCE','resolve_captured_sources',true],
  [/busy/i,'WORKSPACE_BUSY','retry_once',true],
 ] as const;
 const match=cases.find(([pattern])=>pattern.test(message));
 return {code:match?.[1]??'VALIDATION_ERROR',recovery:match?.[2]??'correct_arguments',retryable:match?.[3]??true,maxRetries:1};
}

/** Preserve the whole source clause, including starting-price qualifications. */
export function resolvePriceQuote(workspace:Workspace,key:string,messageId:string,value:string,quote:string,currency:'USD'|'EUR'|undefined,hypothetical:boolean) {
 const sources=workspace.sources[key]??{};
 if(Object.values(sources).some(s=>s.text.includes(quote)))return {quote,currency};
 const matches:Array<{id:string;quote:string;currency:'USD'|'EUR'}>=[];
 for(const [id,source] of Object.entries(sources)) {
  if(source.hash!==evidenceHash(source.text))throw new Error('Stored evidence integrity check failed.');
  for(const clause of source.text.split(/\n|;|(?<=[.!?])\s+(?=[A-Z])/))for(const denomination of currency?[currency]:['USD','EUR'] as const) {
   try{unitPrice(value,clause,source.text,false,denomination,hypothetical);matches.push({id,quote:clause,currency:denomination});}catch{/* Not a supported unique amount in this clause. */}
  }
 }
 const current=matches.filter(m=>m.id===messageId);const candidates=current.length?current:matches;
 return candidates.length===1?{quote:candidates[0]!.quote,currency:candidates[0]!.currency}:{quote,currency};
}

/** Strip presentation-only modifiers only when the remaining label is present verbatim. */
export function resolveProductLabel(value:string,quote:string) {
 if(quote.toLowerCase().includes(value.toLowerCase()))return {value,quote};
 const label=value.replace(/^optional\s+/i,'').replace(/\s*\((?:monthly|one-time|optional)\)\s*$/i,'').trim();
 const index=quote.toLowerCase().indexOf(label.toLowerCase());
 return label&&index>=0?{value:quote.slice(index,index+label.length),quote:quote.slice(index,index+label.length)}:{value,quote};
}
/** Recover recipient-role aliases only from a captured offer sentence, never a contact label. */
export function isProposalRecipient(value:string,sources:string[]) {
 const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`\\b(?:proposes|offers)\\b[^\\n.!?]+\\bfor\\s+${escaped}(?=[.!?\\n]|$)`,'i');
 return sources.some(text=>pattern.test(text))&&!sources.some(text=>new RegExp(`(?:contact|attention|attn)\\s*(?:name)?\\s*[:=]?\\s*${escaped}`,'i').test(text));
}
