import { createHash, randomUUID } from 'node:crypto';
import { commercialSchema, catalogSchema, type CommercialInput, type Commercial } from './commercial.js';
import { discoverySchema, draftSchema, proposalSchema, type DraftProposal, type Proposal } from './schema.js';

export function calculatePricing(recommendations: DraftProposal['recommendations'], input: CommercialInput['catalog']) {
  const catalog = catalogSchema.parse(input);
  if (!recommendations.length || recommendations.length > 12) throw new Error('Choose 1–12 recommendations');
  const lineItems = recommendations.map(({ productId, quantity }) => {
    const product = catalog.products.find(p => p.id === productId);
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > product.maxQuantity) throw new Error('Invalid product or quantity');
    return { ...(product.priceBasis?{priceBasis:product.priceBasis}:{}),productId, name: product.name, description: product.description, billing: product.billing, ...(product.unitLabel ? { unitLabel: product.unitLabel } : {}), ...(product.icon ? { icon: product.icon } : {}), quantity, unitPriceCents: product.unitPriceCents, lineTotalCents: product.unitPriceCents * quantity };
  });
  if (new Set(lineItems.map(l => l.productId)).size !== lineItems.length) throw new Error('Duplicate products');
  for (const item of lineItems) for (const dependency of catalog.products.find(p => p.id === item.productId)!.requires) {
    if (!lineItems.some(l => l.productId === dependency)) throw new Error(`Required product missing: ${dependency}`);
  }
  const sum = (billing: 'monthly' | 'once') => lineItems.filter(l => l.billing === billing).reduce((sum, l) => sum + l.lineTotalCents, 0);
  const monthlyCents = sum('monthly'), oneTimeCents = sum('once');
  const totals = { monthlyCents, oneTimeCents, firstMonthCents: monthlyCents + oneTimeCents, firstYearCents: monthlyCents * 12 + oneTimeCents };
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new Error('Pricing overflow');
  return { lineItems, totals };
}

/** Annualized recurring run-rate excludes one-time fees; commitment needs an explicit term. */
export function calculateCommercialPricing(recommendations:DraftProposal['recommendations'],commercial:Commercial){
 const result=calculatePricing(recommendations,commercial.catalog);
 if(!commercial.contract)return result;
 const annualizedRecurringCents=result.totals.monthlyCents*12;
 const committedCents=commercial.contract.kind==='fixed'?result.totals.monthlyCents*commercial.contract.months+result.totals.oneTimeCents:undefined;
 if(!Number.isSafeInteger(annualizedRecurringCents)||(committedCents!==undefined&&!Number.isSafeInteger(committedCents)))throw new Error('Pricing overflow');
 return {...result,totals:{...result.totals,annualizedRecurringCents,...(committedCents!==undefined?{committedCents}:{})}};
}

// Quote matching is provenance checking, not a claim of semantic verification.
function checkEvidence(draft: DraftProposal, notes: string, commercial: Commercial) {
  for (const quote of [...draft.needs, ...draft.recommendations, ...draft.timeline].map(v => v.evidenceQuote)) {
    if (quote !== null && !notes.includes(quote)) throw new Error('Evidence quote is absent from discovery notes');
  }
  const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  for (const r of draft.recommendations) {
    if (commercial.catalog.products.find(p => p.id === r.productId)?.maxQuantity === 1) continue;
    const tokens: string[] = r.evidenceQuote.toLowerCase().match(/\b\w+\b/g) ?? [];
    if (!tokens.includes(String(r.quantity)) && !tokens.includes(numberWords[r.quantity] ?? '')) throw new Error('Confirm product quantity in discovery notes');
  }
  const narrative = [draft.headline ?? '', draft.summary, draft.nextStep, ...draft.needs.map(n => n.text), ...draft.recommendations.map(r => r.rationale), ...draft.timeline.flatMap(t => [t.phase, t.detail]), ...draft.assumptions, ...draft.openQuestions];
  const paths=['headline','summary','nextStep',...draft.needs.map((_,i)=>`needs[${i}].text`),...draft.recommendations.map((_,i)=>`recommendations[${i}].rationale`),...draft.timeline.flatMap((_,i)=>[`timeline[${i}].phase`,`timeline[${i}].detail`]),...draft.assumptions.map((_,i)=>`assumptions[${i}]`),...draft.openQuestions.map((_,i)=>`openQuestions[${i}]`)];
  const monetary=narrative.findIndex(text=>/[$€£]|\b(?:USD|EUR|GBP|dollars?|euros?)\b|\d\s*%/i.test(text));
  if (monetary!==-1) throw new Error(`draft.${paths[monetary]}: Monetary claims belong in deterministic pricing, not narrative. Remove the monetary wording from this field; preserve catalog prices and scope.`);
}

export function finalizeProposal(discovery: unknown, content: unknown, commercialInput: CommercialInput, options: { id?: string; createdAt?: string } = {}): Proposal {
  const input = discoverySchema.parse(discovery);
  const draft = draftSchema.parse(content);
  const commercial = commercialSchema.parse(commercialInput);
  checkEvidence(draft, input.notes, commercial);
  return proposalSchema.parse({
    schemaVersion: 2, id: options.id ?? randomUUID(), createdAt: options.createdAt ?? new Date().toISOString(),
    commercialHash: commercialHash(commercial), catalogVersion: commercial.catalog.version, templateVersion: '3', sourceNotesHash: createHash('sha256').update(input.notes).digest('hex'),
    customer: input.customer, seller: commercial.seller, locale: 'en-US', currency: commercial.catalog.currency, subject: `Proposal for ${input.customer.company}`,
    content: draft, ...(commercial.contract?{contract:commercial.contract}:{}), ...calculateCommercialPricing(draft.recommendations, commercial), terms: [...commercial.terms,...(commercial.catalog.products.some(p=>p.priceBasis==='hypothetical'&&draft.recommendations.some(r=>r.productId===p.id))?['Hypothetical estimate using explicitly approved salesperson assumptions; not an official published price or contractual quote.']:[])],
  });
}

// Validate stored data before rendering; callers cannot override catalog prices.
function commercialHash(commercial: Commercial) {
  return createHash('sha256').update(JSON.stringify(commercial)).digest('hex');
}
export function validateProposal(value: unknown, commercialInput: CommercialInput): Proposal {
  const commercial = commercialSchema.parse(commercialInput);
  const p = proposalSchema.parse(value);
  const expected = calculateCommercialPricing(p.content.recommendations, commercial);
  if(JSON.stringify(p.contract)!==JSON.stringify(commercial.contract))throw new Error('Contract terms do not match');
  if(p.currency!==commercial.catalog.currency)throw new Error('Proposal currency does not match catalog');
  if (JSON.stringify(p.lineItems) !== JSON.stringify(expected.lineItems) || JSON.stringify(p.totals) !== JSON.stringify(expected.totals)) throw new Error('Proposal pricing does not match catalog');
  if (p.commercialHash !== commercialHash(commercial) || p.catalogVersion !== commercial.catalog.version || JSON.stringify(p.seller) !== JSON.stringify(commercial.seller) || JSON.stringify(p.terms) !== JSON.stringify([...commercial.terms,...(p.lineItems.some(l=>l.priceBasis==='hypothetical')?['Hypothetical estimate using explicitly approved salesperson assumptions; not an official published price or contractual quote.']:[])])) throw new Error('Proposal configuration does not match catalog');
  return p;
}
