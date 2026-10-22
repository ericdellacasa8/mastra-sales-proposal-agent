/** Opt-in live provider + real Chromium test. Fictional inputs only; never logs chat/tool payloads. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { money } from '../src/rendering/sections.js';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Mastra } from '@mastra/core';
import { ProposalService, safeError } from '../src/assistant/service.js';
import { WorkspaceStore } from '../src/assistant/store.js';
import { createSalesProposalAgent } from '../src/mastra/agents/sales-proposal.js';
import { verifyPreview } from '../src/services/artifacts.js';
import { assertPdf } from '../src/rendering/pdf.js';
import { loadFixture } from '../src/proposal/fixtures.js';

async function main() {
  if (!process.env.OPENAI_API_KEY && (!process.env.MODEL || process.env.MODEL.startsWith('openai/'))) throw new Error('Set OPENAI_API_KEY in .env for this opt-in live test. Offline previews need no key.');
  const parent=resolve('data/qa/agent-live');
  await mkdir(parent,{recursive:true,mode:0o700});
  const root=await mkdtemp(join(parent,'run-'));
  let pdfTextBinary: string | undefined;
  const service=new ProposalService(new WorkspaceStore(root));
  const agent=createSalesProposalAgent(service);
  new Mastra({agents:{agent},logger:false});
  async function turn(thread: string, text: string) {
    // Studio uses streaming: exercise that path with the actual configured provider.
    const response=await agent.stream(text,{memory:{thread,resource:'fictional-live-test'}});
    await response.text;
    return service.run({action:'read'},'',thread);
  }
  async function artifacts(thread: string, seller: string, customer: string, monthly: number, once: number) {
    const state=await service.run({action:'read'},'',thread);
    assert.equal(state.artifacts?.completeness,'complete','The real model must generate a real PDF in this turn; another confirmation prompt is a failure');
    const directory=state.artifacts!.directory;
    assert.equal((await verifyPreview(directory)).completeness,'complete');
    const proposal=JSON.parse(await readFile(join(directory,'proposal.json'),'utf8'));
    assert.equal(proposal.seller.name,seller); assert.equal(proposal.customer.company,customer);
    assert.deepEqual(proposal.totals,{monthlyCents:monthly,oneTimeCents:once,firstMonthCents:monthly+once,firstYearCents:12*monthly+once});
    for (const file of ['email.html','proposal.html','design.json']) {
      const text=await readFile(join(directory,file),'utf8');
      assert.ok(text.includes(seller) && text.includes(customer),file);
    }
    assertPdf(await readFile(join(directory,'proposal.pdf')));
    if (process.platform === 'darwin') {
      // Reuse the existing native verifier; no new PDF parser dependency.
      const run=promisify(execFile);
      if (!pdfTextBinary) {
        pdfTextBinary=join(root,'pdf-text');
        await run('clang',['-fno-modules','-framework','Foundation','-framework','PDFKit',resolve('scripts/pdf-text.m'),'-o',pdfTextBinary]);
      }
      const {stdout}=await run(pdfTextBinary,[join(directory,'proposal.pdf')],{maxBuffer:2_000_000});
      const pages: string[]=JSON.parse(stdout);
      const text=pages.join(' ').replace(/\s/g,'');
      const values: string[]=[seller,customer,proposal.customer.name,...proposal.lineItems.flatMap((item: {name:string;unitPriceCents:number;lineTotalCents:number})=>[item.name,money(item.unitPriceCents),money(item.lineTotalCents)]),money(monthly || once)];
      for (const value of values) assert.ok(text.includes(value.replace(/\s/g,'')),`PDF missing expected content: ${value}`);
    } else console.log('PDF signature/bundle verified; inspect PDF text manually on this platform.');
    console.log(`PASS ${thread}: ${directory}`);
    return directory;
  }
  for (const [sample,monthly,once] of [['saas',26493,45000],['consulting',0,550000],['agency',291000,35000]] as const) {
    await turn(sample,sample === 'saas' ? 'Create a SaaS sample proposal now' : `Generate a ${sample === 'agency'?'marketing agency':sample} sample proposal now.`);
    const fixture=loadFixture(sample);
    await artifacts(sample,fixture.commercial.seller.name,fixture.discovery.customer.company,monthly,once);
  }
  for (const reply of ['yes','go ahead','use the first option']) {
    const thread=`context-${reply}`;
    await turn(thread,'Hi. What are my options?');
    await turn(thread,reply);
    const fixture=loadFixture('saas');
    await artifacts(thread,fixture.commercial.seller.name,fixture.discovery.customer.company,26493,45000);
  }
  await turn('custom', 'Create my own proposal now. Seller: Example Beacon Studio. Contact hello@beacon.example. Customer: Sam Example at Example Orchard Team, sam@orchard.example. Product: Planning access. Description: Named access to shared weekly planning. Unit price: $40 per month. Include 6 Planning access units. Discovery: The team needs a shared planning space to coordinate its weekly schedule and make ownership visible. Scope and timing are not yet confirmed. Terms: Scope and timing remain to be agreed. This is an estimate, not a contract. Use the default styling. Generate the draft with these facts.');
  const original=await artifacts('custom','Example Beacon Studio','Example Orchard Team',24000,0);
  await turn('custom','Increase Planning access to 15 units and change the customer name to Taylor Example. Regenerate the draft.');
  const revised=await artifacts('custom','Example Beacon Studio','Example Orchard Team',60000,0);
  assert.notEqual(revised,original);
  assert.equal((await service.run({action:'read'},'','custom')).customer.name,'Taylor Example');
  console.log('Live model and Chromium verification passed. All output is fictional; no delivery capability exists.');
}
main().catch(error=>{console.error(`FAIL: ${safeError(error)}`);process.exitCode=1;});
