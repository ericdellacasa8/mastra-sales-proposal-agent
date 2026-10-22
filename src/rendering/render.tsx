import { renderToHtml, renderToJson, renderToPlainText } from '@unlayer/react-elements';
import { validateProposal } from '../proposal/finalize.js';
import { proposalTree } from './proposal.js';
import type { CommercialInput } from '../proposal/commercial.js';

export const EMAIL_SIZE_LIMIT = 100_000;
export function assertEmailSize(html: string) {
  if (Buffer.byteLength(html, 'utf8') >= EMAIL_SIZE_LIMIT) throw new Error('Email HTML must be smaller than 100,000 UTF-8 bytes');
}
function setLanguage(html: string) {
  // Keep Elements' entire email shell (including Outlook conditional comments).
  if (!/<meta[^>]*name=["']viewport["']/i.test(html)) html = html.replace('</head>', '<meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>');
  return html.replace(/<html\b([^>]*)>/i, (_, attributes: string) => `<html${attributes.replace(/\s(?:xml:)?lang=["'][^"']*["']/gi, '')} lang="en">`);
}
export function renderProposal(value: unknown, commercial: CommercialInput) {
  const proposal = validateProposal(value, commercial);
  const palette = proposal.seller.colors;
  const emailTree = proposalTree(proposal, 'email');
  const emailHtml = setLanguage(renderToHtml(emailTree, { title: proposal.subject }));
  assertEmailSize(emailHtml);
  const documentHtml = setLanguage(renderToHtml(proposalTree(proposal, 'document'), { title: proposal.subject })).replace('</head>', `<style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
    .content { max-width: 680px; margin: 0 auto; }
    .u-row { display: block !important; }
    .u-col { display: block !important; max-width: none !important; min-width: 0; }
    .proposal-brand { border-bottom: 1px solid ${palette.accent}; }
    .proposal-summary .u-row, .proposal-next .u-row { display: grid !important; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
    .proposal-brand .u-row { display: grid !important; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
    .proposal-brand-wide .u-row { grid-template-columns: minmax(0, 1fr); }
    .proposal-brand-wide .u-col:last-child > .v-col-padding { padding-left: 0 !important; }
    .proposal-summary-no-artwork .u-row { grid-template-columns: minmax(0, 1fr); }
    .proposal-summary-no-artwork { border-bottom: 2px solid ${palette.soft}; }
    .proposal-summary img { max-height: 210px; object-fit: contain; }
    .proposal-card-row .u-row, .proposal-details .u-row { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .proposal-card-row .u-row:has(> .u-col:only-child) { grid-template-columns: minmax(0, 1fr); }
    .proposal-details-single .u-row { grid-template-columns: minmax(0, 1fr); }
    .proposal-card-row .u-col, .proposal-details .u-col { height: 100%; }
    .proposal-priority { border-left: 3px solid ${palette.accent}; border-radius: 6px; padding: 4px 18px; margin: 8px 0 12px; }
    .proposal-details .u-col { border: 1px solid ${palette.border}; border-radius: 6px; }
    .proposal-pricing table { width: 100%; border-collapse: collapse; table-layout: auto !important; }
    /* Elements defaults every col to 50%, even in tables with 3 or 4 columns. */
    .proposal-pricing col { width: auto !important; }
    /* Elements inserts empty 6px repeating headers/footers even when disabled.
       Remove only these decorative spacers, never real table headings. */
    .proposal-pricing thead[aria-hidden="true"],
    .proposal-pricing tfoot[aria-hidden="true"] { display: none; }
    .proposal-pricing td, .proposal-pricing th { vertical-align: top !important; }
    .proposal-pricing table:has(.investment-metric),
    .proposal-pricing table:has(.investment-metric) tbody { display: block; }
    .proposal-pricing table:has(.investment-metric) tr { display: flex; flex-wrap: wrap; }
    .proposal-pricing table:has(.investment-metric) td { display: block; flex: 1 1 180px; white-space: normal !important; }
    .proposal-wide-pricing table:not(:has(.investment-metric)) td:last-child { white-space: normal !important; }
    .proposal-wide-pricing table:not(:has(.investment-metric)) { font-variant-numeric: tabular-nums; }
    /* Compact spacing is used only if measured, complete content fits one page.
       Body text sizes and all proposal content remain unchanged. */
    .proposal-compact .proposal-summary h1 { font-size: 36px !important; }
    .proposal-compact .proposal-summary > .u_row { padding: 12px 0 6px !important; }
    .proposal-compact .proposal-brand .v-col-padding { padding-bottom: 8px !important; }
    .proposal-compact .proposal-priority { margin: 4px 0; }
    .proposal-compact .proposal-priority .v-col-padding,
    .proposal-compact .proposal-recommendations .v-col-padding,
    .proposal-compact .proposal-pricing .v-col-padding { padding: 6px 0 !important; }
    .proposal-compact .proposal-card-row .u-row { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .proposal-compact .proposal-card-row > .u_row { padding-bottom: 8px !important; }
    .proposal-compact .proposal-card-row .v-col-padding { padding: 10px !important; }
    .proposal-compact .proposal-card-row .u_content_paragraph:first-child { float: left; padding: 0 10px 0 0 !important; }
    .proposal-compact .proposal-card-row .u_content_paragraph:first-child img { display: none; }
    .proposal-compact .proposal-card-row .u_content_heading { padding-bottom: 6px !important; }
    .proposal-compact .proposal-card-row .u_content_paragraph:last-child { padding-bottom: 0 !important; }
    .proposal-compact .proposal-recommendations .u_content_paragraph { padding-bottom: 0 !important; }
    .proposal-compact .proposal-pricing .u_content_paragraph:last-child { padding-bottom: 0 !important; }
    .proposal-compact .proposal-next .v-col-padding { padding: 12px 14px !important; }
    .proposal-compact .proposal-footer { margin-top: 8px; }
    .proposal-compact .proposal-footer .v-col-padding { padding-top: 8px !important; }
    .proposal-pricing .u_content_table:not(.u_content_table ~ .u_content_table) td, .proposal-pricing .u_content_table:not(.u_content_table ~ .u_content_table) th { border: 1px solid ${palette.border}; }
    .proposal-pricing .u_content_table:not(.u_content_table ~ .u_content_table) td:last-child, .proposal-pricing .u_content_table:not(.u_content_table ~ .u_content_table) th:last-child { text-align: right !important; white-space: nowrap; }
    .proposal-next { border-radius: 7px; margin: 10px 0; }
    .proposal-footer { margin-top: 14px; border-top: 1px solid ${palette.border}; }
    .proposal-footer .u-row { display: grid !important; grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); }
    @media screen and (max-width: 600px) {
      .proposal-brand .u-row, .proposal-summary .u-row, .proposal-next .u-row, .proposal-footer .u-row,
      .proposal-card-row .u-row, .proposal-details .u-row { grid-template-columns: minmax(0, 1fr); }
    }
    @media print {
      h1, h2, h3, .u_content_heading { break-after: avoid; }
      .u_content_paragraph, tr { break-inside: avoid; }
      /* Let Chromium paginate naturally; keep only related pricing together. */
      .proposal-pricing { break-inside: avoid-page; }
      .proposal-pricing-oversize .proposal-pricing,
      .proposal-pricing-oversize .proposal-pricing table { break-inside: auto; }
      .proposal-pricing table { break-inside: avoid-page; }
      .proposal-pricing tr { break-inside: avoid; page-break-inside: avoid; }
      .proposal-pricing thead { display: table-header-group; }
      .proposal-next, .proposal-card-row .u-col { break-inside: avoid-page; }
      .proposal-next { break-after: avoid-page; }
      .proposal-implementation { break-after: avoid-page; }
      .proposal-footer .u_content_paragraph { break-inside: auto; }
      p { orphans: 3; widows: 3; }
    }
  </style></head>`);
  return { proposal, emailHtml, emailText: renderToPlainText(emailTree), documentHtml, design: renderToJson(emailTree) };
}
export type RenderedProposal = ReturnType<typeof renderProposal>;
