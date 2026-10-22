import {z} from 'zod';
const text=(max:number)=>z.string().trim().min(1).max(max);
export const proposalInputSchema=z.strictObject({
 intent:z.enum(['proposal','revision','conversation','research']),
 seller:text(100).optional(),customer:text(160).optional(),
 offerings:z.array(z.strictObject({name:text(100),description:text(400).optional(),quantity:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),unitPrice:z.number().nonnegative().max(1e12).optional(),currency:z.enum(['USD','EUR']).optional(),billing:z.enum(['once','monthly']).optional(),included:z.boolean().optional()})).max(12).optional(),
 termMonths:z.number().int().positive().max(120).optional(),
 noFixedCommitment:z.boolean().optional(),customerGoal:text(400).optional(),
 summary:text(600).optional(),scope:text(400).optional(),
});
export type ProposalInput=z.infer<typeof proposalInputSchema>;
