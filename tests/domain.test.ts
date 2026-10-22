import { demoCommercial } from '../src/proposal/catalog.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePricing, finalizeProposal, validateProposal } from '../src/proposal/finalize.js';
import { samples, sampleProposal, resolveInput } from '../src/proposal/samples.js';

for (const [id, expected] of [
  ['software', { monthlyCents: 53100, oneTimeCents: 90000, firstMonthCents: 143100, firstYearCents: 727200 }],
  ['healthcare', { monthlyCents: 38400, oneTimeCents: 90000, firstMonthCents: 128400, firstYearCents: 550800 }],
] as const) {
  test(`${id}: exact deterministic catalog pricing and provenance`, () => {
    const p = sampleProposal(id);
    assert.deepEqual(p.totals, expected);
    assert.deepEqual(p, sampleProposal(id));
    assert.equal(p.sourceNotesHash.length, 64);
    assert.deepEqual(validateProposal(p, demoCommercial), p);
    assert.deepEqual(resolveInput({ sampleId: id }), samples[id].discovery);
  });
}
function rejectDraft(change: (draft: any) => void) {
  const draft = structuredClone(samples.software.draft);
  change(draft);
  assert.throws(() => finalizeProposal(samples.software.discovery, draft, demoCommercial));
}
test('reject invalid products, quantities, dependencies, extra prices and duplicate entries', () => {
  for (const quantity of [0, -1, 1.5, 101, Number.MAX_SAFE_INTEGER, Infinity]) rejectDraft(d => { d.recommendations[1].quantity = quantity; });
  rejectDraft(d => { d.recommendations[0].productId = 'invented'; });
  rejectDraft(d => { d.recommendations[0].quantity = 2; });
  rejectDraft(d => { d.recommendations.shift(); });
  rejectDraft(d => { d.recommendations[1] = d.recommendations[0]; });
  rejectDraft(d => { d.recommendations[0].unitPriceCents = 1; });
  rejectDraft(d => { delete d.recommendations[1].quantity; });
  assert.throws(() => calculatePricing([{ ...samples.software.draft.recommendations[1]!, quantity: Number.MAX_SAFE_INTEGER }], demoCommercial.catalog));
});
test('reject ungrounded quotes, unconfirmed seat quantities and narrative money', () => {
  rejectDraft(d => { d.needs[0].evidenceQuote = 'We guarantee a return'; });
  rejectDraft(d => { d.recommendations[1].quantity = 11; });
  rejectDraft(d => { d.summary = 'Your cost is $1.'; });
  rejectDraft(d => { d.nextStep = 'Get 10% off.'; });
});
test('strict custom inputs and sample conflicts', () => {
  const d = samples.software.discovery;
  assert.deepEqual(resolveInput({ customerName: d.customer.name, company: d.customer.company, email: d.customer.email, notes: d.notes }), d);
  for (const input of [{}, { sampleId: 'software', notes: d.notes }, { sampleId: 'unknown' }, { sampleId: 'software', approved: true }]) assert.throws(() => resolveInput(input));
  for (const email of ['invalid', 'buyer@example.com\r\nBcc: other@example.com']) assert.throws(() => finalizeProposal({ ...d, customer: { ...d.customer, email } }, samples.software.draft, demoCommercial));
  assert.throws(() => finalizeProposal({ ...d, notes: 'short' }, samples.software.draft, demoCommercial));
  assert.throws(() => finalizeProposal({ ...d, customer: { ...d.customer, company: 'Hello\nBcc: X' } }, samples.software.draft, demoCommercial));
});
test('stored proposals cannot override catalog prices or totals', () => {
  const p = sampleProposal('software');
  p.lineItems[0]!.unitPriceCents = 1;
  assert.throws(() => validateProposal(p, demoCommercial), /pricing/);
  const altered = sampleProposal('software'); altered.totals.monthlyCents = 1;
  assert.throws(() => validateProposal(altered, demoCommercial), /pricing/);
});
test('healthcare is fictional, excludes reporting, and carries unanswered scope questions', () => {
  const p = sampleProposal('healthcare');
  assert.match(samples.healthcare.discovery.notes, /FICTIONAL DEMO/);
  assert.ok(p.lineItems.every(l => l.productId !== 'reporting'));
  assert.match(p.content.openQuestions.join(' '), /unconfirmed and outside/);
});
