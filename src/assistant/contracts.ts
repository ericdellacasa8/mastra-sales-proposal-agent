import {websiteState} from './website-contracts.js';
import { z } from 'zod';
import { sellerSchema, commercialSchema, contractSchema, catalogSchema, productIdSchema } from '../proposal/commercial.js';
import { customerSchema, draftSchema, proposalSchema } from '../proposal/schema.js';

const quote = z.string().trim().min(1).max(32_000);
const optionalInput=<T extends z.ZodType>(schema:T)=>schema.nullish().transform(value=>value??undefined);
const sourceMessageId = optionalInput(z.string().min(1).max(200)).describe('Deprecated compatibility field. Omit: the server resolves provenance from captured human messages.');
const fact = z.strictObject({ sourceMessageId, value: z.string().trim().min(1).max(24_000), quote });
const revision = z.number().int().nonnegative();
/** AI-authored prose only. Scope, evidence and commercial fields are not editable. */
export const narrativeOperationSchema = z.strictObject({
  action: z.literal('reviseNarrative'), revision,
  summary: draftSchema.shape.summary.optional(),
  benefits: z.array(z.strictObject({productId: productIdSchema, rationale: draftSchema.shape.recommendations.element.shape.rationale})).min(1).max(12).optional(),
}).refine(v => v.summary !== undefined || v.benefits !== undefined, 'Provide summary or benefits');
export const operationSchema = z.discriminatedUnion('action', [
  narrativeOperationSchema,
  z.strictObject({action:z.literal('observeImage'),revision,attachmentId:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().min(1).max(3000)}),
  z.strictObject({ action: z.literal('read') }),
  z.strictObject({ action: z.literal('start'), revision, mode: z.enum(['custom', 'saas', 'consulting', 'agency']) }),
  z.strictObject({ action: z.literal('reuse'), revision, profileId: z.string().regex(/^[a-f0-9]{16}$/) }),
  z.strictObject({ action: z.literal('seller'), revision, fields: z.array(z.strictObject({ field: z.enum(['name','email','website','phone','tagline','description','colors','logo','artwork','accent','ink','muted','soft','dark']), ...fact.shape })).min(1).max(14) }),
  z.strictObject({ action: z.literal('product'), revision, id: productIdSchema, name: optionalInput(fact), description: optionalInput(fact), price: optionalInput(fact.extend({
    currency:z.enum(['USD','EUR']).optional(),basis:z.enum(['verified','hypothetical']).optional(),
    value: fact.shape.value.describe('Decimal amount string in the explicit currency, e.g. "25" or "25.00", not cents. Must match the supplied price.'),
    quote: quote.describe('Verbatim current user excerpt with amount AND currency, e.g. "$25 per user per month". Quote only this product price, not multiple prices.'),
  })), billing: optionalInput(z.strictObject({ sourceMessageId, value: z.enum(['monthly','once']), quote })), unitLabel: optionalInput(fact) }),
  z.strictObject({ action: z.literal('customer'), revision, fields: z.array(z.strictObject({ field: z.enum(['name','company','email']).describe('company = customer organization or business recipient (required); name = optional individual contact, never the organization.'), ...fact.shape })).min(1).max(3) }),
  z.strictObject({ action: z.literal('notes'), revision, sourceMessageId, text: quote.describe('An exact discovery excerpt if available. Summaries are not evidence: the server imports captured human messages in this thread instead of saving a paraphrase.') }),
  z.strictObject({ action: z.literal('terms'), revision, terms: z.array(fact).min(1).max(6) }),
  z.strictObject({ action: z.literal('select'), revision, sourceMessageId, productId: productIdSchema, quantity: optionalInput(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)), quote }),
  z.strictObject({ action: z.literal('remove'), revision, sourceMessageId, productId: productIdSchema, quote }),
  z.strictObject({ action: z.literal('draft'), revision, draft: z.strictObject({...draftSchema.shape,timeline:draftSchema.shape.timeline.default([])}).pipe(draftSchema) }),
  z.strictObject({ action: z.literal('review'), revision }),
  z.strictObject({ action: z.literal('generate'), revision }),
]);
// Derive batch changes from the same validators; no second mutation schema.
const changeOptions = operationSchema.options
  .filter(o => !['read','review','generate','reviseNarrative'].includes(o.shape.action.value))
  .map(o => z.strictObject({ ...Object.fromEntries(Object.entries(o.shape).filter(([key]) => key !== 'revision')),
    ...(o.shape.action.value === 'start' ? {mode:z.literal('custom').describe('Custom business input, regardless of industry. Sample fixtures use generateSample.')} : {}),
    revision:revision.optional().describe('Omit in a batch. If supplied it must equal the enclosing batch revision, not a per-change counter.'),
  }));
const changeSchema = z.discriminatedUnion('action',[changeOptions[0]!,...changeOptions.slice(1)]);

