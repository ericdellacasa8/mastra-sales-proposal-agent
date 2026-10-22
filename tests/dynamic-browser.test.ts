import { dynamicStressInput } from './dynamic-fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { fixtureIds, fixtureProposal, loadFixture } from '../src/proposal/fixtures.js';
import { finalizeProposal } from '../src/proposal/finalize.js';
import { preparePrintLayout } from '../src/rendering/layout.js';
import { renderProposal } from '../src/rendering/render.js';
import { renderPdf, assertPdf } from '../src/rendering/pdf.js';
const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;

test('three independent sellers: offline email/document layout and actual PDFs', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  try {
    await mkdir('data/qa/dynamic', { recursive: true });
    for (const id of fixtureIds) {
      const { input, proposal } = fixtureProposal(id);
      const rendered = renderProposal(proposal, input.commercial);
      const context = await browser.newContext({ javaScriptEnabled: false });
      const requests: string[] = [];
      await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      const page = await context.newPage();
      for (const width of [375, 900]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(rendered.emailHtml);
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${id}: email has no horizontal overflow`);
        assert.equal(await page.locator('html').getAttribute('lang'), 'en');
        await page.screenshot({ path: `data/qa/dynamic/${id}-email-${width}.png` });
      }
      await page.setViewportSize({ width: 703, height: 1009 });
      await page.emulateMedia({ media: 'print' });
      await page.setContent(rendered.documentHtml);
      const layout = await preparePrintLayout(page);
      assert.equal(await page.locator('.proposal-pricing').evaluate(el => getComputedStyle(el).breakBefore), 'auto', 'No forced investment chapter');
      if (id === 'consulting') assert.ok(layout.contentHeight <= 1009, `Compact content must fit A4: ${layout.contentHeight}px`);
      for (const spacer of await page.locator('.proposal-pricing thead[aria-hidden="true"], .proposal-pricing tfoot[aria-hidden="true"]').all()) {
        assert.equal(await spacer.evaluate(el => getComputedStyle(el).display), 'none');
      }
      assert.equal(await page.locator('.proposal-card-row h3').count(), proposal.lineItems.length);
      assert.equal(await page.locator('img').evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)), true);
      const text = await page.locator('body').innerText();
      assert.ok(text.includes(proposal.seller.name));
      for (const other of fixtureIds.filter(other => other !== id)) assert.ok(!text.includes(loadFixture(other).commercial.seller.name));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      for (const row of await page.locator('.proposal-pricing tr').all()) assert.equal(await row.evaluate(el => getComputedStyle(el).breakInside), 'avoid');
      const pricing = await page.locator('.proposal-pricing').boundingBox();
      assert.ok(pricing && pricing.height < 1009, 'Sample pricing fits a printable page');
      assert.deepEqual(requests, []);
      await context.close();
      const pdf = await renderPdf(rendered.documentHtml, proposal.seller);
      assertPdf(pdf);
      assert.equal(pageCount(pdf), id === 'consulting' ? 1 : 2, `${id}: standard fixture should occupy two pages`);
      await writeFile(`data/qa/dynamic/${id}.pdf`, pdf);
    }
  } finally { await browser.close(); }
});

test('changed inputs and long additional recommendations generate new PDFs without a two-page clamp', async () => {
  const original = fixtureProposal('agency');
  const originalPdf = await renderPdf(renderProposal(original.proposal, original.input.commercial).documentHtml, original.proposal.seller);
  const input = dynamicStressInput();
  const changed = finalizeProposal(input.discovery, input.draft, input.commercial);
  const rendered = renderProposal(changed, input.commercial);
  const pdf = await renderPdf(rendered.documentHtml, changed.seller);
  assert.ok(!originalPdf.equals(pdf));
  assert.ok(pageCount(pdf) > 2, 'Long content is allowed additional pages');
  assert.equal(changed.lineItems.length, 7);
  assert.equal(changed.totals.oneTimeCents, 125000);
  await mkdir('data/qa/dynamic', {recursive:true});
  await writeFile('data/qa/dynamic/agency-long.pdf', pdf);
  await writeFile('data/qa/dynamic/agency-long.html', rendered.documentHtml);
});

test('adaptive layout: word boundaries, investment geometry, artwork and repeatable measurement', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false });
    const requests: string[] = [];
    await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
    for (const cents of [1, 999, 1234567890123]) {
      const input = loadFixture('saas');
      input.commercial.seller.name = 'Lumenboard International Collaboration Technologies';
      input.commercial.catalog.products.forEach((product, index) => { product.unitPriceCents = index === 0 ? cents : 0; });
      if (cents === 999) input.commercial.seller.artwork = { ...input.commercial.seller.logo!, alt: 'Custom seller artwork' };
      delete input.commercial.seller.logo;
      const p = finalizeProposal(input.discovery, input.draft, input.commercial);
      const r = renderProposal(p, input.commercial);
      for (const width of [375, 900]) {
        await page.emulateMedia({ media: 'screen' });
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(r.emailHtml);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      await page.setContent(r.documentHtml);
      const layout = await preparePrintLayout(page);
      assert.deepEqual(await preparePrintLayout(page), layout, 'Layout pass is idempotent');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const geometry = await page.evaluate(() => {
        const wordmark = document.querySelector('.seller-wordmark')!;
        const node = wordmark.firstChild!;
        const text = node.textContent!;
        const words = [...text.matchAll(/\S+/g)].map(match => {
          const range = document.createRange();
          range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
          return [...range.getClientRects()].length;
        });
        const metrics = [...document.querySelectorAll<HTMLElement>('.investment-metric')].map(el => {
          const label = el.querySelector('.investment-label')!.getBoundingClientRect();
          const amount = el.querySelector('.investment-value')!.getBoundingClientRect();
          const caption = el.querySelector('.investment-caption')!.getBoundingClientRect();
          return { overlap: label.bottom > amount.top, captionOverlap: amount.bottom > caption.top, overflow: el.scrollWidth > el.clientWidth + 1 };
        });
        return { words, metrics };
      });
      assert.ok(geometry.words.every(lines => lines === 1), 'Each company-name word stays intact');
      for (const metric of geometry.metrics) assert.deepEqual(metric, { overlap: false, captionOverlap: false, overflow: false });
      assert.equal(await page.locator('.proposal-summary img').count(), cents === 999 ? 1 : 0);
      assert.equal(await page.locator('img').evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)), true);
    }
    assert.deepEqual(requests, []);
  } finally { await browser.close(); }
});
