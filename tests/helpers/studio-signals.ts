import {createSalesProposalAgent as createV1Agent} from '../../src/mastra/agents/sales-proposal.js';
import {createSalesProposalAgent as createCoordinatedAgent} from '../../src/mastra/agents/coordinator-regression.js';
import {randomUUID} from 'node:crypto';
import type {WebPage} from '../../src/assistant/website-fetch.js';
import {LibSQLStore} from '@mastra/libsql';
import assert from 'node:assert/strict';
import {Mastra} from '@mastra/core';
import {MastraLanguageModelV2Mock} from '@mastra/core/test-utils/llm-mock';
import {createHonoServer} from '@mastra/deployer/server';
import {createLegacySalesProposalAgent as createSalesProposalAgent} from '../../src/mastra/agents/legacy-proposal.js';
import {previewRoutes} from '../../src/assistant/previews.js';
import type {ProposalService} from '../../src/assistant/service.js';

/** Real Studio HTTP/signal scheduler. Only provider output is scripted by default. */
export async function studioSignals(service:ProposalService,live=false,tracePrices=false, threadId='acme', websiteFetch?: (url:string)=>Promise<WebPage>,coordinated:boolean|'v1'=false) {
 const queue:unknown[]=[];
 const prompts:unknown[]=[];
 const modelTools:unknown[]=[];
 const modelChoices:unknown[]=[];
 let answer='Scripted model: inspect tool result.';
 let id=0;const callPrefix=randomUUID();
 const model=new MastraLanguageModelV2Mock({doStream:async(options)=>{prompts.push(options.prompt);modelChoices.push(options.toolChoice);modelTools.push(...(options.tools??[]));return {stream:new ReadableStream({start(c){
  if(options.toolChoice?.type==='none')queue.length=0;
  const operation=queue.shift();
  if(operation) {
   const candidate=(operation as {candidate?:unknown}).candidate;
   const website=(operation as {website?:unknown}).website;
   const save=(operation as {save?:unknown}).save;
   const narrative=(operation as {action?:string}).action==='reviseNarrative';
   c.enqueue({type:'tool-call',toolCallId:`${callPrefix}-${++id}`,toolName:candidate?'submitCandidate':save?'saveProposal':website?'websiteDiscovery':narrative?'reviseNarrative':'proposalWorkspace',input:JSON.stringify(candidate??save??(website?{operation:website}:(narrative?operation:{operation})))});
  }
  else{c.enqueue({type:'text-start',id:'answer'});c.enqueue({type:'text-delta',id:'answer',delta:answer});c.enqueue({type:'text-end',id:'answer'});}
  c.enqueue({type:'finish',finishReason:operation?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}});c.close();
 }})};}});
 const agent=(coordinated==='v1'?createV1Agent:coordinated?createCoordinatedAgent:createSalesProposalAgent)(service,live?'openai/gpt-5-mini':model,websiteFetch);
 const mastra=new Mastra({agents:{salesProposalAgent:agent},logger:false,server:{apiRoutes:previewRoutes(service.store)}});
 const app=await createHonoServer(mastra,{tools:{},isDev:true,browserStream:false});
 const abort=new AbortController();
 const headers={'Content-Type':'application/json','x-mastra-client-type':'studio'};
 const response=await app.request('/api/agents/salesProposalAgent/threads/subscribe',{method:'POST',headers,body:JSON.stringify({threadId,resourceId:'local-owner'}),signal:abort.signal});
 assert.equal(response.status,200);
 const reader=response.body!.getReader();
 async function turn(message:string,operations:unknown[]=[], expectToolErrors=false,finalAnswer='Scripted model: inspect tool result.',files?:Array<{data:string;mediaType:string}>) {
  answer=finalAnswer;
  if(!live)queue.push(...operations);
  const start=performance.now();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const reading=(async()=>{let text='';while(true){const chunk=await reader.read();if(chunk.done)throw new Error('Subscription ended');text+=new TextDecoder().decode(chunk.value);if(text.includes('"type":"finish"'))return text;}})();
  const sent=await app.request('/api/agents/salesProposalAgent/send-message',{method:'POST',headers,body:JSON.stringify({message:files?[{type:'text',text:message},...files.map(file=>({type:'file',data:file.data,mediaType:file.mediaType}))]:message,threadId,resourceId:'local-owner',ifIdle:{streamOptions:{}}})});
  assert.equal(sent.status,200);
  try {
   const text=await Promise.race([reading,new Promise<string>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Studio run timed out after 120 seconds')),120_000)})]);
   const events=text.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
   if(tracePrices) {
    const workspace=await service.store.read();
    const sources=workspace.sources[service.store.sessionKey(threadId)] ?? {};
    function trace(value:unknown,path='operation'):void {
     if(!value || typeof value!=='object')return;
     const record=value as Record<string,unknown>;
     const quote=typeof record.quote==='string'?record.quote:record.action==='notes'&&typeof record.text==='string'?record.text:undefined;
     if(quote!==undefined)console.log(JSON.stringify({provenanceTrace:{path,sourceMessageId:record.sourceMessageId??null,
       sourceIdExists:typeof record.sourceMessageId==='string'&&!!sources[record.sourceMessageId],
       quote:quote.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'<email redacted>'),
       extractedValue:record.value??record.quantity??null,matchingCapturedSources:Object.values(sources).filter(s=>s.text.includes(quote)).length}}));
     for(const [key,child] of Object.entries(record))if(child&&typeof child==='object')trace(child,`${path}.${key}`);
    }
    for(const event of events.filter(e=>e.type==='tool-call'))trace(event.payload?.args?.operation ?? event.payload?.args);
    for(const event of events.filter(e=>e.type==='tool-result'))console.log(JSON.stringify({validationTrace:{ok:event.payload.result.ok,error:event.payload.result.error??null}}));
   }
   const results=events.filter(e=>e.type==='tool-result').map(e=>e.payload.result);
   if(!coordinated&&!expectToolErrors)for(const result of results)assert.equal(result.ok,true,result.error);
   return {toolCalls:events.filter(e=>e.type==='tool-call').length,latencyMs:Math.round(performance.now()-start),results,text};
  }finally{clearTimeout(timer);}
 }
 return {app,agent,prompts,modelTools,modelChoices,turn,close:async()=>{abort.abort();await reader.cancel();await mastra.shutdown();const memory=await agent.getMemory();await memory?.settled();if(memory?.storage instanceof LibSQLStore)await memory.storage.close();}};
}
