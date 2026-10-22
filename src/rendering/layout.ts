import type { Page } from 'playwright';

// Same A4 size/margins as pdf.ts; floor leaves a small rounding allowance.
export const PRINT_WIDTH = Math.floor((210 - 24) * 96 / 25.4);
export const PRINT_HEIGHT = Math.floor((297 - 30) * 96 / 25.4);

/** Measure rendered content, not character counts or seller/industry identities.
 * No content is removed or page-scaled; compact styling is accepted only if it fits.
 * Kept here so PDF generation and browser regression tests use the same pass.
 */
export async function preparePrintLayout(page: Page) {
  await page.setViewportSize({ width: PRINT_WIDTH, height: PRINT_HEIGHT });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(({ height }) => {
    const root = document.body;
    root.classList.remove('proposal-compact', 'proposal-paged', 'proposal-wide-pricing', 'proposal-pricing-oversize');
    const brand = document.querySelector<HTMLElement>('.proposal-brand');
    brand?.classList.remove('proposal-brand-wide');
    const wordmark = document.querySelector<HTMLElement>('.seller-wordmark');
    if (brand && wordmark) {
      const range = document.createRange();
      range.selectNodeContents(wordmark);
      const container = wordmark.parentElement!.getBoundingClientRect();
      if ([...range.getClientRects()].some(r => r.right > container.right + 1)) brand.classList.add('proposal-brand-wide');
    }
    const pricing = document.querySelector<HTMLElement>('.proposal-pricing')!;
    if (pricing.scrollWidth > pricing.clientWidth + 1) root.classList.add('proposal-wide-pricing');
    const footer = document.querySelector<HTMLElement>('.proposal-footer')!;
    // Keep browser callbacks self-contained: tsx wraps locally named functions
    // in a Node-side __name helper that Playwright does not serialize.
    // Keep a full 8px safety margin for PDF rounding/font differences.
    if ((footer.getBoundingClientRect().bottom + window.scrollY) > height - 8) {
      root.classList.add('proposal-compact');
      if ((footer.getBoundingClientRect().bottom + window.scrollY) > height - 8) {
        root.classList.remove('proposal-compact');
      }
    }
    if (pricing.getBoundingClientRect().height > height - 8) root.classList.add('proposal-pricing-oversize');
    return { compact: root.classList.contains('proposal-compact'), contentHeight: (footer.getBoundingClientRect().bottom + window.scrollY) };
  }, { height: PRINT_HEIGHT });
}
