import { brand } from '../config/brand.js';
export const catalogVersion = 'demo-2026-01';
export const productIds = ['workspace', 'team-seat', 'onboarding', 'reporting'] as const;
export type ProductId = (typeof productIds)[number];

export const catalog = {
  workspace: { name: 'Operations workspace', description: 'Shared tasks and reusable internal checklists.', billing: 'monthly', unitPriceCents: 24_000, maxQuantity: 1 },
  'team-seat': { name: 'Team access', description: 'Named access for each member of your team.', billing: 'monthly', unitPriceCents: 1_800, maxQuantity: 100 },
  onboarding: { name: 'Guided onboarding', description: 'One configuration and team-training package.', billing: 'once', unitPriceCents: 90_000, maxQuantity: 1 },
  reporting: { name: 'Operational reporting', description: 'Status summaries and CSV exports.', billing: 'monthly', unitPriceCents: 7_500, maxQuantity: 1 },
} as const;

export const seller = brand.seller;
export const terms = [
  'Illustrative estimate in USD. Taxes are excluded and are not calculated.',
  'Scope and start date are subject to confirmation. No discounts are included.',
  'The first-year estimate covers 12 monthly charges plus one-time onboarding; it is not a contract commitment.',
  'No payment collection or automatic renewal is included in this demonstration.',
] as const;


// Legacy demo data only. Reusable generation accepts an explicit commercial input.
export const demoCommercial = {
  seller: { ...seller, colors: brand.colors, logo: brand.logo, tagline: brand.tagline },
  catalog: { version: catalogVersion, currency: 'USD' as const, products: Object.entries(catalog).map(([id, product]) => ({
    id, ...product, requires: ['team-seat', 'reporting'].includes(id) ? ['workspace'] : [],
    icon: id as ProductId,
  })) },
  terms: [...terms],
};
