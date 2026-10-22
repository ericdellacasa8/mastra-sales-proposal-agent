import { money } from '../src/rendering/sections.js';
import { dynamicStressInput } from './dynamic-fixtures.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixtureIds, fixtureProposal, loadFixture } from '../src/proposal/fixtures.js';
import { commercialSchema } from '../src/proposal/commercial.js';
import { finalizeProposal, validateProposal } from '../src/proposal/finalize.js';
import { renderProposal } from '../src/rendering/render.js';
import { writePreview, verifyPreview } from '../src/services/artifacts.js';

const expected = {
  saas: { monthlyCents: 26493, oneTimeCents: 45000, firstMonthCents: 71493, firstYearCents: 362916 },
  consulting: { monthlyCents: 0, oneTimeCents: 550000, firstMonthCents: 550000, firstYearCents: 550000 },
  agency: { monthlyCents: 291000, oneTimeCents: 35000, firstMonthCents: 326000, firstYearCents: 3527000 },
};
const texts = (r: ReturnType<typeof renderProposal>) => [r.emailHtml, r.documentHtml, r.emailText, JSON.stringify(r.design)];
for (const id of fixtureIds) test(`${id}: independent pricing oracle, seller isolation and all text exports`, () => {
  const { input, proposal } = fixtureProposal(id);
  const original = structuredClone(input);
  assert.deepEqual(proposal.totals, expected[id]);
  const r = renderProposal(proposal, input.commercial);
  for (const text of texts(r)) {
    assert.ok(text.includes(proposal.seller.name));
    assert.ok(text.includes(proposal.customer.company));
    for (const item of proposal.lineItems) assert.ok(text.includes(item.name));
    for (const legacy of ['Fennquill', 'Operations workspace', 'Guided onboarding', 'buyer-a@example.com']) assert.ok(!text.includes(legacy));
    for (const other of fixtureIds.filter(other => other !== id)) {
      const foreign = loadFixture(other);
      const markers = [foreign.commercial.seller.name, foreign.commercial.seller.email,
        foreign.commercial.seller.website, foreign.commercial.seller.tagline, foreign.commercial.seller.logo?.src,
        foreign.discovery.customer.company, foreign.discovery.customer.email,
        ...foreign.commercial.catalog.products.map(p => p.name)];
      for (const marker of markers) if (marker) assert.ok(!text.includes(marker), `${id}: leaked ${other} data`);
    }
  }
  for (const html of [r.emailHtml, r.documentHtml]) {
    assert.ok(html.includes(proposal.seller.colors.accent));
    assert.ok(html.includes(`mailto:${proposal.seller.email}`));
    if (proposal.seller.website) assert.ok(html.includes(proposal.seller.website));
    if (proposal.seller.phone) assert.ok(html.includes(proposal.seller.phone));
  }
  if (id === 'consulting') {
    assert.ok(!r.emailHtml.includes('<img'));
    for (const text of texts(r)) {
      assert.match(text, /Total project fees:/);
      assert.ok(text.includes('$5,500'));
      assert.doesNotMatch(text, /Monthly investment|First-year estimate|First month|onboarding/i);
    }
    assert.doesNotMatch(r.documentHtml, /Implementation considerations|Scope and open questions/);
  }
  if (id === 'saas') assert.ok(r.documentHtml.includes('$19.99'));
  assert.deepEqual(input, original, 'Rendering does not mutate confirmed inputs');
});

test('interleaved sellers remain isolated without global configuration mutations', async () => {
  const jobs = ['saas', 'agency', 'consulting', 'saas'] as const;
  const rendered = await Promise.all(jobs.map(async id => {
    const { input, proposal } = fixtureProposal(id);
    return renderProposal(proposal, input.commercial);
  }));
  assert.deepEqual(rendered[0], rendered[3]);
});

