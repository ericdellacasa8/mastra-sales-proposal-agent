import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProposalService } from '../src/assistant/service.js';
import { WorkspaceStore } from '../src/assistant/store.js';
import { assertPdf } from '../src/rendering/pdf.js';
import { verifyPreview } from '../src/services/artifacts.js';
import { runCustomConversation } from './helpers/agent-conversation.js';

test('custom Mastra conversation produces an actual Chromium PDF and verified complete bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proposal-conversation-browser-'));
  try {
    const { state } = await runCustomConversation(new ProposalService(new WorkspaceStore(root)));
    assert.equal(state.artifacts?.completeness, 'complete', 'Real Chromium must succeed; HTML-only fallback does not pass this test');
    const directory = state.artifacts!.directory;
    assert.equal((await verifyPreview(directory)).completeness, 'complete');
    const pdf = await readFile(join(directory, 'proposal.pdf'));
    assertPdf(pdf);
    assert.ok((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length >= 1);
    const proposal = JSON.parse(await readFile(join(directory, 'proposal.json'), 'utf8'));
    assert.equal(proposal.seller.name, 'Example Harbor Tools');
    assert.equal(proposal.customer.company, 'Example Ridge Guild');
    assert.equal(proposal.totals.monthlyCents, 30000);
  } finally { await rm(root, {recursive:true,force:true}); }
});

for (const sample of ['saas','consulting','agency'] as const) test(`one streamed ${sample} request produces a real PDF bundle`, async()=>{
  const {runSampleConversation}=await import('./helpers/agent-conversation.js');
  const {loadFixture}=await import('../src/proposal/fixtures.js');
  const root=await mkdtemp(join(tmpdir(),'proposal-sample-browser-'));
  try {
    const state=await runSampleConversation(new ProposalService(new WorkspaceStore(root)),sample);
    assert.equal(state.artifacts?.completeness,'complete','Real Chromium is required; HTML-only is a failure');
    const p=JSON.parse(await readFile(state.files!['proposal.json']!,'utf8'));
    const expected=loadFixture(sample);
    assert.equal(p.seller.name,expected.commercial.seller.name);
    assert.equal(p.customer.company,expected.discovery.customer.company);
    for (const file of ['email.html','proposal.html','design.json']) {
      const text=await readFile(state.files![file]!,'utf8');
      assert.ok(text.includes(p.seller.name) && text.includes(p.customer.company));
    }
    assertPdf(await readFile(state.files!['proposal.pdf']!));
    assert.equal((await verifyPreview(state.artifacts!.directory)).completeness,'complete');
  }finally{await rm(root,{recursive:true,force:true});}
});
