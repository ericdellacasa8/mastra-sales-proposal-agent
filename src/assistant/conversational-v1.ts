import {proposalInputSchema} from './proposal-input.js';
import {assertOwner,type UserTurn} from './evidence.js';
import {type ProposalService,safeError} from './service.js';
export {proposalInputSchema as candidateSchema} from './proposal-input.js';
export type Outcome={status:string;text:string;[key:string]:unknown};
export type CapturedTurn=UserTurn&{text:string;thread:string;baseRevision:number};
/** Only text enters V1. Source research and attachment extraction are deliberately absent. */
export class TurnCoordinator {
 constructor(readonly service:ProposalService,_unusedFetch?:unknown){}
 async begin(text:string,thread:string,turn:UserTurn,_raw?:unknown){
  await this.service.capture(turn,text,thread);
  const workspace=await this.service.store.read(),key=this.service.store.sessionKey(thread);assertOwner(workspace,key,turn.resource);
  return {turn:{...turn,text,thread,baseRevision:workspace.sessions[key]?.revision??0},snapshot:{pending:workspace.v1Turns[key]?.candidate,proposal:workspace.sessions[key]?.draft}};
 }
 async accept(raw:unknown,turn:CapturedTurn):Promise<Outcome>{
  try{return await this.service.submitInput(proposalInputSchema.parse(raw),turn.text,turn.thread,turn,turn.baseRevision);}
  catch(error){return {status:'clarification_required',text:`The proposal was not finalized: ${safeError(error)}`};}
 }
}
