import { demoCommercial } from '../src/proposal/catalog.js';
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { sampleProposal } from '../src/proposal/samples.js';
import { renderProposal } from '../src/rendering/render.js';
import { assertPdf, renderPdf, PDF_SIZE_LIMIT } from '../src/rendering/pdf.js';
import { verifyPreview, writePreview } from '../src/services/artifacts.js';

async function temporary(run: (directory: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'proposal-test-'));
  try { await run(join(root, 'sample')); } finally { await rm(root, { recursive: true, force: true }); }
}
const rendered = () => renderProposal(sampleProposal('software'), demoCommercial);
// Deliberately fake bytes for storage-boundary tests only. Real PDFs are tested
// separately in pdf.test.ts. These bytes are never published as sample previews.
const pdfStub = Buffer.from('%PDF-1.7\nSTORAGE TEST FIXTURE\n%%EOF');

test('atomic preview bundle contains only expected files and verified hashes', async () => temporary(async directory => {
  const manifest = await writePreview(directory, rendered(), pdfStub);
  assert.equal(manifest.completeness, 'complete');
  assert.deepEqual((await readdir(directory)).sort(), ['design.json', 'email.html', 'email.txt', 'manifest.json', 'proposal.html', 'proposal.json', 'proposal.pdf']);
  assert.deepEqual(await verifyPreview(directory), manifest);
  await writeFile(join(directory, 'email.html'), 'modified');
  await assert.rejects(verifyPreview(directory), /checksum mismatch/);
}));
test('manifest metadata tampering and path traversal are rejected', async () => temporary(async directory => {
  const manifest = await writePreview(directory, rendered());
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, recipient: 'other@example.com' }));
  await assert.rejects(verifyPreview(directory), /Manifest checksum/);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, files: { ...manifest.files, '../escape': 'a'.repeat(64) } }));
  await assert.rejects(verifyPreview(directory));
}));
test('HTML-only replacement removes stale PDF and is explicitly incomplete', async () => temporary(async directory => {
  await writePreview(directory, rendered(), pdfStub);
  await writePreview(directory, rendered());
  assert.equal((await verifyPreview(directory)).completeness, 'html-only');
  assert.ok(!(await readdir(directory)).includes('proposal.pdf'));
}));
test('invalid output or concurrent claim leaves previous preview unchanged', async () => temporary(async directory => {
  await writePreview(directory, rendered());
  const original = await readFile(join(directory, 'manifest.json'), 'utf8');
  await assert.rejects(writePreview(directory, rendered(), Buffer.from('not a PDF')), /nonempty PDF/);
  await assert.rejects(writePreview(directory, { ...rendered(), emailHtml: 'x'.repeat(100_000) }), /100,000/);
  await mkdir(`${directory}.lock`);
  await assert.rejects(writePreview(directory, rendered()), /EEXIST/);
  assert.equal(await readFile(join(directory, 'manifest.json'), 'utf8'), original);
  await rm(`${directory}.lock`, { recursive: true });
}));
test('PDF limits reject empty, wrong-format and oversized bytes', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('html'), Buffer.alloc(PDF_SIZE_LIMIT)]) assert.throws(() => assertPdf(bytes));
});
test('PDF renderer closes browser when page setup fails', async () => {
  let closed = false;
  const replacement = mock.method(chromium, 'launch', async () => ({
    newContext: async () => { throw new Error('test setup failure'); },
    close: async () => { closed = true; },
  }));
  try { await assert.rejects(renderPdf('<p>test</p>', sampleProposal('software').seller), /test setup failure/); assert.equal(closed, true); }
  finally { replacement.mock.restore(); }
});
test('browser launch error gives actionable instructions without pretending PDF success', async () => {
  const replacement = mock.method(chromium, 'launch', async () => { throw new Error('test missing browser'); });
  try { await assert.rejects(renderPdf('<p>test</p>', sampleProposal('software').seller), /browser:install.*ordinary Terminal.*No PDF was generated/); }
  finally { replacement.mock.restore(); }
});

test('print-layout callbacks execute after serialization without Node transpiler helpers', async () => {
  // Playwright serializes the tsx-transformed function, not its source TypeScript.
  // A fresh VM exposes the same missing-closure error without launching Chromium.
  const { runInNewContext } = await import('node:vm');
  const { preparePrintLayout } = await import('../src/rendering/layout.js');
  for (const [normal, compact, expected] of [[700, 650, 'natural'], [1100, 950, 'compact'], [1600, 1400, 'paged']] as const) {
    const classes = new Set<string>(['proposal-paged']);
    const classList = {
      remove: (...names: string[]) => names.forEach(name => classes.delete(name)),
      add: (name: string) => classes.add(name),
      contains: (name: string) => classes.has(name),
    };
    const document = {
      fonts: { ready: Promise.resolve() }, body: { classList },
      querySelector: (selector: string) => selector === '.proposal-pricing'
        ? { scrollWidth: 680, clientWidth: 680, getBoundingClientRect: () => ({ height: 400 }) }
        : selector === '.proposal-footer'
          ? { getBoundingClientRect: () => ({ bottom: classes.has('proposal-compact') ? compact : normal }) }
          : null,
    };
    const page = {
      setViewportSize: async () => {}, emulateMedia: async () => {},
      evaluate: async (callback: Function, argument?: unknown) => runInNewContext(`(${callback.toString()})(argument)`, { document, window: { scrollY: 0 }, argument }),
    };
    const result = await preparePrintLayout(page as unknown as import('playwright').Page);
    assert.equal(result.compact, expected === 'compact');
    assert.equal(classes.has('proposal-paged'), false, 'Long content must flow without a forced chapter break');
    assert.equal(result.contentHeight, expected === 'compact' ? compact : normal);
  }
});
