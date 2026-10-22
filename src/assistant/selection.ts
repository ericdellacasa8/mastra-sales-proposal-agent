/** Resolve only an explicit product/quantity clause, preserving the original bytes.
 * Prices and catalog approvals never establish purchased quantities. */
export function selectionSpan(message:string,name:string,quantity:number):string|undefined {
 const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`\\b${escaped}(?:\\s+only)?[,:\\s]+(?:(?:quantity|to)\\s+)?(\\d+|${words.slice(1).join('|')})(?![\\w.])`,'gi');
 const amount=`(\\d+|${words.slice(1).join('|')})(?![\\w.])`;
 const before=new RegExp(`\\b(?:use\\s+${amount}\\s+subscriptions?\\s+of|quantity\\s+${amount}\\s+for)\\s+${escaped}(?![\\w])`,'gi');
 // Exclusions may describe other products; never let them authorize this product.
 const exclusion=new RegExp(`\\b(?:not|exclude|without|remove|omit)\\s+(?:the\\s+)?${escaped}(?![\\w])`,'i');
 if(exclusion.test(message))throw new Error(`Should ${name} be purchased or excluded?`);
 let ambiguous=false;
 const spans:Array<{quote:string;quantity:number}>=[];
 for(const clause of message.split(/[.!?\n]/)) {
  const matches=[...clause.matchAll(pattern),...clause.matchAll(before)];
  const positive=clause.replace(/,\s*not\s+([^,;]+)$/i,(full,excluded:string)=>/\b(?:or|and|but)\b/i.test(excluded)||new RegExp(`\\b${escaped}(?![\\w])`,'i').test(excluded)?full:'');
  if(/\b(?:approve|accept|compare|comparison|alternative|exclude|remove|without|not|or)\b|don't/i.test(positive)){if(matches.length)ambiguous=true;continue;}
  for(const match of matches) {const value=match[1]??match[2]!;spans.push({quote:match[0],quantity:/^\d+$/.test(value)?Number(value):words.indexOf(value.toLowerCase())});}
 }
 if(ambiguous)throw new Error(`Should ${name} be purchased, and at what quantity? Approval or comparison is not a purchase selection.`);
 if(!spans.length)return;
 if(spans.length!==1||spans[0]!.quantity!==quantity)throw new Error(`Which quantity of ${name} should be included? The supplied selection is ambiguous or differs from the requested quantity.`);
 return spans[0]!.quote;
}
