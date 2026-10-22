import { loadFixture } from '../src/proposal/fixtures.js';

export function dynamicStressInput() {
  const input = loadFixture('agency');
  input.commercial.seller.name = 'Revised Creative Seller';
  input.commercial.seller.colors.accent = '#254080';
  delete input.commercial.seller.logo;
  input.discovery.customer.company = 'Fictional Regional Retail and Editorial Coordination Department';
  input.draft.headline = 'A detailed editorial scope for your regional team';
  input.draft.needs = Array.from({length: 5}, (_,i) => ({ text: `${i+1}. ${'Synthetic long-content pagination check for editorial review. '.repeat(5)}`, evidenceQuote: input.draft.needs[0]!.evidenceQuote }));
  input.draft.assumptions = Array.from({length: 5}, () => 'Synthetic scope detail for the pagination stress fixture. '.repeat(6));
  for (let i=1;i<=3;i++) {
    const quote = `Include ${i} extra review ${i}.`;
    input.discovery.notes += ` ${quote}`;
    input.commercial.catalog.products.push({id:`extra-review-${i}`,name:`Extra review ${i}`,description:'An explicitly scoped review.',billing:'once',unitPriceCents:15000,maxQuantity:10,requires:[]});
    input.draft.recommendations.push({productId:`extra-review-${i}`,quantity:i,rationale:'Review the requested additional material.',evidenceQuote:quote});
  }
  return input;
}
