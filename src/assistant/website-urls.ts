import {publicUrl} from './website-fetch.js';
import {evidenceHash} from './evidence.js';
import type {Workspace} from './contracts.js';

/** Index the persisted human ledger, never assistant text, web content or tool arguments. */
export function authorizedWebsiteUrls(workspace:Workspace,key:string){
 const found=new Map<string,{url:string;sourceMessageId:string}>();
 for(const [sourceMessageId,source] of Object.entries(workspace.sources[key]??{})){
  if(source.hash!==evidenceHash(source.text))throw new Error('Stored URL evidence integrity check failed.');
  const tokens=source.text.matchAll(/https?:\/\/[^\s<>"']+|(?<![\w@/:.-])(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi);
  for(const match of tokens){
   if(source.text[match.index!+match[0].length]==='@')continue;
   const raw=match[0].replace(/[),.;]+$/,'');
   try{const url=publicUrl(/^https?:/i.test(raw)?raw:`https://${raw}`).href;found.set(url,{url,sourceMessageId});}catch{/* Unsafe supplied links are not authorized. */}
  }
 }
 return [...found.values()];
}
const pathKey=(url:URL)=>url.origin+(url.pathname.replace(/\/+$/,'')||'/')+url.search;
const hostKey=(url:URL)=>url.hostname.replace(/^www\./,'').toLowerCase();
/** Resolve to a recorded URL, never fetch the model's guessed path or hostname. */
export function resolveWebsiteUrl(workspace:Workspace,key:string,input:string){
 const requested=publicUrl(input),supplied=authorizedWebsiteUrls(workspace,key);
 const exact=supplied.find(s=>s.url===requested.href);if(exact)return exact.url;
 const canonical=supplied.filter(s=>pathKey(new URL(s.url))===pathKey(requested));
 if(canonical.length===1)return canonical[0]!.url;
 const sameSite=supplied.filter(s=>hostKey(new URL(s.url))===hostKey(requested));
 if(sameSite.length===1)return sameSite[0]!.url;
 if(sameSite.length>1)throw new Error(`Ambiguous website reference. Use one of the already supplied URLs: ${sameSite.map(s=>s.url).join(', ')}. Do not ask the salesperson to paste them again.`);
 throw new Error('No explicitly supplied user URL matches this website. Use an authorized URL from the current thread; do not invent a destination.');
}
