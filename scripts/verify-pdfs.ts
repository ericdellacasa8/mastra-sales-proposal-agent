import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fixtureIds, fixtureProposal } from '../src/proposal/fixtures.js';
import { validateProposal } from '../src/proposal/finalize.js';
import { verifyPreview } from '../src/services/artifacts.js';
import { money } from '../src/rendering/sections.js';

const run = promisify(execFile);
async function main() {
  if (process.platform !== 'darwin') throw new Error('This optional text verifier uses macOS PDFKit. On other platforms run npm test and inspect the generated PDFs.');
  const temp = await mkdtemp(join(tmpdir(), 'proposal-pdf-check-'));
  try {
    const binary = join(temp, 'pdf-text');
    await run('clang', ['-fno-modules','-framework','Foundation','-framework','PDFKit',resolve('scripts/pdf-text.m'),'-o',binary]);
    const all = fixtureIds.map(id => ({ id, ...fixtureProposal(id) }));
    for (const { id, input, proposal } of all) {
      const directory = resolve('data/previews', id);
      assert.equal((await verifyPreview(directory)).completeness, 'complete', `${id}: generate full preview first`);
      const saved = validateProposal(JSON.parse(await readFile(join(directory, 'proposal.json'), 'utf8')), input.commercial);
      assert.deepEqual(saved, proposal, `${id}: preview is stale; regenerate from current fixture`);
      const { stdout } = await run(binary, [join(directory, 'proposal.pdf')], { maxBuffer: 2_000_000 });
      const pages: string[] = JSON.parse(stdout);
      assert.equal(pages.length, id === 'consulting' ? 1 : 2, `${id}: sample page count`);
      pages.forEach((page, index) => assert.ok(page.replace(/\s/g, '').includes(`${proposal.seller.name.replace(/\s/g, '')}|${index + 1}/${pages.length}`), `${id}: correct footer on page ${index + 1}`));
      const normalized = pages.join('\n').replace(/\s/g, '');
      for (const value of [proposal.seller.name, proposal.customer.name, proposal.customer.company, ...proposal.lineItems.flatMap(l => [l.name, money(l.unitPriceCents), money(l.lineTotalCents)])]) {
        assert.ok(normalized.includes((value ?? '').replace(/\s/g, '')), `${id}: PDF missing ${value}`);
      }
      for (const other of all.filter(v => v.id !== id)) assert.ok(!normalized.includes(other.proposal.seller.name.replace(/\s/g,'')), `${id}: foreign seller leakage`);
      assert.ok(!normalized.includes('Fennquill'));
      const pricing = pages.find(p => p.includes('Investment')) ?? '';
      for (const item of proposal.lineItems) assert.ok(pricing.replace(/\s/g,'').includes(item.name.replace(/\s/g,'')), `${id}: itemized pricing stays on investment page`);
      const totals = proposal.totals;
      for (const cents of totals.monthlyCents ? [totals.monthlyCents, totals.oneTimeCents, totals.firstMonthCents, totals.firstYearCents] : [totals.oneTimeCents]) {
        assert.ok(pricing.replace(/\s/g,'').includes(money(cents)), `${id}: total missing from investment page`);
      }
      console.log(`${id}: ${pages.length} PDF pages; seller/customer, product prices, totals and isolation verified`);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