test('confirmed changes regenerate every artifact and stale commercial snapshots fail validation', async () => {
  const input = loadFixture('saas');
  const options = { id: '00000000-0000-4000-8000-000000000009', createdAt: '2026-10-16T00:00:00.000Z' };
  const before = finalizeProposal(input.discovery, input.draft, input.commercial, options);
  const old = renderProposal(before, input.commercial);
  input.commercial.seller.name = 'Revised Sample Seller';
  input.commercial.seller.email = 'revised@example.org';
  input.commercial.seller.tagline = 'REVISED BRAND';
  input.commercial.seller.colors.accent = '#253B72';
  delete input.commercial.seller.logo;
  input.discovery.customer.company = 'Revised Customer Co.';
  input.discovery.customer.name = 'Revised Buyer';
  input.discovery.customer.email = 'revised-buyer@example.org';
  input.draft.headline = 'A revised customer proposal';
  input.draft.recommendations[1]!.quantity = 9;
  input.discovery.notes = input.discovery.notes.replace('Include 7 Editor license.', 'Include 9 Editor license.');
  input.draft.recommendations[1]!.evidenceQuote = 'Include 9 Editor license.';
  input.draft.recommendations[1]!.rationale = 'Provide named access to nine editors.';
  input.commercial.catalog.products[1]!.unitPriceCents = 2345;
  input.commercial.catalog.products[1]!.name = 'Revised editor access';
  assert.throws(() => validateProposal(before, input.commercial));
  const next = finalizeProposal(input.discovery, input.draft, input.commercial, options);
  assert.deepEqual(next.totals, { monthlyCents: 33605, oneTimeCents: 45000, firstMonthCents: 78605, firstYearCents: 448260 });
  const updated = renderProposal(next, input.commercial);
  for (const text of texts(updated)) {
    for (const value of ['Revised Sample Seller', 'Revised Customer Co.', 'Revised editor access', '$336.05']) assert.ok(text.includes(value));
    assert.ok(!text.includes(before.seller.name));
  }
  const dir = await mkdtemp(join(tmpdir(), 'proposal-regeneration-'));
  try {
    await writePreview(join(dir, 'bundle'), old);
    const first = await verifyPreview(join(dir, 'bundle'));
    await writePreview(join(dir, 'bundle'), updated);
    const last = await verifyPreview(join(dir, 'bundle'));
    assert.notEqual(first.bundleHash, last.bundleHash);
    assert.equal(last.recipient, 'revised-buyer@example.org');
    for (const file of ['proposal.json','email.html','email.txt','proposal.html','design.json'] as const) {
      assert.notEqual(first.files[file], last.files[file]);
      assert.ok((await readFile(join(dir, 'bundle', file), 'utf8')).includes('Revised Sample Seller'));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('additional catalog products, per-unit deliverables and recurring-only summaries', () => {
  const input = loadFixture('agency');
  for (let i=1; i<=2; i++) {
    const quote = `Include ${i} optional deliverable ${i}.`;
    input.discovery.notes += ` ${quote}`;
    input.commercial.catalog.products.push({ id: `extra-${i}`, name: `Optional deliverable ${i}`, description: 'A confirmed additional deliverable.', billing: 'monthly', unitPriceCents: 12525, maxQuantity: 10, requires: [], unitLabel: 'items' });
    input.draft.recommendations.push({ productId: `extra-${i}`, quantity: i, rationale: 'Prepare the explicitly requested deliverable.', evidenceQuote: quote });
  }
  const p = finalizeProposal(input.discovery, input.draft, input.commercial);
  assert.equal(p.lineItems.length, 6);
  assert.equal(p.totals.monthlyCents, 328575);
  const r = renderProposal(p, input.commercial);
  assert.equal((r.documentHtml.match(/class="proposal-card-row"/g) ?? []).length, 1);
  assert.ok(r.documentHtml.includes('6 assets'));
  for (const text of texts(r)) assert.ok(text.includes('Optional deliverable 2'));
  input.draft.recommendations = input.draft.recommendations.filter(r => r.productId !== 'content-kickoff');
  const recurring = renderProposal(finalizeProposal(input.discovery, input.draft, input.commercial), input.commercial);
  assert.doesNotMatch(recurring.emailHtml, /One-time fees:/);
});

test('authoritative catalog rejects tampering, unknown billing, duplicates, dependencies and unsupported branding', () => {
  const input = loadFixture('agency');
  const p = finalizeProposal(input.discovery, input.draft, input.commercial);
  const tampered = structuredClone(p); tampered.lineItems[0]!.unitPriceCents = 1;
  assert.throws(() => renderProposal(tampered, input.commercial), /pricing/);
  assert.throws(() => renderProposal(p, loadFixture('saas').commercial));
  for (const billing of ['yearly', 'usage', 'hourly']) {
    const c = structuredClone(input.commercial); Object.assign(c.catalog.products[0]!, { billing });
    assert.throws(() => commercialSchema.parse(c));
  }
  const c = structuredClone(input.commercial); c.catalog.products.push(c.catalog.products[0]!);
  assert.throws(() => commercialSchema.parse(c));
  for (const website of ['javascript:alert(1)', 'file:///tmp/test', 'https://user:pass@example.org']) assert.throws(() => commercialSchema.parse({ ...input.commercial, seller: { ...input.commercial.seller, website } }));
  for (const src of ['https://example.org/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=']) assert.throws(() => commercialSchema.parse({ ...input.commercial, seller: { ...input.commercial.seller, logo: { src, alt: 'test' } } }));
  assert.throws(() => commercialSchema.parse({ ...input.commercial, seller: { ...input.commercial.seller, colors: { ...input.commercial.seller.colors, ink: '#FFFFFF' } } }));
  input.commercial.catalog.products[0]!.requires = ['content-kickoff'];
  input.draft.recommendations = input.draft.recommendations.filter(r => r.productId !== 'content-kickoff');
  assert.throws(() => finalizeProposal(input.discovery, input.draft, input.commercial), /Required product/);
});

test('missing optional branding uses isolated accessible defaults and no borrowed logo', () => {
  const input = loadFixture('consulting');
  const { colors, ...minimalSeller } = input.commercial.seller;
  const commercial = commercialSchema.parse({ ...input.commercial, seller: minimalSeller });
  const second = commercialSchema.parse({ ...input.commercial, seller: minimalSeller });
  commercial.seller.colors.accent = '#253B72';
  assert.notEqual(second.seller.colors.accent, commercial.seller.colors.accent);
  const r = renderProposal(finalizeProposal(input.discovery, input.draft, commercial), commercial);
  assert.doesNotMatch(r.emailHtml, /<img/);
  assert.match(r.documentHtml, /class="proposal-brand"/);
  assert.doesNotMatch(r.documentHtml, /letter-spacing: 1px/);
  assert.doesNotMatch(r.emailHtml, /undefined|null|Fennquill|Lumenboard|Mossline/);
});

test('long customer/content fixture supports seven recommendations without truncation or email overflow', () => {
  const input = dynamicStressInput();
  const p = finalizeProposal(input.discovery, input.draft, input.commercial);
  const r = renderProposal(p, input.commercial);
  assert.equal(p.lineItems.length, 7);
  assert.equal(p.totals.oneTimeCents, 125000);
  assert.ok(r.documentHtml.includes(input.discovery.customer.company));
  for (const n of input.draft.needs) assert.ok(r.documentHtml.includes(n.text.trim()));
  for (const a of input.draft.assumptions) assert.ok(r.documentHtml.includes(a.trim()));
  assert.ok(Buffer.byteLength(r.emailHtml) < 100_000);
  assert.doesNotMatch(r.documentHtml, /max-height:.*overflow:\s*hidden/);
});

test('money display preserves every cent without floating-point division rounding', () => {
  assert.equal(money(1999), '$19.99');
  assert.equal(money(1), '$0.01');
  assert.equal(money(100), '$1');
  assert.equal(money(Number.MAX_SAFE_INTEGER), '$90,071,992,547,409.91');
  assert.throws(() => money(Number.MAX_SAFE_INTEGER + 1));
});

test('optional seller artwork is validated, escaped and never borrowed', () => {
  const input = loadFixture('saas');
  input.commercial.seller.artwork = { ...input.commercial.seller.logo!, alt: 'Seller-provided artwork & context' };
  delete input.commercial.seller.logo;
  const p = finalizeProposal(input.discovery, input.draft, input.commercial);
  const r = renderProposal(p, input.commercial);
  assert.ok(r.documentHtml.includes(input.commercial.seller.artwork.src));
  assert.match(r.documentHtml, /alt="Seller-provided artwork &amp; context"/);
  assert.ok(!r.documentHtml.includes('class="proposal-summary proposal-summary-no-artwork"'));
  input.commercial.seller.artwork.alt = '" onload="alert(1)';
  const escaped = renderProposal(finalizeProposal(input.discovery, input.draft, input.commercial), input.commercial);
  assert.doesNotMatch(escaped.documentHtml, /alt="" onload=/);
  assert.match(escaped.documentHtml, /&quot; onload=&quot;/);
  delete input.commercial.seller.artwork;
  const fallback = renderProposal(finalizeProposal(input.discovery, input.draft, input.commercial), input.commercial);
  assert.match(fallback.documentHtml, /class="proposal-summary proposal-summary-no-artwork"/);
  assert.ok(!fallback.documentHtml.includes(p.seller.artwork!.src));
  assert.throws(() => validateProposal(p, input.commercial), /configuration does not match catalog/);
  for (const src of ['https://example.com/hero.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)']) {
    assert.equal(commercialSchema.safeParse({ ...input.commercial, seller: { ...input.commercial.seller, artwork: { src, alt: 'Unsafe image' } } }).success, false);
  }
});

test('investment metrics have independent block line boxes and exact short/long amounts', () => {
  for (const cents of [1, 999, 1234567890123]) {
    const input = loadFixture('saas');
    input.commercial.catalog.products.forEach((product, index) => { product.unitPriceCents = index === 0 ? cents : 0; });
    const p = finalizeProposal(input.discovery, input.draft, input.commercial);
    const r = renderProposal(p, input.commercial);
    assert.equal((r.documentHtml.match(/class="investment-metric"/g) ?? []).length, 3);
    assert.match(r.documentHtml, /class="investment-value" style="display:block;[^\"]*line-height:1.2;white-space:nowrap/);
    for (const text of texts(r)) assert.ok(text.includes(money(p.totals.monthlyCents)));
    assert.ok(r.documentHtml.includes(money(cents)));
  }
});

test('long seller wordmark has no fixed cap or mid-word wrapping in shared exports', () => {
  const input = loadFixture('saas');
  input.commercial.seller.name = 'Lumenboard International Collaboration Technologies';
  const r = renderProposal(finalizeProposal(input.discovery, input.draft, input.commercial), input.commercial);
  for (const output of [r.emailHtml, r.documentHtml, JSON.stringify(r.design)]) {
    assert.ok(output.includes(input.commercial.seller.name));
    assert.match(output, /overflow-wrap:normal;word-break:normal;hyphens:none/);
    assert.doesNotMatch(output, /max-width:150px/);
  }
});
