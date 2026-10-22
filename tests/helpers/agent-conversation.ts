import assert from 'node:assert/strict';
import { Mastra } from '@mastra/core';
import { MastraLanguageModelV2Mock } from '@mastra/core/test-utils/llm-mock';
import { ProposalService } from '../../src/assistant/service.js';
import { createLegacySalesProposalAgent as createSalesProposalAgent } from '../../src/mastra/agents/legacy-proposal.js';
import { customTurns, draftOperation } from './conversation.js';

// Scripted model, real Mastra stream/generate loops, tools, validation and storage.
export async function runCustomConversation(s: ProposalService, thread?: string) {
  const queue: Record<string,unknown>[] = [];
  let calls = 0;
  const model = new MastraLanguageModelV2Mock({
    doGenerate: async () => {
      const operation = queue.shift();
      return {
        content: operation ? [{type:'tool-call' as const,toolCallId:`call-${++calls}`,toolName:'proposalWorkspace',input:JSON.stringify({ operation })}] : [{type:'text' as const,text:'Continue with the next step.'}],
        finishReason: operation ? 'tool-calls' as const : 'stop' as const,
        usage: {inputTokens:1,outputTokens:1,totalTokens:2}, warnings: [],
      };
    },
    doStream: async () => ({ stream: new ReadableStream({ start(controller) {
      const operation = queue.shift();
      if (operation) controller.enqueue({type:'tool-call',toolCallId:`call-${++calls}`,toolName:'proposalWorkspace',input:JSON.stringify({ operation })});
      else { controller.enqueue({type:'text-start',id:'text'}); controller.enqueue({type:'text-delta',id:'text',delta:'Continue with the next step.'}); controller.enqueue({type:'text-end',id:'text'}); }
      controller.enqueue({type:'finish',finishReason:operation?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}}); controller.close();
    } }) }),
  });
  const agent = createSalesProposalAgent(s, model);
  new Mastra({agents:{agent},logger:false});
  async function turn(text: string, operations: Record<string,unknown>[]) {
    const state = await s.run({action:'read'},'', thread ?? 'local');
    queue.push(...operations.map((op,index)=>({...op,revision:state.revision+index})));
    if (calls === 0) { const response = await agent.stream(text, thread ? { memory: { thread, resource: 'local-template-owner' } } : {}); await response.text; }
    else await agent.generate(text, thread ? { memory: { thread, resource: 'local-template-owner' } } : {});
    assert.equal(queue.length,0,'The Mastra loop consumed all planned tool calls');
  }
  for (const t of customTurns()) await turn(t.text,t.operations);
  await turn('Prepare and review the proposal',[await draftOperation(s, false, thread ?? 'local'),{action:'review'}]);
  const review = await s.run({action:'read'},'', thread ?? 'local');
  assert.ok(review.review, 'Actual runtime user messages reached the tools and validated the custom state');
  await turn('Generate the draft now',[{action:'generate'}]);
  const state = await s.run({action:'read'},'', thread ?? 'local');
  return { state, calls };
}

// Provider is scripted, but Studio's streaming loop and the sample tool are real.
export async function runSampleConversation(s: ProposalService, sample: 'saas'|'consulting'|'agency') {
  let calls=0;
  const model=new MastraLanguageModelV2Mock({ doStream: async input => ({stream:new ReadableStream({start(controller) {
    if (++calls===1) {
      assert.deepEqual(input.toolChoice,{type:'tool',toolName:'generateSample'});
      controller.enqueue({type:'tool-call',toolCallId:'sample',toolName:'generateSample',input:JSON.stringify({sample})});
    } else {
      assert.equal(input.toolChoice?.type,'auto');
      controller.enqueue({type:'text-start',id:'answer'});
      controller.enqueue({type:'text-delta',id:'answer',delta:'Draft generated; see the artifact paths.'});
      controller.enqueue({type:'text-end',id:'answer'});
    }
    controller.enqueue({type:'finish',finishReason:calls===1?'tool-calls':'stop',usage:{inputTokens:1,outputTokens:1,totalTokens:2}});
    controller.close();
  }})})});
  const agent=createSalesProposalAgent(s,model);
  new Mastra({agents:{agent},logger:false});
  const result=await agent.stream(`Generate a ${sample} sample proposal.`,{memory:{thread:sample,resource:'test-owner'}});
  await result.text;
  assert.equal(calls,2,'One generation tool followed by the final answer, without a confirmation loop');
  return s.run({action:'read'},'',sample);
}
