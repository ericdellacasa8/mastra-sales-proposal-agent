# Sales Proposal Agent

Create a PDF proposal, HTML proposal and HTML email from a sales conversation in
Mastra Studio. Supply the commercial details, review the calculated totals and
confirm generation. Continue in the same thread to revise the proposal.

## Demo

https://github.com/user-attachments/assets/08e0e19a-3974-4888-99b7-db18ef4fc76e

## Why Mastra and Elements

Mastra provides the agent, Studio and persistent conversation history. The model
extracts proposal fields and drafts narrative. Application code handles validation,
review, state, pricing and artifact generation.

[Unlayer Elements](https://github.com/unlayer/elements) provides the React components
and HTML, plain-text and design-JSON exports. The [shared sections](src/rendering/sections.tsx)
build branding, recommendations, pricing and next steps for both outputs. The
[proposal tree](src/rendering/proposal.tsx) uses an Elements `Email` shell for the
shorter email and a `Document` shell for the full proposal.
[Chromium](src/rendering/pdf.ts) prints the document HTML to PDF. A change to a shared
section carries through to both layouts without maintaining separate HTML templates.

## Prerequisites

- Node 24 and npm. [.nvmrc](.nvmrc) selects 24; run `nvm install` and `nvm use` if you use nvm.
- Network access for package installation and the Playwright Chromium download.
- An OpenAI API key for conversations. Offline previews need no model credentials.

The package minimum is Node 22.13.0, but Node 24 is the verified review environment.
Linux may need additional [Playwright system dependencies](https://playwright.dev/docs/browsers#install-system-dependencies).

## Quickstart

From the project root, generate an offline sample first:

```sh
npm ci
npm run browser:install
npm run preview -- --sample consulting
```

Open these files:

```text
data/previews/consulting/proposal.pdf
data/previews/consulting/proposal.html
data/previews/consulting/email.html
```

Other sample names are `saas`, `agency`, `software` and `healthcare`; use `all` to
render every sample. Running a preview replaces that sample's disposable bundle.

For Studio:

```sh
test -f .env || cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env`, then run:

```sh
npm run dev
```

Open [localhost:4111](http://localhost:4111) and select **Sales Proposal Agent**.
Use a fresh thread for each independent proposal. The model provider receives
conversation content; do not enter information you are not authorized to share.

## Studio workflow

Provide seller and customer names, offerings, quantities, unit prices, currency and
billing cadence. Descriptions and contact details are optional. For recurring charges,
specify a contract duration or say there is no fixed commitment.

The agent retains incomplete inputs across turns and restarts. During progressive
collection, it asks one optional customer-goal question, then presents a commercial
review. Skip the goal question if needed. Reply `confirm` or `generate`, or correct
the details. Commercial corrections update the review before initial generation.

A complete request that explicitly asks for immediate generation skips the extra
confirmation. Post-generation revisions also regenerate directly. Quantity or price
changes recalculate totals; narrative changes preserve commercial terms. Successful
finalization returns links to all three artifacts. A PDF failure leaves the bundle
incomplete, not ready to send.

### Example: subscription and onboarding

Paste into a fresh thread:

> Northstar Software proposes 100 Pro seats at €75 per seat per month for 12 months,
> plus one Onboarding at €2,500 one-time, for Meridian Logistics. Generate the proposal.

Expected: **€7,500 monthly**, **€90,000 annualized recurring run-rate** and
**€92,500 committed over 12 months**, including onboarding.

Then try:

> Change Pro to 150 seats and regenerate.

Expected: **€11,250 monthly** and **€137,500 committed over 12 months**.

> Shorten the executive summary without changing commercial terms.

Open the three updated links and check that the amounts are unchanged.

### Example: consulting with optional support

Use a new thread:

> Northstar Advisory proposes one Discovery workshop at €3,000 and one Implementation
> project at €12,000, both one-time, for Meridian Logistics. Implementation takes eight
> weeks across three milestones. Include optional Support at €1,500/month, excluded
> from the committed total. Generate the proposal.

Expected: **€15,000 committed one-time**, with support excluded. All sample prices
and company scenarios are illustrative, not official offers.

## Configuration

See [.env.example](.env.example). Keep the real `.env` out of Git.

| Variable | Use |
| --- | --- |
| `OPENAI_API_KEY` | Credentials for the default conversational model. |
| `MODEL` | Defaults to `openai/gpt-5-mini`. Alternative models need their own credentials and acceptance testing. |
| `PROPOSAL_DATA_DIR` | Optional absolute private storage directory. A fresh copy defaults to `data/agent`. |
| `CHROMIUM_EXECUTABLE_PATH` | Optional Chromium executable path instead of Playwright's downloaded browser. |
| `PROPOSAL_PREVIEW_ORIGIN` | Link origin, default `http://localhost:4111`; match the server port. |
| `MASTRA_TELEMETRY_DISABLED` | Set to `true` in the example to disable Mastra CLI/Studio analytics. |

Native Mastra Memory stores conversation history in `memory.db`. The separate
`workspace.json` holds authoritative proposal state. Both live in the data directory.
Older installations may reuse a legacy directory; read
[storage and recovery](docs/local-development.md#storage-and-privacy) before moving data.

## Generated artifacts

Conversation bundles are stored under:

```text
<PROPOSAL_DATA_DIR>/previews/<thread-hash>/<proposal-id>/
  proposal.pdf
  proposal.html
  email.html
  proposal.json
  design.json
  email.txt
  manifest.json
```

`design.json` is exported from the Elements email tree. Studio links serve the current
revision, not a permanent revision archive. Offline samples use
`data/previews/<sample-or-name>/` instead. Keep generated files and conversation data
private and out of Git.

## Code and customization

| Start here | Responsibility |
| --- | --- |
| [Agent](src/mastra/agents/sales-proposal.ts) and [entry point](src/mastra/index.ts) | Studio integration, Memory and the `submitCandidate` tool. |
| [ProposalInput](src/assistant/proposal-input.ts) and [coordinator](src/assistant/conversational-v1.ts) | Extraction contract and conversational progression. |
| [Service](src/assistant/service.ts) and [store](src/assistant/store.ts) | Updates, review, persistence and finalization. |
| [Commercial schema](src/proposal/commercial.ts) and [finalizer](src/proposal/finalize.ts) | Validated commercial inputs and deterministic calculations. |
| [Elements sections](src/rendering/sections.tsx) and [renderer](src/rendering/render.tsx) | Shared content, layout and exports. |
| [Artifacts](src/services/artifacts.ts) and [preview routes](src/assistant/previews.ts) | Bundle storage and preview serving. |

For offline customization, copy [consulting.json](fixtures/consulting.json) to a private
local file. Its [schema](src/proposal/fixtures.ts) groups branding and prices under
`commercial`, customer notes under `discovery`, and narrative/selections under `draft`.
For example:

```sh
mkdir -p data
cp fixtures/consulting.json data/my-proposal.json
# Edit data/my-proposal.json, then render it.
npm run preview -- --input data/my-proposal.json --name my-preview
```

Branding fields belong to structured fixtures; conversational V1 does not collect
logos, colors or contact configuration. Legacy research modules remain for regression
coverage but are not registered in the V1 agent.

## Testing

```sh
npm run typecheck
npm run test:unit
npm test
npm run build
```

Stop Studio before building. `test:unit` uses scripted providers and PDF stubs where
specified, with real HTML rendering. `npm test` includes real Chromium checks.
To exercise selected V1 cases with a real provider and PDF rendering:

```sh
npm run test:v1:live
```

That command needs `.env`, provider access and Chromium. It uses Studio signal handlers,
not browser UI automation, and some tests in the file remain scripted. See the
[test matrix](docs/local-development.md#verification-matrix) and
[manual Studio acceptance](docs/v1-acceptance.md).

The test suite includes 176 tests covering conversational workflows, pricing, artifact generation and Chromium-based rendering. Node 24 is the verified development environment.

## Troubleshooting

- **Chromium will not start:** run `npm run browser:install`. For sandbox IPC errors,
  retry in ordinary Terminal. Do not disable OS security protections.
- **Need HTML without Chromium:** run `npm run preview -- --sample consulting --html-only`.
  This replaces the sample bundle without a PDF; it is not complete PDF verification.
- **PDF rendering failed in Studio:** resolve the reported browser error, then ask to regenerate.
- **Old preview returns 404:** use the latest revision's links.
- **Storage or lock error:** follow [local recovery](docs/local-development.md#storage-and-privacy).
  Do not delete databases or merge histories to bypass an error.

## Limitations and review status

- Supports one-time fees, monthly subscriptions and mixed charges in USD or EUR, with
  one currency per proposal. No conversions, discounts or inferred contractual terms.
- Up to 12 offerings; fixed terms of 1 to 120 months. Optional items stay outside
  committed totals but still require price, currency and billing cadence.
- Annualized run-rate is the monthly recurring amount multiplied by 12, excluding one-time
  fees. It is not a commitment. Contract totals require an explicit fixed duration.
- Prices are salesperson-provided, not verified public pricing. Inspect generated
  documents for extraction mistakes even when the arithmetic is correct.
- No website research, screenshot extraction, CRM integration, contracts, invoices,
  visual editor integration or outbound email delivery.
- This is a single-owner local application. Thread isolation is not multi-tenant
  authentication. Do not expose or tunnel the server as a shared service.

For development guidelines, see CONTRIBUTING.md. This project is available under the MIT license, with third-party notices documented in THIRD_PARTY_NOTICES.md.
