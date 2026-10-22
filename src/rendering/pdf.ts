import { sellerSchema, type Seller } from '../proposal/commercial.js';
import { escapeHtml } from './sections.js';
import { preparePrintLayout } from './layout.js';
import { chromium } from 'playwright';

export const PDF_SIZE_LIMIT = 5_000_000;
export function assertPdf(pdf: Uint8Array) {
  if (pdf.byteLength === 0 || pdf.byteLength >= PDF_SIZE_LIMIT || Buffer.from(pdf).subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Expected a nonempty PDF smaller than 5 MB');
  }
}

export async function renderPdf(html: string, sellerInput: Seller): Promise<Buffer> {
  const seller = sellerSchema.parse(sellerInput);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, timeout: 20_000 });
  } catch (cause) {
    throw new Error('Chromium could not start. Run npm run browser:install, or retry in ordinary Terminal if sandbox IPC is denied. No PDF was generated.', { cause });
  }
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    // Evaluate runs through browser automation even with page JavaScript disabled.
    await preparePrintLayout(page);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('PDF rendering timed out after 20 seconds')), 20_000); });
    let pdf: Buffer;
    try { pdf = await Promise.race([page.pdf({
      format: 'A4', printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '16mm', left: '12mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: `<div style="font:9px Arial;color:${seller.colors.muted};width:100%;text-align:center">${escapeHtml(seller.name)} &nbsp; | &nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
    }), deadline]); } finally { clearTimeout(timer); }
    assertPdf(pdf);
    return pdf;
  } finally { await browser.close(); }
}
