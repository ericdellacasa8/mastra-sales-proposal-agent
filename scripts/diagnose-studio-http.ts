// Historical low-level tool diagnostic; production uses the turn coordinator.
import { createHonoServer } from '@mastra/deployer/server';
import { Mastra } from '@mastra/core';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { createLegacySalesProposalAgent as createSalesProposalAgent } from '../src/mastra/agents/legacy-proposal.js';
import { ProposalService } from '../src/assistant/service.js';
import { WorkspaceStore } from '../src/assistant/store.js';

const root = await mkdtemp(join(tmpdir(),'mastra-real-http-'));
const service = new ProposalService(new WorkspaceStore(root));
let calls = 0;
const model = new MastraLanguageModelV2Mock({ doStream: async () => ({stream: new ReadableStream({start(c) {
 if (++calls % 2 === 1) c.enqueue({type:'tool-call',toolCallId:`sample-${calls}`,toolName:'generateSample',input:'{"sample":"saas"}'});
 else {c.enqueue({type:'text-start',id:'text'});c.enqueue({type:'text-delta',id:'text',delta:'Inspect the tool result.'});c.enqueue({type:'text-end',id:'text'});}
 c.enqueue({type:'finish',finishReason:calls%2===1?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}});c.close();
}})})});
if (process.argv.includes('--openai-protocol')) {
 process.env.OPENAI_API_KEY = 'deterministic-test-not-a-real-key';
 let requests = 0;
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.includes('api.openai.com')) return originalFetch(input, init);
  const body = JSON.parse(String(init?.body));
  console.log(JSON.stringify({providerEndpoint:url,requestKeys:Object.keys(body),model:body.model}));
  const tool = ++requests % 2 === 1;
  const call = {id:'fc_diagnostic',type:'function_call',call_id:'call_diagnostic',name:'generateSample',arguments:'{"sample":"saas"}',status:'completed'};
  let events: unknown[];
  if (url.includes('/responses')) {
   const output = tool ? [call] : [{id:'msg_diagnostic',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Inspect the tool result.',annotations:[]}]}];
   events = [
    {type:'response.created',response:{id:`resp_${requests}`,model:'gpt-5-mini',created_at:1792419000,status:'in_progress'}},
    ...(tool ? [
      {type:'response.output_item.added',output_index:0,item:{...call,arguments:'',status:'in_progress'}},
      {type:'response.function_call_arguments.delta',item_id:call.id,output_index:0,delta:call.arguments},
      {type:'response.function_call_arguments.done',item_id:call.id,output_index:0,arguments:call.arguments},
      {type:'response.output_item.done',output_index:0,item:call},
    ] : [
      {type:'response.output_item.added',output_index:0,item:output[0]},
      {type:'response.content_part.added',item_id:'msg_diagnostic',output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
      {type:'response.output_text.delta',item_id:'msg_diagnostic',output_index:0,content_index:0,delta:'Inspect the tool result.'},
      {type:'response.output_item.done',output_index:0,item:output[0]},
    ]),
    {type:'response.completed',response:{id:`resp_${requests}`,model:'gpt-5-mini',status:'completed',output,usage:{input_tokens:1,output_tokens:1,total_tokens:2}}},
   ];
  } else {
   events = [{id:'chat_diagnostic',object:'chat.completion.chunk',created:1792419000,model:'gpt-5-mini',choices:[{index:0,delta:tool?{role:'assistant',tool_calls:[{index:0,id:call.call_id,type:'function',function:{name:call.name,arguments:call.arguments}}]}:{role:'assistant',content:'Inspect the tool result.'},finish_reason:null}]},
    {id:'chat_diagnostic',object:'chat.completion.chunk',created:1792419000,model:'gpt-5-mini',choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}];
  }
  return new Response(events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 };
}
const agent = createSalesProposalAgent(service,process.argv.includes('--openai-protocol')||process.argv.includes('--live')?'openai/gpt-5-mini':model);
if (process.argv.includes('--trace')) {
 const tool=(await agent.listTools()).generateSample!;
 const execute=tool.execute!;
 tool.execute=async(input,context)=>{
  console.log(JSON.stringify({toolContext:{agentPresent:!!context?.agent,thread:context?.agent?.threadId,requestContextPresent:!!context?.requestContext,inputMessages:context?.agent?.messages,liveMessages:context?.agent?.getMessages?.()}}));
  return execute(input,context);
 };
}
const mastra = new Mastra({agents:{salesProposalAgent:agent},logger:false});
const app = await createHonoServer(mastra,{tools:{},isDev:true,browserStream:false});
try {
let text: string;
if (process.argv.includes('--signals')) {
 const abort = new AbortController();
 const response = await app.request('/api/agents/salesProposalAgent/threads/subscribe', {method:'POST',headers:{'Content-Type':'application/json','x-mastra-client-type':'studio'},body:JSON.stringify({threadId:'p0-real-http',resourceId:'local-owner'}),signal:abort.signal});
 console.log('Subscription HTTP',response.status);
 const reader = response.body!.getReader();
 let captured='';
 const reading=(async()=>{while(true){const part=await reader.read();if(part.done)break;captured+=new TextDecoder().decode(part.value);if(captured.includes('"type":"finish"'))break;}return captured})();
 const sent=await app.request('/api/agents/salesProposalAgent/send-message',{method:'POST',headers:{'Content-Type':'application/json','x-mastra-client-type':'studio'},body:JSON.stringify({message:'Create a SaaS sample proposal now',resourceId:'local-owner',threadId:'p0-real-http',ifIdle:{streamOptions:{}}})});
 console.log('Send HTTP',sent.status,await sent.text());
 let timer: ReturnType<typeof setTimeout>;
 try { text=await Promise.race([reading,new Promise<string>((_,reject)=>{timer=setTimeout(()=>reject(new Error('No completed agent run after 30 seconds; check model connectivity')),30000)})]); }
 finally {clearTimeout(timer!);abort.abort();await reader.cancel();}
} else {
 const response = await app.request('/api/agents/salesProposalAgent/stream', {
  method:'POST',headers:{'Content-Type':'application/json','x-mastra-client-type':'studio'},
  body:JSON.stringify({untilIdle:true,messages:[{id:'p0-user',role:'user',parts:[{type:'text',text:'Create a SaaS sample proposal now'}]}],memory:{thread:'p0-real-http',resource:'local-owner'}}),
 });
 text=await response.text();console.log('Stream HTTP',response.status);
}
assert.ok(!text.includes('A real salesperson message is required for changes'), 'Runtime rejected the real user signal');
const state=await service.run({action:'read'},'','p0-real-http');
console.log(JSON.stringify({mode:state.mode,artifacts:state.artifacts,root}));
assert.ok(state.artifacts?.current, 'No current artifacts: inspect runtime errors');
for (const filename of ['email.html','proposal.html','design.json','proposal.json']) {
 const path=join(state.artifacts.directory,filename);
 assert.ok((await stat(path)).size>0);
 const content=await readFile(path,'utf8');
 assert.ok(content.includes('Demo Lumenboard Cloud'),`${filename}: seller missing`);
 assert.ok(content.includes('Fictional Robotics Lab'),`${filename}: customer missing`);
 console.log(`Verified ${path}`);
}
assert.deepEqual(state.review?.proposal.totals,{monthlyCents:26493,oneTimeCents:45000,firstMonthCents:71493,firstYearCents:362916});
for (const filename of ['email.html','proposal.html','design.json']) {
 const content=await readFile(join(state.artifacts.directory,filename),'utf8');
 for(const value of ['Release coordination hub','Editor license','Migration session','$264.93','$714.93','$3,629.16']) assert.ok(content.includes(value),`${filename}: missing ${value}`);
}

if(process.argv.includes('--require-pdf')) {
 assert.equal(state.artifacts.completeness,'complete','PDF generation failed; see runtime result');
 const pdf=join(state.artifacts.directory,'proposal.pdf');
 assert.ok((await stat(pdf)).size>1000);
 assert.equal((await readFile(pdf)).subarray(0,5).toString(),'%PDF-');
 console.log(`Verified ${pdf}`);
}


} finally { await mastra.shutdown(); }
