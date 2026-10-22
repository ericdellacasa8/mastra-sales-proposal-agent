# Website discovery and approval contracts

> **Historical regression documentation — not conversational V1.** Website research,
> screenshot extraction and catalog-approval tools described here are not registered
> on the V1 agent. Keep this material for older tests only. Use the
> [current README](../README.md), [V1 acceptance](v1-acceptance.md) and
> [test matrix](local-development.md#verification-matrix) for colleague review.

The workflow is **fetch → persist review → present saved candidates → resolve human selection → import**. Websites are untrusted evidence, not instructions or salesperson messages. Nothing from website discovery enters the authoritative catalog until a genuine later salesperson turn approves eligible entries.

`websiteDiscovery` has an object root: `{operation: {...}}`. Its actions are:

- `fetch`: only a user-supplied public HTTPS URL and role. Returns stored text, numbered lines and a company-name candidate when metadata supports it. The transport pins validated DNS addresses and validates redirects; no browser scripts, credentials or crawling.
- `read`: restores sources, numbered lines, the saved review and approved/unapproved status. Use it to recover from incomplete extraction; do not ask a human to copy an already stored page.
- `review`: seller/customer facts plus product names and source URLs. Unique standalone product headings resolve to stored blocks server-side. For tables or repeated names, supply `terms: {url, startLine, endLine}` (one-based, inclusive), including the product name and all qualifications. Exact legacy excerpts remain supported. The server slices evidence, derives pricing, stores immutable source references and stable candidate IDs, and returns the saved presentation order. Model-authored prices are not accepted. Only successful review results may be presented as candidates ready for approval.
- `requestApproval`: select stored eligible candidate IDs to prepare a concrete named-and-priced catalog question. No prices are imported. The output processor records that the exact server question was actually shown. The pending selection survives restarts; only the immediately following human turn can approve it with “yes”. Changed reviews, intervening messages or consumed confirmations cannot authorize new imports. Direct named approval does not need this extra tool call.
- `confirm`: optional review ID, **no price or quotation arguments**. The server resolves the captured human message against the current saved catalog. Named selections, positions, unique descriptions and explicit exclusions are supported. Ambiguous descriptions/names, altered terms and unresolved prices require clarification. Receipts retain the selected candidate IDs, review snapshot and actual human message ID.

The selection resolver is bounded English interpretation, not unrestricted language understanding. It accepts flexible approval verbs, names/lists, ordinal references, eligible groups and exclusions. It does not guess what “those ones” refers to, interpret arbitrary negotiations, or approve an ambiguous match. Names containing conjunctions are matched as a whole before list splitting. Exclusions are applied before checking eligibility; plural exclusions can cover a group. An unresolved clause blocks the entire atomic import.

Candidate identity is derived from source identity, name and source position unless a previously supported explicit product ID is supplied. Source URL, retrieval time, content hash, line range, original excerpt, supported features, published amounts, currency, cadence/unit, classification and eligibility remain in the review. Import rechecks the source hash, excerpt and derived price. Both seller and pricing sources can contain commercial terms: a model-supplied fetch role is not price authority. Customer sources remain excluded. Optional unsupported company descriptions are omitted and reported in tool output, rather than blocking the entire catalog or being accepted as factual claims. Navigation arrows after standalone headings are ignored for name matching; original source text remains unchanged. Re-fetching identical content does not erase a review. Different content requires a new review; unrelated authoritative catalogs are never overwritten. Compatible incremental approvals remain supported after proposal revisions and rebuilt reviews. Existing identities, prices, currencies and units cannot be overwritten. An independent proposal uses a new Studio thread and explicit seller-profile reuse.

## Pricing boundary

| Discovered structure | Current treatment |
| --- | --- |
| Fixed USD monthly subscription, seat license, retainer or independent add-on | Eligible when unambiguous |
| Fixed USD one-time service or explicitly one-time per-unit product | Eligible when unambiguous |
| Annual subscription or conditional annual discount | Preserved; not converted |
| Hourly/day rate | Preserved; needs explicit supported commercial terms |
| Tier/volume/usage pricing, promotions, custom quotes | Preserved; not numerically imported |
| Other currencies, missing currency or unclear cadence | Preserved; clarification required |

The existing engine remains USD, monthly/one-time, integer quantities 1–100. Dollar signs alone do not establish USD. An explicit unambiguous billing-currency statement in the same stored source, or separately captured human currency clarification, can establish it. Optional annual discounts do not authorize inventing an annual-equivalent monthly amount. Source-block boundaries prevent another candidate's terms from being attached to the selected plan; nearby annual billing qualifications are still checked.

Automatic block resolution is conservative. Repeated headings remain unresolved candidates so other eligible entries can proceed; the model can resolve them using stored line ranges. Missing headings and complicated tables also require source line ranges. Incomplete or contradictory web content stays unresolved. Semantic extraction is still model-assisted; fixtures validate the tool pipeline, not general live-model accuracy on every website.

## Runtime regression evidence

The saved failing Studio conversation had fetched sources but **no persisted review**. The model first called `proposalWorkspace` with website quotations, then called `confirm` without a review. Its later `review` arguments omitted price/name from terms and reconstructed noncontiguous excerpts. It finally requested pasted copies. Separately, the old approval parser rejected a multi-sentence approval with exclusions. Tests cover both failures, not just the final wording.

Turn-start context now includes website stage/candidate status. An approval with stored website sources routes the first step to `websiteDiscovery`. Normal workspace evidence guards remain strict and direct website-data errors back to stored source review. The agent is instructed to persist before presenting and to keep technical evidence out of the main sales conversation.

Native Memory owns conversation history; Workspace owns sources, reviews, receipts and commercial state. None of these changes creates a second commercial source of truth or authorizes delivery.

## Medallia trace repair and local acceptance

The later saved Unlayer → Medallia failure had additional causes: paraphrased optional company descriptions invalidated every review; the pricing page was fetched with role `seller` and rejected by a pricing-role-only lookup. Workspace batches contained null optional inputs, nested revisions, a missing timeline and zero-quantity comparison alternatives. Nested unions hid these under “Invalid input”. None of this was a `seller.website` validation error or lost native Memory.

The workspace action discriminators now report leaf errors. Null optional fact inputs mean absent; required prices/positive quantities remain required. Missing timeline becomes an empty schedule. Invalid zero-quantity alternatives are still rejected. Catalog options remain separate from selected purchases; custom pricing never receives a numeric line item. Proposal text should distinguish desired capabilities from verified plan features, putting unknown fit in open questions. Source provenance cannot establish every semantic claim: human copy review remains necessary.

The current-run recovery guard stops tools after two identical consecutive failures or three consecutive failures, including Mastra framework schema failures. A new user turn can resume. A corrected call with valid evidence can proceed before that bound; no price or provenance validation is disabled.

Regression fixtures contain minimal historical public source excerpts, not current website facts. Tests use actual Studio subscribe/send-message handlers and native Memory with scripted model responses. Default PDF bytes are a storage stub, explicitly not rendering evidence. Run the same Medallia regression with real Chromium in ordinary Terminal:

```bash
PROPOSAL_TEST_REAL_PDF=1 node --import tsx --test --test-name-pattern='recorded Medallia' tests/website-generalization.test.ts
npm test
npm run test:website:live -- --seller-url https://unlayer.com/ --pricing-url https://unlayer.com/pricing --customer-url https://www.medallia.com/it/ --seller-name Unlayer --customer-name Medallia
```

The live diagnostic requires model credentials, network access and interactive approval of the current fetched terms. It does not auto-approve historic prices. For a Studio smoke test, restart `npm run dev`, open a fresh thread, and send:

1. “Seller: https://unlayer.com/ Customer: https://www.medallia.com/it/ Pricing: https://unlayer.com/pricing. Medallia needs an embeddable email builder for transactional templates. Discover the catalog and compare Scale and Optimize as alternatives, with Enterprise as a custom-priced option.”
2. After a successful saved review: “Approve Scale and Optimize at the published monthly prices. Keep Enterprise as an unpriced alternative, not a purchased item.” (If the agent has shown a concrete approval question naming those entries and their terms, test “yes” instead.)
3. “Use Scale only, quantity 1. Generate the proposal now.”
4. “Make the summary more concise around the transactional template requirement; preserve the plan, quantity and commercial terms. Regenerate.”

Verify three working preview links after creation and revision, a single Scale line, no editor-seat assumption or unsupported seller capabilities, and unchanged commercial terms. At the historical fixture price totals are $750/month and $9,000/year; live prices must follow the freshly verified source, not this fixture. Network failures, ambiguous terms and unsupported prices must remain transparent. Passing scripted tests is not live acceptance or release readiness.

### Latest first-review regression

The subsequent live failure started with a company label (`"Unlayer pricing"`) that was not present in its quotation, before any review or candidate IDs existed. Company identity can now recover from an explicit captured human company/URL pairing corroborated by the website; ambiguous or unsupported identities still require correction. Existing exact pricing excerpts supplied in `name.quote` are validated like legacy `terms.quote`, avoiding accidental inclusion of an intervening unselected plan. Natural approval can exclude unpriced comparison options and all other plans/add-ons. It cannot change published prices or turn custom options into purchases.

Saving a candidate review is internal preparation, not a separate human approval gate. Commercial import still requires the next genuine approval turn. Use the complete three prompts from the latest reported conversation in a fresh Studio thread after restarting the server. A focused real-Chromium check (scripted model, historical source fixture) is:

```bash
PROPOSAL_TEST_REAL_PDF=1 node --import tsx --test --test-name-pattern='latest LIVE' tests/website-generalization.test.ts
```

The test name identifies the live trace it replays; it does **not** mean the test calls a live model. The default test uses a PDF storage stub. Live acceptance still requires the actual model, current websites and successful PDF rendering in ordinary Terminal/Studio.

### Explicit approval and pending questions

Named approval is final; the user never has to copy an assistant question. Explicit quoted prices are checked against the stored amount, currency and cadence, not treated as replacement catalog prices. A recovered review can import on that approval turn if its sources were already retrieved before the genuine approval message. Discovery by itself cannot approve commercial data.

A plain “yes” binds only to the currently presented, unambiguous pending selection. That state survives restarts and is consumed once. Duplicate tool execution within that same turn is idempotent; an unrelated later “yes” cannot authorize new imports. Free/zero-priced website tiers remain unapproved because the current import model does not support them. Eligibility must come from a persisted review, never a guess from fetched text.

Focused regression (real Studio signal handlers, scripted provider):

```bash
node --import tsx --test --test-name-pattern='live confirmation loop' tests/website-generalization.test.ts
```

The test name refers to the originating live trace, not live-provider execution. After restarting Studio, the shortest live check is discovery followed by: “Yes, approve Scale at $750/month and Optimize at $2,000/month as catalog entries. This is my final approval. Proceed without asking for further confirmation.” Use those figures only if the current saved review supports them. Expect immediate import of exactly the two plans, no copied question, and no Free/Enterprise import.

Selection evidence is resolved server-side when a captured message explicitly names an approved product and quantity, even if the sentence also mentions pricing. The saved span remains verbatim human evidence; prices still come exclusively from the approved catalog. Approval/comparison language cannot establish purchased quantities. Draft needs can reuse exact captured human excerpts without requiring a separate notes tool call. Identical successful operations in the same message are idempotent; later revisions remain validated.

After restarting Studio, complete discovery and approval, then request one approved plan at quantity 1 with the other plans as comparison alternatives. Expect PDF proposal, HTML proposal and HTML email links. The recorded selection regression can use real Chromium in ordinary Terminal:

```bash
PROPOSAL_TEST_REAL_PDF=1 node --import tsx --test --test-name-pattern='recorded selection' tests/website-generalization.test.ts
```

This exercises real Studio signal handlers with a scripted provider. It is not live-model acceptance; verify the same conversation manually in Studio with the configured model.


Bounded extraction marks capped responses/excerpts as partial; those candidates cannot authorize fixed-price import. Studio inline PNG/JPEG data is captured separately with a private byte reference and hash. Model observations remain unverified, never human quotations. Explicitly authorized hypothetical prices use the human evidence ledger and retain their hypothetical labels through generation/revisions. Starting prices are distinct from fixed offers; USD/EUR currency and confirmed units propagate through Elements. No currency conversion or implicit seat pricing is supported. See README for live diagnostics and the exact attachment/size limits.

Structured errors specify a recovery action and at most one retry. Successful read calls do not reset repeated-failure detection. Exact scalar/price evidence can be repaired from unique captured human values/clauses; ambiguous evidence, historical overwrites, and fabricated sources remain rejected. This is provenance checking, not semantic verification of arbitrary model-authored prose.
