import type {Proposal} from '../proposal/schema.js';
const normalized=(value:string)=>value.toLowerCase().replace(/[.\s]+/g,' ').trim();
/** Display-only cleanup. Persisted narrative, evidence and commercial fields are untouched. */
export function presentationProposal(proposal:Proposal):Proposal {
 const content=structuredClone(proposal.content);
 content.assumptions=content.assumptions.filter(value=>!value.startsWith('Quantity check:'));
 const goals=content.needs.map(n=>n.text).filter(value=>!/^Provide the requested (?:scope|offering and quantity)\.?$/i.test(value));
 const generic=/^Proposal for .+ covering the requested scope\./.test(content.summary)||content.summary.startsWith('Customer goal:');
 if(generic&&goals.length){
  const offering=proposal.lineItems.map(item=>`${item.name} (quantity: ${item.quantity})`).join(', ');
  const objectives=goals.flatMap(goal=>goal.split(/;\s*/)).map(goal=>goal.trim().replace(/[.!]+$/,'')).filter(Boolean);
  const infinitives=objectives.every(goal=>/^(?:to )?(?:boost|maximize|minimize|improve|reduce|increase|support|enable|simplify|streamline|coordinate|evaluate|explore|adopt|automate|standardize|strengthen|develop|deliver|achieve|expand|consolidate|replace|understand|identify|prepare|manage|align|build)\b/i.test(goal));
  const phrases=objectives.map(goal=>goal.replace(/^to /i,'').replace(/^[A-Z]/,letter=>letter.toLowerCase()));
  const joined=phrases.length>1?`${phrases.slice(0,-1).join(', ')} and ${phrases.at(-1)}`:phrases[0];
  const intent=infinitives?`${proposal.customer.company}'s stated objectives are to ${joined}.`:`The customer described the intended outcomes as ${objectives.map(goal=>`“${goal}”`).join('; ')}.`;
  content.summary=`This proposal outlines ${offering} for ${proposal.customer.company}. ${intent} The proposed scope is a starting point for evaluating the offering against those objectives.`;
 }

 return {...proposal,content};
}
export function recommendationDescription(name:string,rationale:string,description:string):string|undefined {
 const redundant=(value:string)=>normalized(value)===normalized(name)||normalized(value)===normalized(`Provide the requested ${name}`);
 return [rationale,description].find(value=>value.trim()&&!redundant(value));
}
export function hasDistinctPriority(p:Proposal){
 return p.content.needs.some(n=>!/^Provide the requested (?:scope|offering and quantity)\.?$/i.test(n.text)&&!n.text.split(/;\s*/).every(part=>normalized(p.content.summary).includes(normalized(part.replace(/^to /i,'')))));
}
