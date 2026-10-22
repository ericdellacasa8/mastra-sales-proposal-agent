import { demoCommercial } from './catalog.js';
import { discoverySchema, inputSchema, type Discovery, type DraftProposal } from './schema.js';
import { finalizeProposal } from './finalize.js';

export const sampleIds = ['software', 'healthcare'] as const;
export type SampleId = (typeof sampleIds)[number];
const softwareNotes = "FICTIONAL DEMO \u2014 no real customer or personal data. Our internal operations team needs one shared workspace and 12 team seats. Project handoffs are tracked across spreadsheets, so owners lose visibility into open work. We want reusable checklists and operational status summaries with CSV exports. Include the one-time onboarding package and the reporting add-on. We hope to begin a pilot next month, but no start date is agreed. Success means a clearer view of owners and outstanding tasks; no savings target has been measured. Please send an estimate and suggest a scope-review meeting. No discount or custom integration was agreed.";
const healthcareNotes = "FICTIONAL DEMO \u2014 administrative workflow only; no patients, medical records, staff identities, or personal details. Our administration team needs one workspace and eight team seats for office-supply checklists and room-maintenance tasks. Include the one-time onboarding package. Reporting is not needed for the pilot. We have no agreed launch date. We asked whether clinical-system integrations and healthcare compliance were supported; the seller has not confirmed either. Keep both outside the proposed scope and list them as unanswered questions. Please suggest an administrative scope-review meeting before scheduling anything.";

export const samples: Record<SampleId, { discovery: Discovery; draft: DraftProposal }> = {
  software: {
    discovery: { customer: { name: 'Demo Buyer A', company: 'Fictional Software Co.', email: 'buyer-a@example.com' }, notes: softwareNotes },
    draft: {
      summary: 'Give your operations team one clear place to coordinate work, track ownership and prepare reliable handoffs.',
      needs: [{ text: 'Make project ownership and outstanding work visible across the team.', evidenceQuote: 'Project handoffs are tracked across spreadsheets, so owners lose visibility into open work.' }],
      recommendations: [
        { productId: 'workspace', quantity: 1, rationale: 'Bring shared tasks and reusable checklists into one workspace.', evidenceQuote: 'Our internal operations team needs one shared workspace and 12 team seats.' },
        { productId: 'team-seat', quantity: 12, rationale: 'Give each team member named access.', evidenceQuote: 'Our internal operations team needs one shared workspace and 12 team seats.' },
        { productId: 'onboarding', quantity: 1, rationale: 'Configure the workspace and introduce the team to its new process.', evidenceQuote: 'Include the one-time onboarding package and the reporting add-on.' },
        { productId: 'reporting', quantity: 1, rationale: 'Review operational status and export summaries for follow-up.', evidenceQuote: 'We want reusable checklists and operational status summaries with CSV exports.' },
      ],
      timeline: [{ phase: 'Pilot planning', detail: 'A pilot next month is a preference, not a committed start date.', evidenceQuote: 'We hope to begin a pilot next month, but no start date is agreed.' }],
      assumptions: ['The pilot covers internal operations only. Custom integrations are outside this estimate.'],
      openQuestions: ['Which handoff checklist should the team configure first?'],
      nextStep: 'Arrange a scope-review meeting to confirm the first workflow and agree a pilot start date.',
    },
  },
  healthcare: {
    discovery: { customer: { name: 'Demo Buyer B', company: 'Fictional Clinic Operations Co.', email: 'buyer-b@example.com' }, notes: healthcareNotes },
    draft: {
      summary: 'Organize everyday administrative tasks in one shared workspace, with a clear and deliberately limited pilot scope.',
      needs: [{ text: 'Coordinate office supplies and room-maintenance tasks without patient information.', evidenceQuote: 'Our administration team needs one workspace and eight team seats for office-supply checklists and room-maintenance tasks.' }],
      recommendations: [
        { productId: 'workspace', quantity: 1, rationale: 'Coordinate supply checklists and maintenance tasks.', evidenceQuote: 'Our administration team needs one workspace and eight team seats for office-supply checklists and room-maintenance tasks.' },
        { productId: 'team-seat', quantity: 8, rationale: 'Provide named access for the administration team.', evidenceQuote: 'Our administration team needs one workspace and eight team seats for office-supply checklists and room-maintenance tasks.' },
        { productId: 'onboarding', quantity: 1, rationale: 'Configure administrative checklists and train the team.', evidenceQuote: 'Include the one-time onboarding package.' },
      ],
      timeline: [{ phase: 'Scope review', detail: 'Confirm the administrative scope before discussing a launch date.', evidenceQuote: 'We have no agreed launch date.' }],
      assumptions: ['Administrative workflows only. No patient information or clinical workflows are included.', 'Operational reporting is excluded from this pilot.'],
      openQuestions: ['Clinical-system integrations and healthcare compliance remain unconfirmed and outside the proposed scope.'],
      nextStep: 'Arrange an administrative scope-review meeting before scheduling the pilot.',
    },
  },
};

export function resolveInput(value: unknown): Discovery {
  const input = inputSchema.parse(value);
  if (input.sampleId !== 'custom') return discoverySchema.parse(samples[input.sampleId].discovery);
  return discoverySchema.parse({ customer: { name: input.customerName, company: input.company, email: input.email }, notes: input.notes });
}

export function sampleProposal(id: SampleId) {
  return finalizeProposal(samples[id].discovery, samples[id].draft, demoCommercial, {
    id: id === 'software' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002',
    createdAt: '2026-10-16T00:00:00.000Z',
  });
}
