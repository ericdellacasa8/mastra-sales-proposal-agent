# Conversational V1 acceptance

Status as of 2026-10-22: earlier V1 Studio generation, commercial/narrative revisions
and PDF layouts were **owner-tested**. Fresh Node 24 installation and the latest
fee-revision live retest remain **pending**. Sandbox automated results do not substitute
for live-model or visual acceptance. Research-driven workflows are outside V1.
Use fresh Studio threads. See [verification matrix](local-development.md#verification-matrix).

## Mac Terminal

```bash
node --version  # use Node 24, matching .nvmrc
npm ci
npm run browser:install
test -f .env || cp .env.example .env
# Set OPENAI_API_KEY in .env.
npm run typecheck
npm run test:unit
npm run build
npm run test:v1:live
npm run dev
```

The live diagnostic uses real provider calls through actual Studio signal handlers
for consulting/SaaS and their revisions. It is not a browser UI test. Its missing-price
restart check remains scripted. Outputs from the initial real-rendering attempts
are copied to `data/qa/v1-conversational/consulting/` and `saas/`; an HTML-only bundle
is a failure, not a passing acceptance. Use the Studio preview links for revisions.

## Manual acceptance

1. Fresh thread:
   “I run Northstar Advisory. Prepare a proposal for Meridian Logistics: one Discovery
   at €3,000 and one Implementation at €12,000, both one-time fees. Implementation takes
   eight weeks across three milestones. Include optional Support at €1,500/month,
   excluded from committed totals. Generate the proposal.”
   Expect €15,000 committed; support excluded; no support quantity required.
2. Fresh thread:
   “Northstar Software proposes 100 Pro seats at €75 per seat per month for 12 months
   plus one Onboarding at €2,500 one-time for Meridian Logistics. Generate the proposal.”
   Expect €7,500 monthly and €92,500 committed over the supplied 12 months.
3. Same thread: “Change Pro to 150 seats and regenerate.” Expect €11,250 monthly and
   €137,500 committed over 12 months including unchanged onboarding.
4. “Shorten the executive summary without changing commercial terms.” Totals unchanged.
5. Fresh thread: “Cedar offers one Audit, a one-time service in EUR, to Fern. Create a
   proposal.” Expect one price question. Stop/restart Studio, resume the same thread,
   and answer “The Audit unit price is EUR 800.” Expect one optional goal question. Skip it, inspect the commercial summary, then confirm generation.
6. Open every PDF, HTML proposal and HTML email. Check roles, prices, quantities,
   optional exclusions, scope, term, readable layout and synchronization.
7. Fresh thread: “Research this website only: https://example.com.” No fetch or artifacts.

Run steps 1–6 from a fresh installation too. Record actual results and unnecessary
questions. Passing scripted tests is not acceptance.

## Three-minute boss walkthrough

Show the SaaS prompt, all three preview links, the 150-seat revision and a concise
summary revision. Explain that one structured state and shared Elements React
components power all formats. Use the offline consulting preview as a clearly
labeled deterministic fallback if live acceptance is not yet passing.

If either direct-input live scenario fails, stop. Capture the tool error and use
`npm run preview -- --input fixtures/consulting.json --name fallback` with explicitly
edited structured data. Do not begin another open-ended evidence/prompt patch cycle.

## Contract, discovery and review acceptance

Fresh thread, send separately:
1. “Prepare a proposal from OpenAI to HubSpot.”
2. “The offering is ChatGPT Enterprise.”
3. “100 seats.”
4. “Use illustrative EUR 105 per seat per month.”
   Expect a fixed-term/no-fixed-commitment question and no artifacts.
5. “12 months.” Expect one optional customer-goal question.
6. “Skip.” (Or supply a genuine goal.) Expect a review showing EUR10,500 monthly,
   EUR126,000 annualized recurring run-rate and EUR126,000 committed over 12 months.
7. Optionally say “Change to 150 seats.” Expect updated review and no artifacts.
8. “Confirm.” Expect three synchronized artifacts. Stop/restart Studio between
   steps 6 and 8 to check persisted review state.

In another fresh thread:
“Generate immediately: Cedar to Fern, 100 Pro seats at EUR105 per month, no fixed
commitment.” Expect EUR10,500 monthly, EUR126,000 annualized recurring run-rate,
explicit no-fixed-commitment labeling, and no committed contract total.

For the mixed SaaS one-shot above, expect EUR7,500 monthly, EUR90,000 annualized
recurring run-rate, and EUR92,500 committed over the explicitly supplied 12 months.
Inspect both HTML formats and the actual PDF. Legacy firstYearCents remains an
internal compatibility field; it is not used as a V1 commitment without a term.

## Latest fee revision — pending live retest

Run `PROPOSAL_TEST_REAL_PDF=1 node --import tsx --test tests/v1-fee-revision.test.ts`
for the deterministic service replay with real Chromium. Then in a fresh Studio thread,
send these separately (do not present the service replay as live-model acceptance):

1. “I work on the sales team at Google and want a proposal for Chevron.”
2. “1000 Gemin licenses for all employees at Chevron's HQ.”
3. “$10/per month per Gemini license.”
4. “Yes, 12 months.”
5. “Boost operational efficiency at HQ; make the workforce more AI savvy; implement
   AI agents where appropriate across internal processes.”
6. “apply one time fees of $100”
7. Inspect the updated review, then “confirm”.

Expect the original offering name retained, $10,000 recurring, $100 one-time,
$120,000 annualized recurring, $120,100 committed over 12 months and $10,100 first month.
The term/goals must not be requested again. Open all three previews. This is hypothetical
test input, not an official Google product/pricing claim. Use fictional company names
for any colleague-facing demo recording.

Record date, Node/model version, fresh-install result, browser/PDF result, live Studio
result, restart/isolation observations and any redundant questions. No private customer
transcript, API key or runtime database belongs in the review repository.
