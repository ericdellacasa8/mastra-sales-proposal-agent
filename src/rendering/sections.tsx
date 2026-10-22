import {recommendationDescription,hasDistinctPriority} from './presentation.js';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Row, Column, ColumnLayouts, Heading, Paragraph, Table, Image } from '@unlayer/react-elements';
import { defaultColors, type Seller } from '../proposal/commercial.js';
import type { Proposal } from '../proposal/schema.js';

export const palette = defaultColors; // Default token export for tests and fixture authors only.
export const font = { label: 'Arial', value: 'Arial, Helvetica, sans-serif' };
const displayFont = { label: 'Georgia', value: 'Georgia, Times New Roman, serif' };
export const sharedCopy = { nextStep: 'Your next step' };
export function money(cents: number,currency:'USD'|'EUR'='USD') {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Expected safe nonnegative integer cents');
  const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(cents / 100));
  const remainder = cents % 100;
  return `${currency==='EUR'?'€':'$'}${whole}${remainder ? `.${String(remainder).padStart(2, '0')}` : ''}`;
}
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const iconPaths = {
  workspace: '<path d="m3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
  'team-seat': '<circle cx="9" cy="7" r="3"/><path d="M3 21v-5a6 6 0 0 1 12 0v5M16 4a3 3 0 0 1 0 6m2 3c3 0 3 4 3 8"/>',
  onboarding: '<path d="m12 2 3 3 4 1 1 4 2 2-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-2 1-4 4-1Z"/><circle cx="12" cy="12" r="4"/>',
  reporting: '<path d="M4 21v-7h3v7Zm7 0V9h3v12Zm7 0V3h3v18Z"/>',
};
/** Per-proposal closure: never mutate global branding between render calls. */
export function createSections(seller: Seller) {
const palette = seller.colors;
function icon(productId: keyof typeof iconPaths) {
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${palette.accent}" stroke-width="1.7" stroke-linejoin="round">${iconPaths[productId]}</svg>`).toString('base64')}`;
}
function paragraph(text: string, color = palette.ink, size = 15) {
  return <Paragraph html={escapeHtml(text)} color={color} fontSize={`${size}px`} fontFamily={font} lineHeight="145%" containerPadding="0px 0px 8px" />;
}
function heading(text: string, level: 'h1' | 'h2' | 'h3' = 'h2', color = palette.ink, size?: string) {
  return <Heading text={escapeHtml(text)} headingType={level} fontFamily={displayFont} fontSize={size ?? (level === 'h1' ? '42px' : level === 'h2' ? '25px' : '18px')} fontWeight={700} lineHeight="110%" color={color} containerPadding="0px 0px 10px" />;
}
function items(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap(child => isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? items(child.props.children) : [child]);
}
function section(key: string, children: ReactNode, backgroundColor = palette.white) {
  return <Row key={key} className={`proposal-${key}`} layout={ColumnLayouts.OneColumn} backgroundColor={backgroundColor} padding="0px"><Column padding="12px 0px">{items(children)}</Column></Row>;
}
function wordmark(p: Proposal) {
  return <Paragraph html={`${seller.logo ? `<img src="${escapeHtml(seller.logo!.src)}" alt="${escapeHtml(seller.logo!.alt)}" width="32" height="48" style="object-fit:contain;float:left;margin-right:10px" />` : ''}<strong class="seller-wordmark" style="overflow-wrap:normal;word-break:normal;hyphens:none">${escapeHtml(p.seller.name)}</strong>`} fontFamily={displayFont} fontSize="25px" lineHeight="110%" color={palette.ink} containerPadding="0px" />;
}
function BrandHeader(p: Proposal) {
  const columns = [<Column key="brand" padding="0px 16px 16px 0px">{wordmark(p)}{seller.tagline && <Paragraph html={escapeHtml(seller.tagline)} color={palette.accent} fontSize="9px" fontFamily={font} letterSpacing="1px" containerPadding="10px 0px 0px" />}</Column>];
  columns.push(<Column key="customer" padding="0px 0px 20px 16px">{paragraph(`Proposal for ${p.customer.company}`, palette.muted, 12)}{p.customer.name && paragraph(`Prepared for ${p.customer.name}`, palette.muted, 12)}{paragraph(new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(p.createdAt)), palette.muted, 11)}</Column>);
  return <Row key="brand" className="proposal-brand" cells={[7, 5]} padding="0px">{columns}</Row>;
}
function CustomerSummary(p: Proposal, detail: 'summary' | 'full') {
  const content = [heading(p.content.headline ?? `A proposal for ${p.customer.company}`, 'h1'), paragraph(p.content.summary, palette.ink, 16)];
  return detail === 'full'
    ? <Row key="summary" className={`proposal-summary${seller.artwork ? '' : ' proposal-summary-no-artwork'}`} layout={seller.artwork ? ColumnLayouts.TwoWideNarrow : ColumnLayouts.OneColumn} padding="22px 0px 12px"><Column padding="0px 14px 0px 0px">{content}</Column>{(seller.artwork ? [<Column key="artwork" padding="0px"><Image src={seller.artwork.src} alt={escapeHtml(seller.artwork.alt)} width="100%" containerPadding="0px" /></Column>] : [])}</Row>
    : section('summary', <>{heading(p.content.headline ?? `A proposal for ${p.customer.company}`, 'h1')}{paragraph(p.content.summary)}</>);
}
function RecommendationSection(p: Proposal, detail: 'summary' | 'full') {
  const cards = p.lineItems.map((l, i) => <Column key={l.productId} padding="16px" border={{ borderTopWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderTopColor: palette.border, borderBottomColor: palette.border, borderLeftColor: palette.border, borderRightColor: palette.border }} borderRadius="6px">
    <Paragraph html={`<span style="display:inline-block;padding:7px;border-radius:50%;background:${palette.soft}">${String(i + 1).padStart(2, '0')}</span>${detail === 'full' ? ` &nbsp; <img src="${icon(l.icon ?? 'workspace')}" alt="" width="24" height="24" style="vertical-align:middle" />` : ''}`} fontFamily={font} color={palette.accent} fontSize="14px" fontWeight={700} containerPadding="0px 0px 10px" />
    {heading(`${l.name}${l.quantity > 1 ? ` × ${l.quantity}${l.unitLabel ? ` ${l.unitLabel}` : ''}` : ''}`, 'h3')}
    {(() => {const description=recommendationDescription(l.name,p.content.recommendations.find(r=>r.productId===l.productId)!.rationale,l.description);return description?paragraph(description,palette.ink,14):null;})()}
  </Column>);
  const rows = detail === 'full'
    ? [<Row key="solutions" className="proposal-card-row" cells={cards.map(() => 1)} padding="0px 0px 12px">{cards}</Row>]
    : cards.map((card, i) => <Row key={`solutions-${i}`} className="proposal-card-row" layout={ColumnLayouts.OneColumn} padding="0px 0px 12px">{card}</Row>);
  return [
    ...(detail === 'full' && hasDistinctPriority(p) ? [section('priority', <>{heading('Your priority', 'h2', palette.accent, '18px')}{p.content.needs.map((n, i) => <Paragraph key={i} html={escapeHtml(n.text)} color={palette.ink} fontFamily={font} fontSize="15px" lineHeight="145%" containerPadding="0px" />)}</>, palette.soft)] : []),
    section('recommendations', <>{heading('Recommended for your team')}</>), ...rows,
  ];
}
function PricingSection(p: Proposal, detail: 'summary' | 'full') {
  const recurring = p.lineItems.some(l => l.billing === 'monthly');
  const hasOneTime = p.lineItems.some(l => l.billing === 'once');
  const labels = recurring ? [p.contract?'Monthly recurring amount:':'Monthly investment:', ...(hasOneTime ? ['One-time fees:'] : []), p.contract?'Annualized recurring run-rate:':'First-year estimate:'] : ['Total project fees:'];
  const values = recurring ? [p.totals.monthlyCents, ...(hasOneTime ? [p.totals.oneTimeCents] : []), (p.contract?p.totals.annualizedRecurringCents!:p.totals.firstYearCents)] : [p.totals.oneTimeCents];
  const captions = recurring ? ['per month', ...(hasOneTime ? ['once'] : []), p.contract?'monthly × 12; not a commitment':hasOneTime ? '12 months + one-time fees' : '12 monthly charges'] : ['one-time services'];
  return section('pricing', <>
    {heading('Investment & next steps')}
    {p.lineItems.some(l=>l.priceBasis==='hypothetical')&&paragraph('Hypothetical estimate — approved salesperson assumptions, not an official published or contractual quote.',palette.accent,13)}
    {detail === 'full' && <Table headers={['Item', 'Qty', 'Unit', 'Amount']} data={p.lineItems.map(l => [`<img src="${icon(l.icon ?? 'workspace')}" alt="" width="18" height="18" style="vertical-align:middle;margin-right:8px" />${escapeHtml(l.name)}${l.priceBasis==='hypothetical'?' (hypothetical)':''}`, `${l.quantity}${l.unitLabel ? ` ${escapeHtml(l.unitLabel)}` : ''}`, `${money(l.unitPriceCents,p.currency)}${l.billing === 'monthly' ? '/mo' : ' once'}`, `<strong>${money(l.lineTotalCents,p.currency)}${l.billing === 'monthly' ? '/mo' : ' once'}</strong>`])} contentFontFamily={font} headerFontFamily={font} contentFontSize="13px" headerFontSize="12px" contentColor={palette.ink} headerColor={palette.ink} headerBackgroundColor={palette.soft} contentPadding="10px" headerPadding="10px" containerPadding="8px 0px 18px" />}
    {detail === 'full' ? <Table enableHeader={false} data={[values.map((v, i) => `<span class="investment-metric" style="display:block;line-height:1.4"><span class="investment-label" style="display:block;font-size:13px;font-weight:bold;line-height:1.4;margin-bottom:8px">${labels[i]}</span><strong class="investment-value" style="display:block;font-family:Georgia,serif;font-size:${i === 0 ? 34 : 28}px;line-height:1.2;white-space:nowrap;color:${i === 0 ? palette.accent : palette.ink}">${money(v,p.currency)}</strong><span class="investment-caption" style="display:block;margin-top:6px;line-height:1.4">${captions[i]}</span></span>`)]} contentFontFamily={font} contentFontSize="12px" contentColor={palette.ink} contentBackgroundColor={palette.soft} contentPadding="14px 12px" containerPadding="0px" /> : <>{labels.map((label, i) => paragraph(`${label} ${money(values[i]!,p.currency)}`, i === 0 ? palette.accent : palette.ink, i === 0 ? 22 : 15))}</>}
    {recurring&&p.contract&&paragraph(p.contract.kind==='fixed'?`Contract term: ${p.contract.months} months. Committed contract total: ${money(p.totals.committedCents!,p.currency)} (recurring charges over the stated term plus one-time fees).`:'No fixed commitment. No committed contract total is stated.',palette.ink,14)}
    {recurring && <Paragraph html={`<strong>First month: ${money(p.totals.firstMonthCents,p.currency)}</strong> (monthly investment + one-time fees)`} fontFamily={font} color={palette.ink} fontSize="14px" containerPadding="14px 12px 6px" />}
    {paragraph(recurring ? (p.contract?`${p.currency} · Taxes excluded · No discounts. Annualized recurring run-rate excludes one-time fees and is not a contract commitment.`:`${p.currency} · Taxes excluded · No discounts. First-year estimate includes 12 monthly charges plus any one-time fees.`) : `${p.currency} · Taxes excluded · No discounts. One-time project fees; payment schedule is subject to confirmation.`, palette.muted, 11)}
  </>);
}
function DetailsSection(p: Proposal) {
  const columns = [];
  if (p.content.timeline.length) columns.push(<Column key="timeline" padding="16px">{p.content.timeline.flatMap(t => [heading(`${t.phase}${t.evidenceQuote === null ? ' (proposed)' : ''}`, 'h3'), paragraph(t.detail, palette.muted, 13)])}</Column>);
  if (p.content.assumptions.length || p.content.openQuestions.length) columns.push(<Column key="scope" padding="16px">{heading('Scope and open questions', 'h3')}{p.content.assumptions.map(t => paragraph(t, palette.muted, 13))}{p.content.openQuestions.map(t => paragraph(`To confirm: ${t}`, palette.ink, 13))}</Column>);
  if (!columns.length) return [];
  return [section('implementation', heading('Implementation considerations')),
    <Row key="details" className={`proposal-details${columns.length === 1 ? ' proposal-details-single' : ''}`} layout={columns.length === 1 ? ColumnLayouts.OneColumn : ColumnLayouts.TwoEqual} padding="0px 0px 16px">{columns}</Row>,
  ];
}
function NextStepsSection(p: Proposal) {
  return <Row key="next" className="proposal-next" layout={ColumnLayouts.TwoWideNarrow} backgroundColor={palette.dark} padding="0px">
    <Column padding="14px 18px"><Paragraph html={escapeHtml(sharedCopy.nextStep)} fontFamily={font} fontSize="12px" fontWeight={700} color={palette.white} containerPadding="0px 0px 6px" />{paragraph(p.content.nextStep, palette.white, 13)}</Column>
    <Column padding="24px 14px"><Paragraph html={p.seller.email ? `<a href="mailto:${escapeHtml(p.seller.email)}" aria-label="Discuss the proposal with ${escapeHtml(p.seller.name)}" style="display:inline-block;background:${palette.white};color:${palette.dark};padding:12px 14px;border-radius:24px;text-decoration:none;font-weight:bold">Discuss the proposal &rarr;</a>` : `<span style="display:inline-block;background:${palette.white};color:${palette.dark};padding:12px 14px;border-radius:24px;font-weight:bold">Discuss the proposal &rarr;</span>`} fontFamily={font} color={palette.white} fontSize="12px" containerPadding="0px" /></Column>
  </Row>;
}
function Footer(p: Proposal, detail: 'summary' | 'full') {
  const disclaimer = `${detail === 'full' ? p.terms.join(' ') + ' ' : p.terms.filter(term=>term.startsWith('Optional offering — ')).join(' ') + ' '}${p.seller.description ?? ''}`;
  return <Row key="footer" className="proposal-footer" cells={[3, 9]} padding="0px">
    <Column padding="14px 12px 0px 0px">{paragraph(p.seller.name, palette.ink, 12)}
      {seller.website && <Paragraph html={`<a href="${escapeHtml(seller.website)}" style="color:${palette.accent}">${escapeHtml(seller.website)}</a>`} fontFamily={font} fontSize="11px" containerPadding="0px 0px 6px" />}
      {seller.phone && paragraph(seller.phone, palette.muted, 11)}</Column>
    <Column padding="14px 0px 0px"><Paragraph html={escapeHtml(disclaimer)} fontFamily={font} fontSize="11px" lineHeight="130%" color={palette.muted} containerPadding="0px" /></Column>
  </Row>;
}

return { BrandHeader, CustomerSummary, RecommendationSection, PricingSection, DetailsSection, NextStepsSection, Footer };
}
