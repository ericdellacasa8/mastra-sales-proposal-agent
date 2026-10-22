import { z } from 'zod';
import { sellerSchema, productIdSchema, contractSchema } from './commercial.js';

const text = (max: number) => z.string().trim().min(1).max(max);
const singleLine = (max: number) => text(max).refine(v => !/[\r\n]/.test(v), 'Use a single line');
export const customerSchema = z.strictObject({
  name: singleLine(100).optional(), company: singleLine(160),
  email: z.string().max(254).refine(v => !/[\r\n]/.test(v), 'Invalid address').pipe(z.email()).optional(),
});
export const discoverySchema = z.strictObject({ customer: customerSchema, notes: text(12_000) });
export const inputSchema = z.strictObject({
  sampleId: z.enum(['custom', 'software', 'healthcare']).default('custom'),
  customerName: singleLine(100).optional(), company: singleLine(160).optional(),
  email: customerSchema.shape.email.optional(), notes: text(12_000).optional(),
}).superRefine((v, ctx) => {
  const fields = ['company', 'notes'] as const;
  for (const key of fields) {
    if (v.sampleId === 'custom' && !v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required for a custom proposal' });
    if (v.sampleId !== 'custom' && v[key] !== undefined) ctx.addIssue({ code: 'custom', path: [key], message: 'Choose a sample or custom fields, not both' });
  }
});
const evidenceQuote = text(500);
export const draftSchema = z.strictObject({
  headline: text(180).optional(), summary: text(600),
  needs: z.array(z.strictObject({ text: text(400), evidenceQuote })).min(1).max(5),
  recommendations: z.array(z.strictObject({
    productId: productIdSchema, quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    rationale: text(400), evidenceQuote,
  })).min(1).max(12),
  timeline: z.array(z.strictObject({ phase: text(100), detail: text(400), evidenceQuote: evidenceQuote.nullable() })).max(4),
  assumptions: z.array(text(400)).max(5), openQuestions: z.array(text(400)).max(5), nextStep: text(300),
}).superRefine((v, ctx) => {
  const ids = v.recommendations.map(r => r.productId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate products are not allowed' });

});
const cents = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const proposalSchema = z.strictObject({
  schemaVersion: z.literal(2), id: z.uuid(), createdAt: z.iso.datetime(),
  commercialHash: z.string().regex(/^[a-f0-9]{64}$/),
  catalogVersion: text(50), templateVersion: text(50), sourceNotesHash: z.string().regex(/^[a-f0-9]{64}$/),
  customer: customerSchema, seller: sellerSchema,
  locale: z.literal('en-US'), currency: z.enum(['USD','EUR']), subject: singleLine(200),
  content: draftSchema,
  lineItems: z.array(z.strictObject({
    priceBasis:z.enum(['verified','hypothetical']).optional(),
    productId: productIdSchema, name: text(100), description: text(400), billing: z.enum(['monthly', 'once']),
    unitLabel: text(40).optional(), icon: z.enum(['workspace', 'team-seat', 'onboarding', 'reporting']).optional(),
    quantity: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), unitPriceCents: cents, lineTotalCents: cents,
  })).min(1).max(12),
  contract:contractSchema.optional(),
  totals: z.strictObject({ monthlyCents: cents, oneTimeCents: cents, firstMonthCents: cents, firstYearCents: cents, annualizedRecurringCents:cents.optional(),committedCents:cents.optional() }),
  terms: z.array(text(400)).max(6),
});
export type Discovery = z.infer<typeof discoverySchema>;
export type DraftProposal = z.infer<typeof draftSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
