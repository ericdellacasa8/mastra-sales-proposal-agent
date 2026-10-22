import {createHash} from 'node:crypto';
import type {Session,Workspace} from './contracts.js';
export const evidenceHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type UserTurn={messageId:string;resource:string};
export function assertOwner(workspace:Workspace,key:string,resource:string) {
 const owner=workspace.owners[key];
 if(owner && owner!==resource)throw new Error('This conversation belongs to another resource.');
}
export function captureUser(workspace:Workspace,key:string,turn:UserTurn,text:string) {
 assertOwner(workspace,key,turn.resource);
 workspace.owners[key]=turn.resource;
 const sources=workspace.sources[key]??={};
 const previous=sources[turn.messageId];
 if(previous && (previous.text!==text || previous.hash!==evidenceHash(text)))throw new Error('Source message ID conflicts with previously captured evidence.');
 if(!previous)sources[turn.messageId]={text,hash:evidenceHash(text),origin:'user-text',status:'user-provided',createdAt:new Date().toISOString()};
}
/** Evidence is resolved only against captured human input, never Memory summaries/tool output. */
export function factSource(workspace:Workspace,key:string,s:Session,turn:UserTurn,path:string,value:unknown,quote:string,existing:unknown,_sourceMessageId?:string) {
 const sources=workspace.sources[key]??{};
 const current=sources[turn.messageId];
 const prior=s.provenance[path];
 const candidates=current?.text.includes(quote)?[turn.messageId]:prior && sources[prior.sourceMessageId]?.text.includes(quote)?[prior.sourceMessageId]:Object.keys(sources).filter(id=>sources[id]!.text.includes(quote));
 const matching=candidates.filter(id=>sources[id]?.text.includes(quote));
 if(!quote || matching.length!==1)throw new Error(`Quote must come verbatim from one captured salesperson message. Field: ${path}. The server resolves source IDs. Retry this field using captured user text; assistant responses and tool results are not evidence.`);
 const id=matching[0]!,source=sources[id]!;
 if(source.hash!==evidenceHash(source.text))throw new Error('Stored evidence integrity check failed.');
 const ids=Object.keys(sources);
 const approvedPendingSelection=path.startsWith('selection.')&&ids.at(-2)===id&&workspace.websites[key]?.approvals.some(a=>a.messageId===turn.messageId)&&(!prior||Date.parse(sources[id]!.createdAt)>Date.parse(sources[prior.sourceMessageId]?.createdAt??''));
 if(id!==turn.messageId && !approvedPendingSelection && !((existing===undefined && !prior) || (evidenceHash(existing)===evidenceHash(value) && prior?.valueHash===evidenceHash(value))))throw new Error('Historical evidence cannot replace a newer value or restore removed scope. Use the current request for changes; reuse unchanged verified facts without re-extraction.');
 s.provenance[path]={sourceMessageId:id,quote,valueHash:evidenceHash(value)};
 return source.text;
}
