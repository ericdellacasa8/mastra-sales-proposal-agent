/** Prices remain authoritative user input. Compare integer cents, not decimal spellings. */
export class PriceEvidenceError extends Error {
  readonly code = 'PRICE_EVIDENCE';
  productId?: string;
  readonly guidance = 'Correct the product price arguments using a verbatim excerpt containing the supplied amount and its currency (for example "$25 per user per month"). Use a decimal dollars string for value. Retry the failed batch at the same revision; it was not saved. Do not ask for contacts, branding or already-supplied prices. Ask a pricing-only clarification if the original message genuinely lacks an unambiguous supported price.';
}
export function priceValueCents(value:string) {
  if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(value))throw new PriceEvidenceError('Price value must be a nonnegative decimal dollars string with at most two decimals, without commas.');
  const [whole,fraction='']=value.split('.');
  const result=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(result))throw new PriceEvidenceError('Price exceeds supported precision.');
  return result;
}
export function unitPrice(value:string,quote:string,message:string,allowBare=false,denomination:'USD'|'EUR'='USD',hypothetical=false) {
  if(!quote || !message.includes(quote))throw new PriceEvidenceError('Price quote must be copied verbatim from the current salesperson message.');
  if(!hypothetical&&/\b(?:from|starting|starts at|up to|discount|custom|contact sales)\b/i.test(quote))throw new PriceEvidenceError('Starting, conditional or custom pricing is not a fixed price. Obtain explicit hypothetical authorization or complete fixed terms.');
  const expected=priceValueCents(value);
  // Preserve the existing targeted "USD price?" follow-up, never a generic bare-number inference.
  if(allowBare && message.trim()===value)return expected;
  const amount=String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
  const end=String.raw`(?!\w|,\d|\.\d)`;
  const currency=denomination==='EUR'?new RegExp(String.raw`(?<![\w€])(?:EUR\s*€?\s*|€\s*)(?<prefix>${amount})${end}|(?<![\w.,+\-])(?<suffix>${amount})${end}\s*(?:EUR|euros?)\b`,'gi'):new RegExp(String.raw`(?<![\w$])(?:USD\s*\$?\s*|US\s*\$\s*|\$\s*)(?<prefix>${amount})${end}|(?<![\w.,+\-])(?<suffix>${amount})${end}\s*(?:USD|US dollars?|dollars?)\b`,'gi');
  const tokens=[...message.matchAll(currency)];
  const supported=new Set<number>();
  for(let start=message.indexOf(quote);start!==-1;start=message.indexOf(quote,start+1)) {
    const stop=start+quote.length;
    let matched=false;
    for(const token of tokens) {
      const numeric=token.groups!.prefix ?? token.groups!.suffix!;
      const numberStart=token.index!+token[0].indexOf(numeric);
      const numberEnd=numberStart+numeric.length;
      // Currency may be immediately outside a short quote, but the full amount
      // must occur inside it. Never borrow an unrelated price elsewhere in the turn.
      if(numberStart<start || numberEnd>stop)continue;
      const before=message.slice(Math.max(0,token.index!-24),token.index!);
      if(!hypothetical&&/\b(?:from|starting|starts at|up to)\b[^.!?\n;]{0,30}$/i.test(before))throw new PriceEvidenceError('Starting-price context cannot be omitted from the quote. Authorize a hypothetical estimate or provide fixed terms.');
      const after=message.slice(token.index!+token[0].length,token.index!+token[0].length+24);
      const unsupported=denomination==='USD'?'CAD|AUD|NZD|SGD|HKD|EUR|GBP|MXN|JPY|CHF|INR|CNY|KRW|ZAR|BRL|AED|Canadian(?: dollars?)?|Australian(?: dollars?)?|New Zealand(?: dollars?)?':'CAD|AUD|NZD|SGD|HKD|USD|GBP|MXN|JPY|CHF|INR|CNY|KRW|ZAR|BRL|AED|Canadian(?: dollars?)?|Australian(?: dollars?)?|New Zealand(?: dollars?)?';
      if(new RegExp(`\\b(?:${unsupported})\\s*[:=]?\\s*$`,'i').test(before)||new RegExp(`^\\s*(?:${unsupported})\\b`,'i').test(after))throw new PriceEvidenceError('Explicit non-USD or incompatible currency is not supported by this price field; do not convert it.');
      matched=true;
      supported.add(priceValueCents(numeric.replace(/,/g,'')));
    }
    if(!matched)throw new PriceEvidenceError('The unit price quote must include an amount with explicit supported currency at that occurrence. Copy the currency and price together from the current message.');
  }
  if(supported.size!==1 || !supported.has(expected))throw new PriceEvidenceError('The unit price evidence must identify one matching supported-currency amount. Include the currency and amount in the quote; do not infer a price from a quantity or choose between different quoted prices.');
  return expected;
}
