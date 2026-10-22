import {z} from 'zod';
import {productIdSchema} from '../proposal/commercial.js';
const text=(max:number)=>z.string().trim().min(1).max(max);
export const webFact=z.strictObject({url:z.url(),value:text(400),quote:text(3000)});
export const companyFact=z.union([webFact,z.strictObject({value:text(400),quote:text(3000)})]);
export const websiteInput=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('fetch'),url:z.url(),role:z.enum(['seller','pricing','customer'])}),
 z.strictObject({action:z.literal('review'),usdCurrencyQuote:text(500).optional().describe('Only when a captured salesperson message explicitly confirms USD: exact human quote, never website text.'),seller:companyFact,customer:companyFact.optional(),customerDescription:webFact.optional(),sellerDescription:webFact.optional(),products:z.array(z.strictObject({id:productIdSchema.optional(),name:z.strictObject({url:z.url(),value:text(100),quote:text(3000).optional()}),features:z.array(webFact).max(8).default([]),terms:z.union([z.strictObject({url:z.url(),quote:text(3000)}),z.strictObject({url:z.url(),startLine:z.number().int().positive(),endLine:z.number().int().positive()})]).optional()})).min(1).max(12)}),
 z.strictObject({action:z.literal('requestApproval'),candidateIds:z.array(productIdSchema).min(1).max(12)}),
 z.strictObject({action:z.literal('confirm'),reviewId:text(64).optional()}),
 z.strictObject({action:z.literal('read')}),
]);
export const webSource=z.strictObject({partial:z.boolean().optional(),status:z.enum(['fetched','partial']).optional(),id:text(64),requestedUrl:z.url(),url:z.url(),retrievedAt:z.iso.datetime(),role:z.enum(['seller','pricing','customer']),text:text(64000),hash:text(64)});
export const webPrice=z.strictObject({kind:z.enum(['fixed','starting','annual','tiered','usage','promotional','contact','ambiguous']),amountCents:z.number().int().nonnegative().optional(),currency:text(20),billing:z.enum(['monthly','once','unsupported']),unit:z.string(),quote:z.string(),reason:z.string(),model:z.string().optional(),addOn:z.boolean().optional(),publishedAmounts:z.array(z.string()).optional(),eligible:z.boolean().optional()});
export const webCandidate=z.strictObject({id:productIdSchema,name:text(100),description:text(400),price:webPrice,sourceId:text(64),sourceUrl:z.url().optional(),retrievedAt:z.iso.datetime().optional(),sourceHash:text(64).optional(),startLine:z.number().int().positive().optional(),endLine:z.number().int().positive().optional(),features:z.array(webFact).max(8)});
export const webReview=z.strictObject({id:text(64),createdFromMessageId:z.string(),workspaceRevision:z.number().int(),currencyEvidence:z.strictObject({sourceMessageId:z.string(),quote:z.string()}).optional(),seller:companyFact,customer:companyFact.optional(),customerDescription:webFact.optional(),sellerDescription:webFact.optional(),products:z.array(webCandidate).max(12),confirmationText:z.string()});
export const websiteState=z.strictObject({sources:z.array(webSource).max(8).default([]),review:webReview.optional(),pendingApproval:z.strictObject({reviewId:text(64),candidateIds:z.array(productIdSchema),requestedInMessageId:z.string(),question:z.string(),presented:z.boolean().default(false)}).optional(),approvals:z.array(z.strictObject({reviewId:text(64),messageId:z.string(),confirmedAt:z.iso.datetime(),candidateIds:z.array(productIdSchema).optional(),review:webReview})).default([])});
export type WebsiteState=z.infer<typeof websiteState>;
