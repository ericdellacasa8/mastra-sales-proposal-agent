import saas from '../../fixtures/saas.json';
import consulting from '../../fixtures/consulting.json';
import agency from '../../fixtures/agency.json';
import { z } from 'zod';
import { commercialSchema } from './commercial.js';
import { discoverySchema, draftSchema } from './schema.js';
import { finalizeProposal } from './finalize.js';

export const fixtureIds = ['saas', 'consulting', 'agency'] as const;
export type FixtureId = typeof fixtureIds[number];
export const confirmedInputSchema = z.strictObject({ commercial: commercialSchema, discovery: discoverySchema, draft: draftSchema });
export function loadFixture(id: FixtureId) {
  return confirmedInputSchema.parse({ saas, consulting, agency }[id]);
}
export function fixtureProposal(id: FixtureId) {
  const input = loadFixture(id);
  return { input, proposal: finalizeProposal(input.discovery, input.draft, input.commercial, {
    id: `00000000-0000-4000-8000-00000000000${fixtureIds.indexOf(id) + 3}`, createdAt: '2026-10-16T00:00:00.000Z',
  }) };
}
