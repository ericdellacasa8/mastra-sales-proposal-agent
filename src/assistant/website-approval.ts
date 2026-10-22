import {priceValueCents} from './price.js';
import type {WebsiteState} from './website-contracts.js';
type Candidate=NonNullable<WebsiteState['review']>['products'][number];
const normalize=(text:string)=>text.toLowerCase().replace(/[’]/g,"'").replace(/[-–]/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const words=(text:string)=>normalize(text).split(' ').map(w=>w.replace(/s$/,'')).filter(w=>!['the','a','an','any','their','our','offering','product','plan','service'].includes(w));
const fail=()=>new Error('Which catalog entries do you mean? Name them or specify their displayed positions; unresolved prices cannot be imported.');
/** A bounded selection grammar, not a phrase/password check. Every selector is resolved
 * against the stored review; no model-provided IDs, prices or approval quotations. */
export function approvedCandidates(message:string,review:WebsiteState['review']):Candidate[] {
 if(!review)throw new Error('No stored review yet. Prepare candidates from the fetched sources before requesting approval; do not ask for pasted excerpts.');
 let input=message.trim().replace(/’/g,"'").replace(/^yes[,!]?\s+/i,'').replace(/[.!]+$/,'');
 // Ignore only these non-commercial closing statements, never arbitrary trailing instructions.
 input=input.replace(/\.\s*This is my final approval(?:\.\s*Proceed without asking for further confirmation)?$/i,'').replace(/\s+as catalog entries$/i,'');
 if(input.toLowerCase()===review.confirmationText.toLowerCase())return review.products.filter(p=>p.price.kind==='fixed'); // Existing persisted reviews.
 const approval=input.match(/^(?:please\s+)?(?:approve|accept|import|include|add)(?:\s+only)?\s+(.+)$/is);
 if(!approval)throw fail();
 input=approval[1]!;
 // Comparison-only clauses exclude stored entries; they never authorize a price.
 const comparisons:string[]=[];
 input=input.replace(/[.;]\s*(?:keep|retain|leave)\s+([^.;]+?)\s+as\s+(?:an?\s+)?(?:unpriced|custom[ -]priced)(?:\s+(?:custom|comparison))?\s+(?:options?|alternatives?)(?=[.;]|$)/gi,(_all,name:string)=>{comparisons.push(name);return '';});
 // Split positive selection from explicit exclusions, retaining every exclusion.
 const clauses=input.split(/(?:[.;]\s*|,?\s+but\s+)(?:please\s+)?(?:do not|don't|exclude|excluding|not|except|leave out)(?:\s+(?:import|include|add|approve))?\s+|\s+(?:except|excluding)\s+/i);
 let include=clauses.shift()!;
 if(/\bor\b/i.test(include))throw new Error('Which single plan should be approved? Name one, or explicitly use “and” to approve multiple plans.');
 const monthly=/\bmonthly\s+prices?\b/i.test(include);
 include=include.replace(/\s+at\s+(?:(?:the|their)\s+)?(?:published|listed|stored)\s+(?:monthly\s+)?(?:prices?|rates?|terms)\s*$/i,'');
 // New prices/terms, additional commands or negations must never be silently ignored.
 if(/[£¥;]|\b(?:not|don't|instead|change|discount|GBP)\b/i.test(include))throw fail();
 let ambiguousSelection=false;
 const resolve=(raw:string,exclude=false):Candidate[]=>{
  if(/\s+and\s+/i.test(raw)&&/\bat\s+(?:USD|EUR|\$|€)/i.test(raw))return raw.split(/\s+and\s+/i).flatMap(part=>resolve(part,exclude));
  const priced=raw.trim().match(/^(.+?)\s+at\s+(?:USD\s*|EUR\s*|\$|€)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:\/|per\s+)(month|mo|monthly|year|once)\s*$/i);
  if(priced){
   const matches=review.products.filter(p=>normalize(p.name)===normalize(priced[1]!));
   const amount=priceValueCents(priced[2]!.replaceAll(',',''));
   const cadence=/^(month|mo|monthly)$/i.test(priced[3]!)?'monthly':priced[3]==='once'?'once':'unsupported';
   if(matches.length!==1||matches[0]!.price.kind!=='fixed'||matches[0]!.price.amountCents!==amount||matches[0]!.price.currency!==(/[€]|\bEUR\b/i.test(raw)?'EUR':'USD')||matches[0]!.price.billing!==cadence)throw new Error('The approved price or billing does not match one eligible stored offering. Confirm the published terms or clarify the intended offering; no prices were changed.');
   return matches;
  }
  if(/[$€£¥]|\bUSD\b/i.test(raw))throw fail();
  const phrase=normalize(raw.replace(/\s+for now\s*$/i,'').replace(/^(?:the|any)\s+/i,''));
  const exact=review.products.filter(p=>normalize(p.name)===phrase);
  if(exact.length>1)throw fail();if(exact.length===1)return exact;
  const countWords:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
  const first=phrase.match(/^first\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(?:plans?|products?|services?|entries|offerings?))?$/);
  if(first){const count=countWords[first[1]!]??Number(first[1]);if(count<1||count>review.products.length)throw fail();return review.products.slice(0,count);}
  const ordinal=phrase.match(/^(?:the\s+)?(first|second|third|fourth|fifth|\d+(?:st|nd|rd|th)?)(?:\s+(?:plan|product|service|entry|offering))?$/);
  if(ordinal){const index=['first','second','third','fourth','fifth'].indexOf(ordinal[1]!);const p=review.products[index>=0?index:parseInt(ordinal[1]!)-1];if(!p)throw fail();return [p];}
  if(/^all(?: eligible)?(?: fixed price)?(?: (?:plans|products|services|entries|offerings))?$/.test(phrase))return /eligible|fixed price/.test(phrase)?review.products.filter(p=>p.price.kind==='fixed'):review.products;
  const parts=raw.split(/\s*,\s*(?:(?:and|or)\s+)?|\s+(?:and|or)\s+/i);
  if(parts.length>1)return parts.flatMap(part=>resolve(part,exclude));
  const tokens=words(phrase);if(!tokens.length)throw fail();
  const matches=review.products.filter(p=>{
   const tags=[p.name,p.description,p.price.billing==='monthly'?'monthly recurring subscription retainer':'',p.price.unit,/add[ -]?on/i.test(p.name)?'add ons':''].join(' ');
   const available=new Set(words(tags));return tokens.every(t=>available.has(t));
  });
  if(matches.length===1)return matches;
  // Plural/category exclusions may match many; positive vague descriptors cannot.
  if(matches.length>0){if(!exclude)ambiguousSelection=true;return matches;}
  throw fail();
 };
 const selected=resolve(include);
 const excluded=new Set([...clauses,...comparisons].flatMap(clause=>{
  // “Other plans” is the complement of the explicit selection. A plan merely
  // mentioning available add-ons in its terms is not itself an add-on.
  const other=normalize(clause).match(/^other (?:plans|products|services|entries)(?: or (add ons))?$/);
  if(other)return review.products.filter(p=>!selected.some(s=>s.id===p.id)||(other[1]&&/add[ -]?on/i.test(p.name)));
  return resolve(clause,true);
 }).map(p=>p.id));
 const result=[...new Map(selected.filter(p=>!excluded.has(p.id)).map(p=>[p.id,p])).values()];
 if(!result.length||(ambiguousSelection&&result.length!==1))throw fail();
 if(result.some(p=>p.price.kind!=='fixed'||(monthly&&p.price.billing!=='monthly')))throw new Error('Selected entries include unresolved or non-monthly terms. Which eligible entries should be imported? No prices were imported.');
 return result;
}
