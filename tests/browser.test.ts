import { demoCommercial } from '../src/proposal/catalog.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { sampleProposal } from '../src/proposal/samples.js';
import { preparePrintLayout } from '../src/rendering/layout.js';
import { renderProposal } from '../src/rendering/render.js';

// Capture every vertical region without Chromium's captureBeyondViewport path.
// Keep the original viewport dimensions so responsive layout stays unchanged.
async function screenshotPage(page: Page, name: string) {
  const viewport = page.viewportSize();
  assert.ok(viewport);
  const height = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
  assert.ok(height > 0 && height <= 30_000, `Unexpected page height: ${height}`);
  for (let y = 0, part = 1; y < height; y += viewport.height, part++) {
    const target = Math.min(y, Math.max(0, height - viewport.height));
    await page.evaluate(top => window.scrollTo(0, top), target);
    await page.waitForFunction(top => Math.abs(window.scrollY - top) <= 1, target);
    const png = await page.screenshot({
      path: `data/qa/${name}${part === 1 ? '' : `-${part}`}.png`,
      fullPage: false,
    });
    assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
}

test('Chromium: mobile/desktop rendering, accessible links, offline output and screenshots', async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  try {
    await mkdir('data/qa', { recursive: true });
    for (const id of ['software', 'healthcare'] as const) {
      const r = renderProposal(sampleProposal(id), demoCommercial);
      for (const width of [375, 900]) {
        const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width, height: 900 } });
        const requests: string[] = [];
        await context.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
        const page = await context.newPage();
        await page.setContent(r.emailHtml);
        assert.equal(await page.locator('html').getAttribute('lang'), 'en');
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        for (const link of await page.locator('a').all()) assert.ok((await link.textContent())?.trim());
        assert.deepEqual(requests, []);
        await screenshotPage(page, `${id}-email-${width}`);
        assert.deepEqual(requests, []);
        await context.close();
      }
      const page = await browser.newPage({ javaScriptEnabled: false });
      await page.route('**/*', route => route.abort());
      await page.setContent(r.documentHtml);
      assert.equal(await page.locator('h1').count(), 1);
      assert.match(await page.locator('body').innerText(), /Scope and open questions/);
      await page.emulateMedia({ media: 'print' });
      // A4 printable area with the production renderer's 14/16mm margins.
      await page.setViewportSize({ width: Math.floor((210 - 24) * 96 / 25.4), height: 1009 });
      await preparePrintLayout(page);
      const pricing = page.locator('.proposal-pricing');
      assert.equal(await pricing.count(), 1);
      assert.equal(await pricing.evaluate(el => getComputedStyle(el).breakInside), 'avoid-page');
      assert.equal(await pricing.evaluate(el => getComputedStyle(el).breakBefore), 'auto');
      const bounds = await pricing.boundingBox();
      assert.ok(bounds && bounds.height < (297 - 30) * 96 / 25.4, 'Entire pricing block fits on a fresh printed page without shrinking');
      assert.ok(await pricing.locator('table').count() > 0);
      for (const row of await pricing.locator('tr').all()) {
        assert.equal(await row.evaluate(el => getComputedStyle(el).breakInside), 'avoid');
      }
      for (const label of ['Monthly investment:', 'One-time fees:', 'First-year estimate:', 'First month:', 'Taxes excluded']) {
        assert.ok((await pricing.innerText()).includes(label), `${label} stays in the pricing group`);
      }
      const footer = await page.locator('.proposal-footer').boundingBox();
      assert.ok(bounds && footer && footer.y + footer.height - bounds.y < (297 - 30) * 96 / 25.4,
        'Investment, implementation, next step and disclaimers fit one printable page');
      assert.equal(await page.locator('.proposal-card-row h3').count(), r.proposal.lineItems.length);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      const cards = page.locator('.proposal-card-row').first().locator('.u-col');
      const left = await cards.nth(0).boundingBox(), right = await cards.nth(1).boundingBox();
      assert.ok(left && right && Math.abs(left.y - right.y) < 2 && right.x >= left.x + left.width,
        'Recommendation cards form two aligned nonoverlapping columns');
      const summaryCells = pricing.locator('.u_content_table').nth(1).locator('tbody td');
      assert.equal(await summaryCells.count(), 3, 'Investment summary has three figures');
      assert.equal(await page.locator('img').evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)), true, 'All embedded artwork loads offline');
      await page.emulateMedia({ media: 'screen' });
      await screenshotPage(page, `${id}-document`);
      await page.close();
    }
  } finally { await browser.close(); }
});
