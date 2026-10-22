import {createHash} from 'node:crypto';
import type {z} from 'zod';
import {webSource,websiteInput} from './website-contracts.js';
type Review=Extract<z.infer<typeof websiteInput>,{action:'review'}>;
type Source=z.infer<typeof webSource>;
export const contentHash=(text:string)=>createHash('sha256').update(text).digest('hex');
/** Resolve a stored source span, not a model reconstruction. Explicit line ranges handle
 * tables/repeated headings; unique named blocks provide recovery for incomplete excerpts. */
export function candidateSpan(source:Source,product:Review['products'][number],products:Review['products']) {
 if(source.hash!==contentHash(source.text))throw new Error('Stored website evidence integrity check failed. Refetch the source; do not request pasted copies.');
 const lines=source.text.split('\n');let start=0,end=0;
 // Semantic headings often end with a navigation arrow; it is not part of the offering name.
 const heading=(line:string)=>line.replace(/\s*[→↗›»]\s*$/u,'');
 // The model may put a verified pricing excerpt in name.quote (as in Studio).
 // Reuse that exact block under the existing terms checks; never join/paraphrase it.
 const terms=product.terms??(product.name.quote?.startsWith(product.name.value+'\n')?{url:product.name.url,quote:product.name.quote}:undefined);
 if(terms&&'startLine' in terms){start=terms.startLine-1;end=terms.endLine;
  if(start<0||end<=start||end>lines.length)throw new Error('Invalid source line range. Read the stored source and retry with its line numbers.');
 }else if(terms&&source.text.includes(terms.quote)&&terms.quote.startsWith(product.name.value)&&/(?:\d|contact|custom|free)/i.test(terms.quote)){
  const offset=source.text.indexOf(terms.quote);start=source.text.slice(0,offset).split('\n').length-1;
  end=start+terms.quote.split('\n').length;
  // Preserve partial-line excerpts from legacy reviews exactly; their evidence is still verified.
  return {quote:terms.quote,startLine:start+1,endLine:end};
 }else{
  const matches=lines.flatMap((line,i)=>heading(line)===product.name.value?[i]:[]);
  if(!matches.length)throw new Error('Candidate name is absent from the source. Read the stored source and select its complete pricing block by line range; do not ask the user to paste it.');
  if(matches.length>1)return {quote:product.name.value,startLine:matches[0]!+1,endLine:matches[0]!+1,ambiguous:true};
  start=matches[0]!;
  const otherNames=new Set(products.filter(p=>p!==product&&p.name.url===product.name.url).map(p=>p.name.value));
  const next=lines.findIndex((line,i)=>i>start&&(otherNames.has(heading(line))||/^(?:FAQ|Frequently asked questions|Compare (?:all|plans|features)|Terms and conditions)$/i.test(line)));
  end=next<0?lines.length:next;
 }
 const quote=lines.slice(start,end).join('\n');
 if(!(quote===product.name.value||quote.startsWith(product.name.value+'\n')||quote.startsWith(product.name.value+' '))||quote.length>6000)throw new Error('Select a complete, bounded pricing block from the stored source lines, including its name and qualifications.');
 return {quote,startLine:start+1,endLine:end};
}
