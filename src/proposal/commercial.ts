import { z } from 'zod';

export const defaultColors = { ink: '#092238', muted: '#475569', accent: '#00636B', soft: '#EAF2F0', white: '#FFFFFF', canvas: '#F3F5F5', border: '#D3DEDF', dark: '#003D43' };
const text = (max: number) => z.string().trim().min(1).max(max);
const singleLine = (max: number) => text(max).refine(v => !/[\r\n]/.test(v), 'Use a single line');
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(h => parseInt(h, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
}
const colorsSchema = z.strictObject({ ink: hex, muted: hex, accent: hex, soft: hex, white: hex, canvas: hex, border: hex, dark: hex }).superRefine((c, ctx) => {
  for (const [fg, bg] of [[c.ink,c.white], [c.ink,c.soft], [c.muted,c.white], [c.muted,c.soft], [c.accent,c.white], [c.accent,c.soft], [c.white,c.dark], [c.dark,c.white]]) {
    const a = luminance(fg!), b = luminance(bg!);
    if ((Math.max(a,b) + .05) / (Math.min(a,b) + .05) < 4.5) ctx.addIssue({ code: 'custom', message: 'Brand text colors must meet 4.5:1 contrast' });
  }
});
const logoSchema = z.strictObject({
  src: text(24_000).regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/).refine(value => {
    const bytes = Buffer.from(value.split(',')[1] ?? '', 'base64');
    return bytes.length <= 16_000 && (value.startsWith('data:image/png;') ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216);
  }, 'Use a small embedded PNG or JPEG image'),
  alt: singleLine(100),
});
export const sellerSchema = z.strictObject({
  name: singleLine(100), email: z.email().max(254).optional(), description: text(200).optional(),
  tagline: singleLine(100).optional(), website: z.url().max(300).refine(v => { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password; }, 'Use an HTTPS website without credentials').optional(),
  artwork: logoSchema.optional(),
  phone: singleLine(40).optional(), logo: logoSchema.optional(), colors: colorsSchema.default(() => ({ ...defaultColors })),
});
export const productIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/);
export const catalogSchema = z.strictObject({
  version: singleLine(50), currency: z.enum(['USD','EUR']),
  products: z.array(z.strictObject({
    currency:z.enum(['USD','EUR']).optional(),priceBasis:z.enum(['verified','hypothetical']).optional(),assumption:z.strictObject({quote:text(3000),sourceMessageId:text(200)}).optional(),
    id: productIdSchema, name: singleLine(100), description: text(400),
    billing: z.enum(['monthly', 'once']), unitPriceCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    maxQuantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), unitLabel: singleLine(40).optional(),
    requires: z.array(productIdSchema).max(10).default([]),
    icon: z.enum(['workspace', 'team-seat', 'onboarding', 'reporting']).optional(),
  })).min(1).max(50),
}).superRefine((v,ctx) => {
  if(v.products.some(p=>p.currency&&p.currency!==v.currency))ctx.addIssue({code:'custom',message:'Mixed-currency catalogs are unsupported; no implicit conversion.'});
  if(v.products.some(p=>p.priceBasis==='hypothetical'&&!p.assumption))ctx.addIssue({code:'custom',message:'Hypothetical prices require explicit salesperson authorization.'});
  const ids = v.products.map(p => p.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({code:'custom',message:'Duplicate catalog product IDs'});
  for (const p of v.products) if (p.requires.some(id => id === p.id || !ids.includes(id))) ctx.addIssue({code:'custom',message:'Invalid catalog dependency'});
});
/** Trusted, seller-confirmed commercial input. Never obtain prices from draft prose. */
export const contractSchema=z.discriminatedUnion('kind',[z.strictObject({kind:z.literal('fixed'),months:z.number().int().positive().max(120)}),z.strictObject({kind:z.literal('no_fixed')})]);
export const commercialSchema = z.strictObject({
  seller: sellerSchema, catalog: catalogSchema, contract:contractSchema.optional(), terms: z.array(text(400)).max(6),
});
export type CommercialInput = z.input<typeof commercialSchema>;
export type Commercial = z.output<typeof commercialSchema>;
export type Seller = z.output<typeof sellerSchema>;