export const workspaceOperationSchema = z.discriminatedUnion('action',[...operationSchema.options, z.strictObject({
  action: z.literal('batch'), revision, changes: z.array(changeSchema).min(1).max(30),
  generate: z.boolean().default(false),
}).superRefine((batch,ctx)=>{
  batch.changes.forEach((change,index)=>{if(change.revision!==undefined&&change.revision!==batch.revision)ctx.addIssue({code:'custom',path:['changes',index,'revision'],message:'Nested revision must equal the enclosing batch revision; omit it otherwise.'});});
})]);
// The internal service supports fixture initialization; the model-facing workspace does not.
export const workspaceToolSchema=z.strictObject({operation:z.discriminatedUnion('action',workspaceOperationSchema.options.map(o=>o.shape.action.value==='start'?z.strictObject({action:z.literal('start'),revision,mode:z.literal('custom')}):o) as [typeof workspaceOperationSchema.options[0], ...typeof workspaceOperationSchema.options])});
export type Operation = z.infer<typeof operationSchema>;
const product = catalogSchema.shape.products.element;
export const sessionSchema = z.strictObject({
  lastOperation:z.strictObject({messageId:z.string(),hash:z.string(),revision:z.number().int()}).optional(),
  websiteApproval:z.strictObject({reviewId:z.string(),confirmationMessageId:z.string()}).optional(),
  provenance: z.record(z.string(),z.strictObject({sourceMessageId:z.string(),quote:z.string(),valueHash:z.string().regex(/^[a-f0-9]{64}$/)})).default({}),
  contract:contractSchema.optional(),
  currency:z.enum(['USD','EUR']).default('USD'),
  revision: revision.default(0), mode: z.enum(['custom','sample']).optional(),
  seller: sellerSchema.partial().default({}), customer: customerSchema.partial().default({}),
  products: z.array(product.partial().required({ id: true })).max(50).default([]),
  selections: z.array(z.strictObject({ productId: productIdSchema, quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), evidenceQuote: z.string().max(500) })).max(12).default([]),
  pendingQuantities: z.array(productIdSchema).max(12).default([]),
  notes: z.string().max(12_000).default(''), terms: z.array(z.string().min(1).max(400)).max(6).default([]),
  // Strip legacy review tokens when reading pre-fix workspaces; drafts need no approval.
  draft: draftSchema.optional(), review: z.object({ proposal: proposalSchema, commercial: commercialSchema }).optional(),
  artifacts: z.strictObject({ inputHash:z.string().optional(), revision:revision.optional(), error:z.string().optional(), directory: z.string(), completeness: z.enum(['complete','html-only']), current: z.boolean() }).optional(),
});
export type Session = z.infer<typeof sessionSchema>;
export const workspaceSchema = z.strictObject({
  turns:z.record(z.string(),z.strictObject({candidate:z.record(z.string(),z.unknown()).default({}),requested:z.boolean().default(false),authorizationMessageId:z.string().optional(),lastMessageId:z.string().optional(),requestHash:z.string().optional(),outcome:z.record(z.string(),z.unknown()).optional(),fetchErrors:z.array(z.string()).default([])})).default({}),
  v1Turns:z.record(z.string(),z.strictObject({progressive:z.boolean().optional(),discoveryAsked:z.boolean().optional(),stage:z.enum(['collecting','discovery','review']).optional(),reviewHash:z.string().optional(),candidate:z.record(z.string(),z.unknown()).default({}),requested:z.boolean().default(false),authorizationMessageId:z.string().optional(),lastMessageId:z.string().optional(),requestHash:z.string().optional(),outcome:z.record(z.string(),z.unknown()).optional(),fetchErrors:z.array(z.string()).default([])})).default({}),
  pendingProposals:z.record(z.string(),z.strictObject({sourceMessageId:z.string(),revision:z.number().int().nonnegative(),offering:z.string(),field:z.enum(['billing','quantity','price']).default('billing'),request:z.record(z.string(),z.unknown())})).default({}),
  attachments:z.record(z.string(),z.record(z.string(),z.strictObject({sourceMessageId:z.string(),reference:z.string(),hash:z.string(),mime:z.string(),capturedAt:z.string(),status:z.literal('unverified-image'),observation:z.string().max(3000).optional()}))).default({}),
  attachmentErrors:z.record(z.string(),z.array(z.string())).default({}),
  websites: z.record(z.string(),websiteState).default({}),
  owners:z.record(z.string(),z.string()).default({}),
  sources:z.record(z.string(),z.record(z.string(),z.strictObject({text:z.string().max(32_000),hash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string(),origin:z.literal('user-text').optional(),status:z.literal('user-provided').optional()}))).default({}),
  profileResources:z.record(z.string(),z.string()).default({}),
  // Text-only conversation context, never an alternate catalog or proposal database.
  conversations: z.record(z.string(), z.array(z.strictObject({
    id: z.string(), role: z.enum(['user', 'assistant']), text: z.string().max(32_000), createdAt: z.string(),
  })).max(20)).default({}),
  version: z.literal(1), sessions: z.record(z.string(), sessionSchema), profiles: z.record(z.string(), commercialSchema),
});
export type Workspace = z.infer<typeof workspaceSchema>;
