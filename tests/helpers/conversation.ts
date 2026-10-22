import { ProposalService } from '../../src/assistant/service.js';

export const sellerMessage = 'Create my own proposal. Seller: Example Harbor Tools. Contact hello@harbor.example. Website https://harbor.example. Tagline: Plans with clarity.';
export const productMessage = 'Planning seats: Named access to shared planning. Price $25 per month. Migration session: A single assisted configuration session. Price $300 one-time.';
export const customerMessage = 'Customer: Jamie Demo at Example Ridge Guild; jamie@example.com.';
export const notes = 'The team needs a shared planning space to coordinate its weekly schedule. They want to begin with an assisted configuration session. Scope and timing are not yet confirmed.';
export const selection = 'Include 12 Planning seats and 1 Migration session.';
export const terms = 'Scope and timing remain to be agreed. This is an estimate, not a contract.';
export const f = (value: string, quote = value) => ({ value, quote });
export function customTurns() {
  return [
    { text: sellerMessage, operations: [
      { action: 'start', mode: 'custom' },
      { action: 'seller', fields: [{ field: 'name', ...f('Example Harbor Tools') }, { field: 'email', ...f('hello@harbor.example') }, { field: 'website', ...f('https://harbor.example') }, { field: 'tagline', ...f('Plans with clarity.') }] },
    ] },
    { text: productMessage, operations: [
      { action: 'product', id: 'planning-seat', name: f('Planning seats'), description: f('Named access to shared planning.'), price: f('25', '$25'), billing: { value: 'monthly', quote: 'per month' } },
      { action: 'product', id: 'migration', name: f('Migration session'), description: f('A single assisted configuration session.'), price: f('300', '$300'), billing: { value: 'once', quote: 'one-time' } },
    ] },
    { text: customerMessage, operations: [{ action: 'customer', fields: [{ field: 'name', ...f('Jamie Demo') }, { field: 'company', ...f('Example Ridge Guild') }, { field: 'email', ...f('jamie@example.com') }] }] },
    { text: notes, operations: [{ action: 'notes', text: notes }] },
    { text: selection, operations: [
      { action: 'select', productId: 'planning-seat', quantity: 12, quote: selection },
      { action: 'select', productId: 'migration', quantity: 1, quote: selection },
    ] },
    { text: terms, operations: [{ action: 'terms', terms: [f(terms)] }] },
  ];
}
export async function call(service: ProposalService, action: Record<string, unknown>, text: string, thread = 'local') {
  const state = await service.run({ action: 'read' }, '', thread);
  return service.run({ ...action, revision: state.revision }, text, thread);
}
export async function populate(service: ProposalService, thread = 'local') {
  for (const turn of customTurns()) for (const op of turn.operations) await call(service, op, turn.text, thread);
}
export async function draftOperation(service: ProposalService, concise = false, thread = 'local') {
  const state = await service.run({ action: 'read' }, '', thread);
  return { action: 'draft', draft: {
    headline: `A planning proposal for ${state.customer.company}`,
    summary: concise ? 'A shared space for weekly planning.' : 'A shared planning space based on the requirements discussed with your team.',
    needs: [{ text: 'Coordinate the weekly schedule in a shared planning space.', evidenceQuote: 'The team needs a shared planning space to coordinate its weekly schedule.' }],
    recommendations: state.selections.map(v => ({ ...v, rationale: v.productId === 'planning-seat' ? 'Give the selected team members named access to planning.' : 'Provide the requested assisted configuration session.' })),
    timeline: [], assumptions: [], openQuestions: ['When would you like to start?'], nextStep: 'Review the scope and agree a start date.',
  } };
}
