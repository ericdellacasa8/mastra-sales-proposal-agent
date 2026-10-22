# Standalone repository and internal-review audit

Initial audit: 2026-10-22. Scope: current conversational V1, not the historical website-research agent. The original findings below are retained as the audit snapshot; the preparation update immediately below records their current disposition. No application behavior, dependencies, rendering, tests, fixtures or runtime state implementation was changed. No Git initialization, commit, remote, publication, PR or maintainer contact occurred.

## Preparation update — 2026-10-22

The authorized bounded documentation/metadata/hygiene pass is complete. **GO for local
colleague-review preparation; NO-GO for upload until sharing/asset decisions are cleared.**
The exact proposed set is [123 files](github-files.txt), explained in the
[upload manifest](github-file-manifest.md). That list includes approval-gated items;
it is not an instruction to upload them blindly. Fresh Node 24/Mac acceptance remains
pending; an explicitly experimental private review may carry that gap after owner approval.
No official-template readiness is claimed.

### Completed findings and exact changes

| File | Change / audit finding addressed |
| --- | --- |
| `README.md` | Accurate V1 scope/confirmation exceptions/revisions; links to shared Elements source; Node 24/offline-first setup; environment table; two demo prompts; commercial labels; precise storage/preview paths; supported limits and troubleshooting. Addresses I1, I4, I6, I7 and part of O1/O2. No screenshot was added. |
| `CONTRIBUTING.md` | Fixed architecture anchor; removed active website-contract instructions; clarified internal review first and current upstream issue/feedback policy. Addresses I1/I2. |
| `docs/local-development.md` | Current V1 test matrix, storage/recovery, built-server command and troubleshooting; legacy diagnostics clearly separated. Addresses I3/I4/O3 without changing scripts. |
| `docs/template-readiness.md` | Replaced stale publication/website acceptance guidance with the agreed four-phase plan and explicit human gates; pins remain intentional. Addresses I2. |
| `docs/v1-acceptance.md` | Distinguishes owner-reported earlier passes from pending fresh-install/latest patch acceptance; preserves manual flows and adds the latest fee retest and exact commands. Addresses I3 documentation, not outstanding live verification. |
| `docs/website-discovery.md`, `docs/release-candidate-validation.md` | Added prominent historical/non-V1 banners; preserved historical test details. Addresses I1/I3. |
| `package.json` | Description now states salesperson-provided inputs and all three outputs; no dependency, script or version changes. Addresses I1. |
| `.gitignore` | Explicit legacy runtime-data/build/temp/log/key/certificate/Windows-metadata boundaries added. Existing credential/database/private-history exclusions retained. No files deleted. Addresses B2 preparation. |
| `docs/github-file-manifest.md`, `docs/github-files.txt` | Added included/excluded/approval-gated manifest and exact sorted candidate list, including asset/dependency/font findings. Addresses B1/B2 preparation, not rights clearance. |
| `docs/repository-audit.md` | This disposition, verification record and remaining gates; initial findings retained below. |

### Verification performed in preparation

- `npm run typecheck`: passed.
- `npm run test:unit`: **148 passed, zero failed/skipped**.
- `node --import tsx --test tests/rendering.test.ts tests/artifacts.test.ts tests/dynamic.test.ts`:
  **29 passed, zero failed/skipped** (overlaps the full unit suite; not 29 additional cases).
- `npm run build`: passed, exit 0, in an isolated copy with installed dependencies;
  nonfatal telemetry DNS failures occurred. The live `.mastra` build was not overwritten.
- All five `--sample all --html-only` bundles plus the README's custom-fixture command
  with `--html-only`: passed in an isolated copy; actual Elements HTML/text/design JSON,
  no PDF. Original previews were not overwritten.
- `npm run preview -- --help` and `npm start -- --help`: passed; installed CLI confirms
  `--env` support. This is not a built-server startup test.
- Local Markdown file targets/anchors checked across README, CONTRIBUTING and docs: no missing targets.
  Manifest: 123 existing files, no symlinks. Ignore matcher excludes both canonical and
  legacy runtime data, `.env`, database sidecars, generated build/QA output and private
  planning; retains `.env.example`. This is **not** a Git index/check-ignore verification:
  the directory remains non-Git.
- Bounded candidate-text scan: no credential-shaped values or machine-specific home
  paths found. This is not a full secret/privacy/legal audit.
- Hash comparison: all **110 protected source/test/fixture/script/lock/license/TS-config/
  Node-config files unchanged**. No renderer, PDF design, pricing formula, state or
  conversation code was modified. The manifest/lock dependency declarations still agree.
- Fresh install, Node 24 runtime, new Chromium generation, visual PDF and live-model
  acceptance were **not completed in this preparation pass**. The original audit's
  registry/OpenAI DNS and Chromium IPC failures remain limitations, not new passes.

### Remaining blockers and approvals

B1 remains open: confirm private GitHub owner/name/invitees, authority to share the code,
local/embedded artwork and recorded fixture excerpts. Additional inspection found the
existing `LICENSE` tail contains Microsoft/Google portion-copyright notices whose origin
and applicability are not documented. The file was **preserved unchanged**; resolve the
attribution with the owner rather than inventing copyright or removing uncertain notices.
No bundled font binaries were found; system font stacks are used. Direct dependencies
are MIT/Apache-2.0 by installed metadata, but no full transitive/legal/vulnerability
clearance is asserted. See the manifest's detailed approval table.

B2 is ready for later staged verification: `.gitignore` and the allowlist are checked,
but no actual staged upload exists and none was authorized. No raw-folder upload.
B3 remains pending: perform the clean Node 24/Mac steps in
[V1 acceptance](v1-acceptance.md), including current fee revision, restart/isolation and
opening all three artifacts. Code quality is not being inferred from scripted tests alone.

Next: clear B1, complete or explicitly disclose B3, then separately authorize Git/private
repository creation and staged-file review. Incorporate colleague feedback before any
Mastra approach. No further feature or architecture work is recommended by this pass.

---

## Original audit snapshot (before preparation)

The following line references and proposed changes describe the original audited state;
use the disposition above and current linked guides for completed work and instructions.

## A. Readiness decision

**Original assessment: NO-GO for uploading the working directory as-is; GO for the bounded preparation pass now completed above.** The implementation is substantial enough for colleague review; no architectural rewrite or new functionality is indicated. Before the first private GitHub upload, confirm sharing/asset rights and repository ownership, inspect an explicit release file list, correct misleading V1 documentation, and record a clean Node 24 install/demo result. An internal review may explicitly carry pending live checks; it must not be presented as a fully accepted release or official Mastra template.

**Official template submission: NO-GO now**, independently of code quality: internal review/approval has not happened, clean-install/current live acceptance remains incomplete, and the current upstream contribution process requires maintainer feedback rather than unsolicited outside PRs.

Evidence levels used below:

- **Verified:** inspected current source/configuration or executed a check in this audit.
- **Reported:** the owner previously verified Studio generation, revisions and PDF design; this audit did not independently repeat that visual/model acceptance.
- **Pending:** a required environment, ownership decision, or current upstream file was unavailable. Pending is not evidence of a product defect.

There is **no `.git` directory**: `git status --short` returns `fatal: not a git repository`. Consequently there are no tracked/untracked distinctions, historical commits, remotes or previously committed secrets to audit. “Candidate release files” below means a local filesystem inventory filtered through the existing `.gitignore`, not a Git index.

## B. Findings, highest priority first

### BLOCKER — before the initial upload or an unqualified working-demo claim

| ID | Evidence / affected files | Minimum action |
| --- | --- | --- |
| B1 — Sharing and asset clearance is not established | `LICENSE` and `package.json:6` select Apache-2.0, but repository owner/visibility and redistribution rights for local assets are not recorded. `src/config/brand.ts:7` embeds `src/rendering/assets/leaf.png`; `desk.svg`, embedded PNGs in `fixtures/saas.json` and `fixtures/agency.json`, and recorded website excerpts/test conversations also need an owner review. The ignored `design/reference-proposal.png` is a supplied reference, not a release asset. | Confirm private GitHub owner/name, intended colleagues, and authority to share code/assets. Retain Apache-2.0; record asset origin/attribution or exclude an asset only after checking its uses. This is an unresolved permission/provenance gate, **not a finding of infringement**. |
| B2 — Uploading the raw directory would expose runtime/private material | `.env` exists with an API-key variable; local `data/` is about 28 MB and `src/mastra/public/` about 16 MB, containing persistent conversations/workspace/artifacts. `.mastra/` is about 32 MB and `node_modules/` about 375 MB. `.gitignore` excludes these, databases/sidecars, private planning files and the design reference. No Git index yet exists to prove the actual upload set. | Use an explicit reviewed source-file set, never a raw folder upload/ZIP. Validate the eventual staged list and secret scan after Git initialization is separately authorized. Do not force-add ignored files. No customer data needs deleting to prepare a clean source repository. |
| B3 — Fresh-clone/demo acceptance has a verification gap | Isolated `npm ci` failed with npm `Exit handler never called!`; its debug log shows registry fetches failing `ENOTFOUND`. Current checks used Node **25.8.0**, while `.nvmrc` selects **24**. Full tests have 12 Chromium startup failures in this sandbox. The latest Google/Chevron fix has scripted/service evidence, not a fresh real Studio retest. | Run the commands in section F on an ordinary Mac, Node 24, from a sanitized fresh copy. Record results and open the three outputs. This blocks claiming reproducible first-run success; it need not block an explicitly experimental private code review once B1/B2 are satisfied. Do not “fix” sandbox errors by changing PDF code or weakening tests. |

### IMPORTANT — focused corrections for a useful colleague handoff

| ID | Evidence / affected files | Minimum recommendation |
| --- | --- | --- |
| I1 — Metadata and contributor instructions describe the retired product | `package.json:47` advertises “verified catalogs”; V1 uses salesperson-provided pricing. `CONTRIBUTING.md:10` links to nonexistent `README.md#customization` (actual heading is `architecture-and-customization`) and sends readers to website-discovery contracts. `docs/local-development.md` promotes old website/Acme/FlowSync diagnostics and seller-profile reuse; these are not the registered V1 interface. `docs/template-readiness.md` gives obsolete website acceptance and publication steps. | Fix the anchor/description; make `test:v1`, `test:v1:live`, the fee regression and V1 acceptance the primary commands. Label historical documents/diagnostics explicitly as legacy. Preserve useful regression source rather than deleting it. |
| I2 — Upstream contribution instructions are stale | `CONTRIBUTING.md:41–46` and `docs/template-readiness.md` describe issue-linked external PR eligibility. The current root Mastra guide explicitly disables outside PRs and asks for detailed issues; features require a feature request and feedback. The templates directory README still contains older fork/PR mirror wording. | Prefer the current root policy, note the conflicting older template text, and defer all outreach until after colleague feedback and owner approval. Do not promise a PR path, catalog slug, changeset requirement or acceptance. See section D. |
| I3 — Acceptance status is scattered and mixes generations of the agent | `README.md:8`, `docs/v1-acceptance.md`, historical readiness reports and ignored `IMPLEMENTATION_STATUS.md` contain different ages of evidence. `scripts/validate-v1-live.ts:16` selects the historical coordinator (`true`, not `'v1'`) and tests URLs/screenshots; it is not the shipped V1 acceptance command. Much of the passing suite targets legacy agents. | Add a short dated V1 acceptance ledger to the existing V1 document: owner-reported Studio passes, latest patch pending, exact tested Node/model, and links/screenshots using safe fictional data. Mark the old script as legacy; do not rewrite it merely for this release. |
| I4 — README does not fully orient a new developer to storage/customization/recovery | The README correctly distinguishes native Memory and Workspace, but says artifacts are “beneath” storage without the full conversational path. It has no dedicated troubleshooting section/link, while `WorkspaceStore.update` tells users to see README for stale-lock recovery. It does not clearly say that a new customer/proposal should use a fresh thread. V1 input has names/offerings but **no conversational logo/color/contact customization** (`proposal-input.ts`); structured offline fixtures do support branding. | Document `PROPOSAL_DATA_DIR/previews/<thread-hash>/<proposal-id>/`, current-revision-only preview URLs, fresh thread for independent proposals, and link `docs/local-development.md`. Explain fixture `commercial.seller`, `commercial.catalog`, `discovery`, and `draft` fields; distinguish offline customization from conversational capabilities. |
| I5 — Single-owner/local-only security boundary must remain explicit | `src/mastra/index.ts:10` binds loopback. `src/assistant/previews.ts:15` validates paths/current artifacts and applies CSP/no-store, but has no user authentication. `data-directory.ts:21` may reuse private data under legacy `src/mastra/public/data/agent`. `store.ts:24` locks the entire workspace during rendering, caps JSON at 4 MB, and requires manual stale-lock recovery. | Keep private data out of static/public paths in the release copy, retain loopback-only operation, and document the single-writer limitation. Do not expose/tunnel this server for colleague access; each colleague should run their own local copy. Do not move the owner's live store during this audit. A public deployment is outside scope. |
| I6 — V1 extraction remains a model-quality boundary, not independent commercial verification | `sales-proposal.ts:16–18` instructs faithful extraction; `service.ts:121` merges it and `:167–170` constructs catalog/snapshot evidence from normalized input. Deterministic validation checks shape/calculation, not every extracted fact against user prose. Progressive review checks a commercial fingerprint; complete one-shot requests/post-generation revisions intentionally bypass the extra checkpoint (`:156–182`). | Describe these exact exceptions and require users to inspect commercial output. Do not market “verified pricing” or the legacy quotation tests as proof that V1 cannot misextract facts. Retain the frozen workflow; finish current live acceptance rather than expanding provenance machinery. |
| I7 — Small documented limits can surprise reviewers | `proposal-input.ts` supports 1–120 month fixed terms, up to 12 offerings, USD/EUR, monthly/once, and optional fields; `service.ts:151–152` still requires price/currency/cadence for excluded offerings and rejects mixed currency even among optional items. Offering updates merge by normalized name (`:121`): renaming is not a dedicated operation, and replacing seller/customer in the same thread does not clear old scope. | Document these limits and demonstrate only supported quantity/price/narrative revisions. Use a new thread for unrelated proposals. No catalog editing or rename feature is recommended in this audit. |

### OPTIONAL — helpful polish, not reasons to redesign

| ID | Evidence | Minimal recommendation |
| --- | --- | --- |
| O1 — No visual proof in the landing README | README explains the three outputs but has no embedded screenshot/video; there is no release-safe demo-media folder. Official examples have Demo sections and media. | Add one owner-approved fictional PDF/email screenshot or short recording after rights/privacy review. Do not publish existing private previews. |
| O2 — Source navigation is harder than the product scope | `service.ts` combines V1 and legacy operations; `legacy-proposal.ts`, `coordinator-regression.ts`, website modules and many tests remain. Dense one-line implementations increase review effort. | Add a small active-path module map and label legacy entry points. Keep tested code; no release-driven broad refactor, directory move or formatter sweep. |
| O3 — Test command distinctions could be clearer | `test:unit` explicitly lists files and is really a mixed unit/runtime suite; `npm test` runs all tests, including browser checks and additional legacy replays. `test:v1` does not include the new separate fee-revision file, though `test:unit` does. `test:v1:live` runs only selected cases with a provider; other cases remain scripted. | Document the matrix below and the explicit fee-test command. Consider a small CI job for typecheck/unit/build later; no CI or tooling framework is required for private review. |
| O4 — Manifest/style differences are not current breakages | No `repository`, `bugs`, `homepage`, `packageManager` or CI metadata exists yet. `private:true` is appropriate for preventing accidental npm publication. `desk.svg` has no source usage found. | Add real repository metadata only after owner/name are chosen. Consider documenting npm version and asset provenance; do not delete the SVG without approval. |

## C. Current implementation, claims and reliability

### Active path and responsibility split

1. `src/mastra/index.ts` registers **one** production agent and local preview routes.
2. `src/mastra/agents/sales-proposal.ts` creates native `Memory` with persistent LibSQL (`memory.db`), last 20 messages, no semantic/working/observational memory. Its input processor obtains genuine user-authored Studio signals and stable thread/resource IDs. It forces the one `submitCandidate` tool; website/catalog/legacy mutation tools are not registered.
3. `src/assistant/proposal-input.ts` is a strict top-level Zod object of ordinary proposal fields. The model extracts fields/drafts prose. The coordinator in `conversational-v1.ts` captures text and invokes `ProposalService.submitInput`.
4. `src/assistant/service.ts:97` merges pending fields, performs required-field/term checks, asks optional discovery, computes a review and decides whether to finalize. `workspace.v1Turns` persists incomplete input/checkpoints. `WorkspaceStore` owns lock/atomic rename; ownership is checked against thread/resource. Captured user text remains in `workspace.sources`. **Memory is chat history, not authoritative commercial state.**
5. `src/proposal/finalize.ts` calculates integer-cent line items/totals, checks safe-integer overflow and scope, distinguishes annualized recurring from explicit-term commitment, and rejects monetary narrative. `commercial.ts` validates currencies/branding/catalog; optional exclusions are mapped separately from purchased selections.
6. `service.ts:454` finalizes, renders, writes and verifies the bundle. Input hashes avoid unnecessary rerendering of complete matching bundles; PDF failure yields `html-only`, never `complete`. `services/artifacts.ts` stages bundle replacement and checksums; the workspace records its revision/completeness. `previews.ts` returns only current artifact paths, not arbitrary files. Previous revision links are not permanent public URLs.
7. The processor emits the application's outcome rather than allowing a final model response to invent artifact success. Missing extraction has a bounded retry; tool errors may still expose field-oriented language. This is inspected behavior, not a guarantee that every natural-language revision is understood.

The local Memory persistence/isolation tests use real SQLite and Mastra handlers. Some reopen services in the same process; `tests/trusted-evidence.test.ts:29` additionally recalls persisted history in a separate Node process, but exercises the legacy agent. Current V1 tests reopen the active agent/workspace and verify pending review continuity. A fresh live Studio restart/second-thread check is still useful and is listed below; this audit did not restart the owner's server.

### Elements claims: substantially accurate

- Installed and pinned `@unlayer/react-elements@0.1.22`; React/ReactDOM 19.2.8 satisfy its `>=18` peers. Installed package declares MIT; upstream Elements is public and describes multi-format component rendering. [Elements repository](https://github.com/unlayer/elements)
- `src/rendering/proposal.tsx` builds `Email` and `Document` trees using the **same** `createSections(seller)` factory in `sections.tsx`: `BrandHeader`, `CustomerSummary`, `RecommendationSection`, `PricingSection`, `DetailsSection`, `NextStepsSection`, `Footer`. Elements `Row`, `Column`, `Heading`, `Paragraph`, `Table`, `Image` primitives compose the sections.
- `render.tsx` calls `renderToHtml` for both trees, `renderToPlainText` and `renderToJson` for the email tree. PDF is Chromium printing the document HTML via `pdf.ts`/`layout.ts`; it is **not** a separate handwritten PDF template or a native Elements PDF-byte export.
- The email intentionally uses shorter sections and omits full implementation detail. Document CSS and print adaptation are output-specific. “Shared React components” is accurate; “identical complete content/layout in all three formats” would not be. Design JSON represents the email design; visual-editor round trips are not verified.
- `presentation.ts` makes a shared display copy for narrative/duplication/warning treatment. Calculations and persisted commercial input remain separate. Branding is structured for offline fixtures; conversational V1 uses default colors and seller/customer names.
- Verified: five offline email/document/plain-text/design-JSON bundles generated with no keys and no local runtime data. Email sizes 53,044–67,729 bytes, below the enforced 100,000-byte cap. Actual PDF generation/visual parity was blocked in this audit; prior owner visual acceptance remains reported evidence.

### Dependencies and runtime compatibility

`package.json` is ESM, Node >=22.13.0, `.nvmrc` is 24. TypeScript uses ES2022, bundler resolution, strict checks, no emit, JSX automatic runtime, and checks src/scripts/tests. Entry points and `createTool(inputSchema, execute(input,context))` follow current documented Mastra patterns. [Mastra getting started](https://mastra.ai/docs)

Installed direct versions: core **1.78.0**, memory **1.38.0**, libsql **1.26.2**, CLI **1.34.2**, Elements **0.1.22**, Playwright **1.59.1**, React/DOM **19.2.8**, Zod **4.6.7**, TypeScript **5.9.3**, tsx **4.23.12**. `npm ls --depth=0` exits 0. Installed peer ranges accept this core/Zod/React combination; differing Mastra package version numbers are not a demonstrated incompatibility. No upgrade is recommended merely to resemble upstream.

`package-lock.json` is lockfile v3, agrees with root dependency declarations and resolves packages through registry.npmjs.org; no local or credential-bearing dependency URLs were found. Direct dependency license metadata is MIT/Apache-2.0. Transitive lock metadata also includes BSD/ISC/BlueOak/CC-BY-4.0 (`caniuse-lite`) and others; a full redistribution/legal or vulnerability clearance is **not** claimed. No registry-backed vulnerability audit completed here.

## D. Current Mastra benchmarks: requirements versus examples

Sources retrieved 2026-10-22; moving branches/pages are not immutable specifications. Exact package/config files for the selected newer examples could not be retrieved (cache misses/one 404), so their Node floors, dependency versions, scripts and ignore rules are **unverified**. Do not infer parity from their catalog pages.

| Official source | Verified comparison / implication |
| --- | --- |
| [Template catalog](https://mastra.ai/templates) | Describes cloneable examples, Studio quickstarts and monorepo-to-standalone synchronization. Our independent project must not claim accepted catalog installation; the README correctly does not. |
| [Lead Qualification](https://mastra.ai/templates/lead-qualification) | Has purpose, motivation, Demo, prerequisites, key setup, concrete request/status result and customization. Local output is an option; Attio/research are its scope, not requirements for this proposal agent. Our equivalent should be the short fictional conversation plus three preview links. |
| [Vendor Risk Questionnaire](https://mastra.ai/templates/vendor-risk-questionnaire) | Documents evidence limits, human review, local sample setup and approved export. Its web interface/token/format handling solve a different problem. Borrow explicit limitations and review semantics, not its frontend/workflow architecture. |
| [Customer Support and Refund Agent](https://mastra.ai/templates/customer-support-and-refund-agent) | Explains local demo versus external providers and human review of consequential actions. Our clear “generate only, no email delivery” boundary is the appropriate equivalent; no CRM/payment integration is needed. |
| [Chat with PDF](https://mastra.ai/templates/chat-with-pdf) | Presents a focused document use case, prerequisites, quickstart and customization. It reads PDFs using RAG; it does not establish PDF-generation/page-layout requirements for this project. Our differentiator is shared Elements output. |
| [Templates directory guidance](https://github.com/mastra-ai/mastra/tree/main/templates) | Explicitly calls for package.json, .env.example, README, CONTRIBUTING, OpenAI by default, and `latest` Mastra dependency declarations; provides a README outline including Demo/Prerequisites. Local files/default provider largely align. **Pinned versions intentionally differ:** retain them for standalone reproducibility, discuss upstream adaptation only in phase 4. The generated-mirror CONTRIBUTING text is inappropriate here. |
| [Memory documentation](https://mastra.ai/docs/memory/overview) | Message history requires storage; Memory provides conversation context. Our persistent LibSQL/native Memory is real, and distinct from Workspace. Enabling extra memory modes is not necessary to align this V1. |
| [Current root CONTRIBUTING](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md) | Outside PRs are disabled; request new features via an issue and wait for feedback. This supersedes the older template README's fork/PR instructions for planning purposes. Exact submission access, catalog metadata, media/changeset requirements remain for maintainers to clarify **after internal approval**. |

No universal official requirement for a standalone frontend, workflows, a specific number of tests, CI, a demo video, or our three-output architecture was established. Those are example choices or recommended engineering practices, not reasons to expand V1.

## E. Repository hygiene and review experience

### Verified file/privacy checks

- Used the installed `ignore` matcher against `.gitignore`: **120 candidate files before adding this report**. `.env`, both canonical/legacy data paths, SQLite sidecars, node_modules, `.mastra`, design reference, AGENTS/private planning/status files were excluded; `.env.example` included. This is a simulation, not an audited staged list.
- A bounded credential-pattern scan of candidate text files found no API-token/private-key patterns. A separate source/docs/test scan found no `/Users/<name>` or `/home/<name>` machine paths. No secret values were printed. This does not prove absence of all secrets, proprietary material or personal data.
- Fixture emails inspected are demonstration/example addresses. Recorded regression fixtures contain real-company names/public website excerpts and hypothetical business conversations; retain explicit fixture labels and obtain owner clearance rather than presenting them as current pricing or real customer work. Runtime databases were not copied into the report/release set.
- Localhost in `previews.ts`, `.env.example`, README and tests is deliberate for this local template. `PROPOSAL_PREVIEW_ORIGIN` is configurable; changing port/origin requires matching it. Absolute runtime artifact paths are generated data, not hardcoded source paths.
- No release demo video/screenshots are currently included. `leaf.png` and `desk.svg` remain candidate source assets; embedded fixture images also require provenance review. No files were deleted.
- Relative Markdown file destinations checked exist. The CONTRIBUTING README heading anchor is demonstrably stale. External GitHub template-source retrieval was incomplete; not all external links can be certified live.
- `private:true` prevents npm publication, not GitHub visibility. A root Apache license does not itself establish ownership of every bundled asset. Preserve dependency licenses; whether additional notices are required remains part of the asset/dependency review.

### Colleague usability assessment

| Task | Assessment |
| --- | --- |
| Understand purpose in 60 seconds | **Pass**: opening paragraph, three outputs and Elements value are clear. A safe screenshot would improve it. |
| Clone/install/run | **Pending**: commands/environment/prerequisites exist, installed tree works, clean Node 24 installation not verified. |
| Complete sample conversation | **Reported pass / current patch pending**: clear one-shot SaaS example; scripted V1 tests pass, latest fee correction needs live confirmation. |
| Open three artifacts | **HTML verified; PDF pending locally**. Routes/checksums/complete-state behavior tested with PDF stubs; real browser blocked. |
| Understand Elements | **Pass with clarification**: shared section factory is genuine; add precise Document → Chromium explanation and email-design-JSON distinction. |
| Review code/propose changes | **Needs small documentation cleanup**: active V1 path is short but legacy modules/instructions can mislead. No redesign required. |

## F. Executed verification and reproducible commands

Environment: macOS sandbox, Node 25.8.0, npm 11.11.0. No provider credentials were printed; no real model acceptance is claimed.

| Executed check | Observed result |
| --- | --- |
| `npm ls --depth=0` | Passed; installed direct versions match pins. |
| `npm run typecheck` | Passed. |
| `npm run test:unit` | **148 passed, 0 failed, 0 skipped**; scripted providers and PDF stubs where specified. |
| `npm test` | **176 total: 164 passed, 12 failed, 0 skipped**. Failures are Chromium launch or resulting absent-complete-PDF assertions; startup reports `bootstrap_check_in … Permission denied (1100)`. Not a green browser suite. |
| `npm run build` | Passed, exit 0, in an isolated source/fixture copy using installed node_modules, preserving the owner's running build. Nonfatal telemetry DNS errors occurred; no .env was copied into that build. |
| `npm run preview -- --sample all --html-only` | Passed in isolated source/fixture/script copy; five bundles verified, real HTML/plain text/design JSON, no PDF. Existing previews were not overwritten. |
| Fresh isolated `npm ci` with empty cache | Failed before successful install: registry `ENOTFOUND`, followed by npm `Exit handler never called!`. No lockfile or existing dependencies changed. |
| OpenAI network probe | `curl: (6) Could not resolve host: api.openai.com`. Live model not exercised. |
| Fresh Studio listener / built-server runtime / visual PDF / email-client parity | Not independently verified in this audit. No running Studio process was stopped or replaced. |

The runtime tests use real in-process Hono/Mastra Studio subscribe/send-message handlers. They are not browser UI tests. `test:v1:live` uses real model calls for consulting/SaaS creation/revisions and partial-help extraction; remaining cases are scripted. Tests primarily use temporary stores; some intentionally write ignored `data/qa`. `verify:pdf` requires macOS PDFKit/clang and previously generated matching samples. Do not use it as a cross-platform or V1 conversation acceptance test.

### Ordinary Mac: clean-copy gate

Use a sanitized source copy, not the live project folder including data. With Node 24 selected:

```sh
node --version
npm --version
npm ci
npm run browser:install
npm run typecheck
npm run test:unit
npm test
npm run preview -- --sample all
npm run verify:pdf
npm run build
```

Install the provider key only for conversation checks. On the fresh copy:

```sh
test -f .env || cp .env.example .env
# Set OPENAI_API_KEY locally; do not paste it into logs or review material.
PROPOSAL_TEST_REAL_PDF=1 node --import tsx --test tests/v1-fee-revision.test.ts
npm run test:v1:live
npm run dev
```

If building again, stop Studio first. `npm start -- --env .env` is the documented built-server check; do not run it simultaneously on Studio's port. On Linux, Playwright OS-library installation is an additional platform prerequisite. Do not disable OS protections to make a test pass.

### Short colleague smoke test

1. Fresh thread: “Northstar Software proposes 100 Pro seats at €75 per seat per month for 12 months plus one Onboarding at €2,500 one-time for Meridian Logistics. Generate the proposal.” Expect €7,500 monthly, €90,000 annualized recurring, €92,500 committed for 12 months; open PDF, HTML proposal and HTML email.
2. “Change Pro to 150 seats and regenerate.” Expect €11,250 monthly and €137,500 committed. “Shorten the executive summary without changing commercial terms.” Reopen all three links; totals unchanged.
3. Fresh thread: “Cedar offers one Audit, a one-time service in EUR, to Fern. Help me put together a proposal.” Answer the missing price with “EUR 800.” Skip optional discovery, inspect review, stop/restart Studio, resume the thread and confirm. Expect €800 once and no repeated commercial questions.
4. Another fresh thread must not contain Cedar/Fern or Northstar customer context. Replay the latest Google/Chevron fee scenario from `tests/v1-fee-revision.test.ts` and confirm $120,100 committed/$10,100 first month without another term question.
5. Record browser/model/version/date and actual observations, including failures. Use only fictional data in any screenshot/recording shared for review.

## G. Minimal phased action plan

1. **Local preparation:** approve the small documentation corrections (I1–I4), record asset/sharing provenance and choose the private repository owner/name. Keep code, calculations and PDF design frozen. No cleanup deletions are necessary for this step.
2. **Verification:** run the clean Node 24/Mac commands and current Studio smoke test; record any remaining gaps honestly. Review the eventual explicit source manifest and scan it before sharing. A failed live check is a known review item, not a reason to silently expand scope.
3. **Private colleague repository, only after explicit authorization:** initialize/stage the reviewed source set, inspect staged diff and ignored-file status, then create/push the agreed private repository. Invite only the approved reviewers. Do not include runtime data/private planning. These actions were **not** performed by this audit.
4. **Internal feedback:** resolve only agreed findings, retain the acceptance record, and obtain approval of scope, assets, documentation and demonstration.
5. **Mastra consideration, only after approval:** recheck current contribution access; prepare a concise feature-request proposal linking the approved repository/demo. Wait for maintainer direction about integration and catalog requirements. Do not claim official-template status or advertise a catalog installation command before acceptance.


## Final licensing and asset provenance review

Reviewed 2026-10-22 against all 123 paths in `github-files.txt`. This is a factual
provenance review, not a declaration that all sharing rights have been cleared.
Only this audit and the manifest documentation changed. No LICENSE, source, test,
fixture, rendering, pricing or asset bytes were changed. No Git operations occurred.
This section supersedes earlier statements that the license text's origin was wholly
unknown; its applicability and actual project ownership remain unresolved.

### 1. Complete LICENSE inspection: cause of the Microsoft/Google text

`LICENSE` contains the Apache-2.0 terms, followed by an appendix whose usual generic
copyright placeholder has been filled with Microsoft and Google portion notices.
The entire file (11,601 bytes, including line endings) is **byte-for-byte identical**
to both `node_modules/playwright/LICENSE` and `node_modules/playwright-core/LICENSE`
from the installed 1.59.1 packages. All three SHA-256 values are:

```text
45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb
```

The same portion notices appear in the official
[Playwright v1.59.1 license](https://raw.githubusercontent.com/microsoft/playwright/v1.59.1/LICENSE).
This is strong evidence that a dependency license was used as the root Apache license;
there is no Git/copy history proving who copied it or which command was used. The
notices identify Playwright's portions, **not Microsoft/Google ownership of this proposal
agent**. The project's chosen license is Apache-2.0 (`package.json`, README and prior
project instructions), but the actual copyright owner has not been established here.

The [canonical Apache-2.0 text](https://www.apache.org/licenses/LICENSE-2.0.txt) distinguishes
license terms, applicable attribution retention (section 4) and trademark rights
(section 6). Using an npm dependency is not evidence that its authors own the whole
application. Conversely, a matching dependency notice cannot be assumed irrelevant if
source was copied. No copying/attribution inventory sufficient to decide that was found.

**Smallest recommended resolution:** confirm the project rights holder and whether any
Playwright/other third-party source was copied into the upload set. Then use canonical
Apache text for the project and retain applicable third-party attribution separately,
clearly associated with its source. Do not invent a copyright year/owner or delete the
existing notices before that determination. For this review, LICENSE was left unchanged;
only the earlier documentation's “unknown origin” claim was corrected. Installed dependency
license files are outside the upload manifest and remain intact.

### 2. All bundled visual/font/test assets

No PDF/video/font binaries or actual uploaded pricing screenshots occur in the 123-file
manifest. The following covers standalone files, embedded image payloads and inline SVG.
Manifest presence means proposed inclusion, not ownership approval.

| Asset / exact location | Verified content and origin evidence | License / disposition |
| --- | --- | --- |
| `src/rendering/assets/leaf.png` | 96×144 leaf mark, 4,386 bytes; visually inspected. Used by `src/config/brand.ts`. Internal implementation history records an original local substitute for the supplied reference. | No separate author/license record. Treat as claimed project-created artwork, subject to owner confirmation, not verified third-party-free art. |
| `src/rendering/assets/desk.svg` | 260×280 stylized desk/laptop/plant, 1,022 bytes; SVG inspected, no external links/scripts. Same internal original-substitute statement; no current source use found. | Same ownership gap. Preserve pending an explicit retention/removal decision. |
| `fixtures/saas.json`, `commercial.seller.logo.src` | 32×32 PNG diamond mark, 210 bytes, visually inspected; alt text identifies the fictional Lumenboard mark. SHA-256 prefix `0b370a0245650f13`. | Embedded local fixture artwork; creator/license not established. |
| `fixtures/agency.json`, `commercial.seller.logo.src` | 32×32 PNG tiled mark, 139 bytes, visually inspected; alt text identifies fictional Mossline. SHA-256 prefix `7e9c7cdae45e6ec3`. | Embedded local fixture artwork; creator/license not established. |
| `src/rendering/sections.tsx:18–23` | Four inline SVG icons: workspace/layers, team, onboarding/gear, reporting/bars. Internal history describes original line icons; no icon-library attribution found. | Project-authorship claim needs owner confirmation. Do not assign an external icon license by visual resemblance. |
| `tests/save-proposal.test.ts:10`, `tests/turn-coordinator.test.ts:43` | Identical 67-byte, 1×1 PNG payloads (hash prefix `2142f54f2bd88700`), used as attachment fixtures. They contain no legible screenshot/company content. | Synthetic transport-test payloads; original source not documented. Low-content test data, not a verified pricing image or brand asset. Include in owner's test-data confirmation. |
| `tests/trusted-evidence.test.ts:111`, `tests/website-generalization.test.ts:444` | Identical 68-byte, 1×1 PNG payloads (hash prefix `273349097030afc7`), also transport-test data. | Same test-data qualification. |
| `tests/dynamic.test.ts:143,203` | Base64 decodes to the five-byte string `<svg>`; deliberately invalid image payload. Remote example-domain image URLs are rejection-test strings, not downloaded assets. | Test syntax, not a copied illustration. No proprietary logo inferred. |
| System font selections in `src/rendering/sections.tsx:8–9` | Arial/Helvetica/sans-serif and Georgia/Times New Roman/serif. No TTF/OTF/WOFF/WOFF2 files in the proposed set. | Font names select installed fonts; no font binaries are being redistributed. |
| Brand wordmarks from fixtures/customer names | Rendered text, not official supplied logo image files. | Company/product names can still be trademarks; text is not evidence of endorsement or permission. |

Internal history is a development claim, not a signed ownership record. The supplied
`design/reference-proposal.png` remains excluded; its existence does not grant rights
to copy third-party artwork. No identifiable official OpenAI/Google/HubSpot/Unlayer logo
image was found among the inspected bundled images. This does not clear name/trademark
use or rule out visual similarity to other artwork.

### 3. Fixtures, real names, source excerpts and privacy

| Material | Exact files / classification | Sharing consideration |
| --- | --- | --- |
| Explicitly fictional offline businesses | `fixtures/consulting.json`, `fixtures/saas.json`, `fixtures/agency.json`; `src/proposal/samples.ts`, `src/config/brand.ts`, `src/proposal/catalog.ts` | Demo/Fictional seller/customer labels and demonstration terms; sample contacts use example domains. This is fictional framing, not a trademark search proving every invented name is unique. |
| Real names with illustrative commercial input | `fixtures/output-quality-saas.json` (OpenAI/HubSpot/ChatGPT), `tests/v1-fee-revision.test.ts` (Google/Chevron/Gemin), `tests/conversational-v1.test.ts`, `docs/v1-acceptance.md`, audit/history docs | Prices and requirements are test inputs, not independently verified official offers. The quality fixture already discloses demonstration/salesperson pricing. Retain that distinction; do not imply actual customer engagements or endorsement. |
| Recorded human/model conversations | `tests/fixtures/hubspot-human-messages.json`, `hubspot-failed-operations.json`, `coordinator-website-role-live.json`, `shared-cadence-live.json`, `studio-consulting-boundary-calls.json`, `studio-consulting-failed-call.json`; related replay tests | These are saved debugging inputs/outputs, not independently authored public datasets. HubSpot material includes self-described seller affiliation, screenshot-derived assertions and business context. Consulting records use hypothetical Northstar/Meridian examples. Owner must confirm they contain no confidential work/customer facts and may be shared with the invited colleagues. |
| Actual/minimized website-derived material | `tests/fixtures/websites/medallia-source-excerpts.json`, `latest-medallia-review.json`, `selection-failed-call.json` | Real Unlayer/Medallia text, plan names/features/prices and saved tool arguments. The source-excerpts fixture labels itself historical; other files retain source URLs. Public availability is not an open-source redistribution license. No applicable content license/permission was established in this review. |
| Synthetic website test fixtures using real names | `tests/fixtures/websites/seller.html`, `pricing.html`, `customer.html` | Compact Unlayer/Lovable test pages, not evidence of current live HTML or current pricing. Need owner confirmation of whether all copy is synthetic or adapted; do not classify them as verified scraped originals or fully cleared original writing. |
| Fictional generalization fixtures | `tests/fixtures/websites/general/*.html`, `tests/fixtures/release-candidate.ts`, helper scenarios | Synthetic test scenarios across industries; no current official pricing claim. Retain useful tests rather than delete them solely because they cover legacy functionality. |
| Framework/product references in documentation | README, CONTRIBUTING and `docs/` reference Mastra, Elements/Unlayer, OpenAI, GitHub and other tools | Descriptive technology references, not official-template membership, affiliation or endorsement. Existing README accurately states independent status. |

A manifest-wide email-string review found example.com/example.test/.example-style
addresses, not a known private customer email. No actual screenshot bytes, runtime
conversation database or generated private proposals are in the manifest. Those checks
cannot establish consent or disprove confidentiality in recorded prose. Keep `.env`,
`data/`, legacy public runtime data, private planning and design references excluded.

### 4. Dependencies versus project assets

`@unlayer/react-elements@0.1.22` is an installed MIT dependency; its license identifies
Unlayer, Inc. That license applies to the package, not automatically to this project's
leaf/logo/fixture artwork. Playwright and Mastra package metadata identify Apache-2.0;
React/DOM/Zod identify MIT. Pinned package references/lock metadata are included, but
`node_modules`, bundled output and browser binaries are excluded from this source upload.
No third-party package license files were removed. Transitive metadata includes other
licenses, including CC-BY-4.0 for `caniuse-lite`; redistributing dependency code/binaries
would require a separate applicable-notice review. This source-only review is not a
blanket transitive-license certification.

### 5. Minimal changes and human approval checklist

Completed: corrected the manifest's license-origin description; recorded the expanded
inventory and the historical original-artwork claim here. No license replacement,
notice deletion, fixture sanitization or artwork changes were made because the necessary
ownership/permission evidence is not yet established. No new files were added; the
proposed upload set remains 123 paths.

Before private sharing, obtain these four confirmations:

- [ ] **Project/license:** identify the rights holder and authority to share this code;
  confirm whether any dependency source was copied. Resolve the Playwright-derived root
  attribution by preserving applicable notices, not guessing ownership (`LICENSE`).
- [ ] **Local artwork:** confirm creator/rights for leaf, desk, the two embedded marks and
  inline icons; confirm tiny test-image provenance as part of the test-data review.
- [ ] **Recorded/third-party material:** approve the named saved-conversation fixtures and
  website excerpts for private colleague access, or agree a minimal sanitization/substitute
  plan with preserved regression behavior. This task did not authorize changing tests.
- [ ] **Recipients and boundaries:** confirm the private GitHub owner/reviewers and the
  manifest-only upload, with no runtime/private history or excluded reference image.

**Recommendation: NO-GO for private internal upload until these confirmations are
recorded.** This is a specific provenance/authorization hold, not a finding of infringement
or a request for application redesign. Once resolved, no licensing evidence found here
requires changing the working V1, commercial logic or PDF design. Fresh-install/live
acceptance remains a separate engineering gate described earlier in this audit.

## Dependency-security review — 22 October 2026

**Decision: retain the existing dependency versions.** No application, package manifest,
lockfile, override or rendering changes were made. Only this report changed. A safe
compatible remediation could not be established; an audit's “fix available” is not
evidence that its proposed replacement preserves the installed Mastra API.

### Installed and locked dependency paths

`npm ls` and `package-lock.json` agree on both paths:

| Path | Classification and practical exposure |
| --- | --- |
| `@mastra/core@1.78.0 → gray-matter@4.0.3 → js-yaml@3.15.2 → argparse@1.0.10 → sprintf-js@1.0.3` | Present in production installs; also shared by deployer. Actual affected formatting is in argparse's CLI help formatter, not the YAML library parsing path. |
| `mastra@1.34.2 → @mastra/deployer@1.78.0 → find-workspaces@0.3.1 → fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3` | Dev/build dependency tree; Mastra CLI also launches development/start servers. Workspace patterns come from local project configuration, not conversational fields. Omitted by `npm ci --omit=dev`, although the documented CLI commands themselves require dev dependencies. |

Evidence: `node_modules/js-yaml/index.js` loads `lib/js-yaml.js`; argparse is imported by
`bin/js-yaml.js`, not the parser. `node_modules/argparse/lib/help/formatter.js:325,559,744`
calls sprintf for usage/help strings. Core's `agent-skills-resolver-*.js` and
`workspace-skills-*.js` use gray-matter for skills; the V1 agent does not configure those
skills or expose a YAML/CLI formatting tool. `find-workspaces/dist/index.js:41` passes
`root.globs` to fast-glob; lines 88–110 obtain patterns from local pnpm/package workspace
configuration. Deployer's `analyze-*.js` imports this scanner. No direct use of these
formatting/glob packages was found in `src/`. The registered V1 tool in
`src/mastra/agents/sales-proposal.ts` is `submitCandidate`.

**Reachability assessment:** no demonstrated path from user-controlled proposal inputs
to either vulnerable format strings or brace patterns. This is a source-based assessment,
not proof of universal non-exploitability. Malicious local workspace configuration or a
future untrusted CLI/skills integration changes the assessment. Do not build untrusted
repositories/configurations as part of proposal processing.

### Advisory status and smallest safe follow-up

- [sprintf-js GHSA-hp3w-g68c-fv3c / CVE-2026-97058](https://github.com/advisories/GHSA-hp3w-g68c-fv3c):
  moderate; versions through 1.1.3 affected, no patched version listed. Attacker-controlled
  precision in a format string can cause an uncaught RangeError. `argparse` requests
  `~1.0.2`; upgrading within that range does not establish a fix. Do not force a core
  upgrade/downgrade or replace argparse with an incompatible major.
- [braces GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
  high; versions through 3.0.3 affected, no patched version listed. Deeply nested patterns
  can exhaust recursive AST walkers. This matches the installed vulnerable version.
  The older [CVE-2024-4068](https://github.com/advisories/GHSA-grv7-fg5c-xmjg) **is already
  patched by installed 3.0.3**; that older fix does not resolve the 2026 advisory.
- Confirm the actual npm advisory IDs and proposed chain replacement on an unrestricted
  Mac. The exact user-reported npm fix target could not be retrieved here. If a patched
  braces release satisfies `micromatch`'s `^3.0.3`, a reviewed lockfile-only update is the
  preferred next action. Otherwise wait for a compatible upstream dependency-chain fix
  and test it; do not apply `npm audit fix --force` or an unverified override.

### Verification and audit counts

Used Node **24.22.1**, npm **11.19.1**, by placing
`/opt/homebrew/opt/node@24/bin` first in PATH. Default Node 25.8.0 currently fails to launch
because its Homebrew simdjson library is missing; no system installation was changed.

- `npm run typecheck`: passed.
- `npm run test:unit`: **148/148 passed**, no skipped tests; scripted/offline coverage,
  not live-model or real-PDF acceptance.
- `npm test`: **176 total, 164 passed, 12 failed, 0 skipped**. Browser/PDF failures show
  Chromium `bootstrap_check_in … Permission denied (1100)` or the resulting unavailable
  PDF outcome. No real Chromium success is claimed. The owner's separate 176/176 Node 24
  Terminal run remains owner-reported evidence, not this run's result.
- `npm run build`: passed in an isolated source copy using the installed dependencies,
  preserving the working Studio build. PostHog telemetry DNS errors did not fail the build.
- `npm ci`: attempted in a temporary manifest/lockfile-only directory with an empty cache;
  failed `ENOTFOUND registry.npmjs.org` fetching `zwitch`. The working node_modules was
  not removed. Fresh installation remains unverified.
- Full and `--omit=dev` npm audits, before/after: registry advisory endpoint failed
  `ENOTFOUND registry.npmjs.org`. **No trustworthy npm aggregate counts available.**
  User-reported baseline is two root advisories (one moderate, one high), not necessarily
  npm's transitive vulnerability count. Both affected package versions remain unchanged;
  no reduction or clean audit is claimed. Source inspection predicts sprintf remains in
  the production graph and braces only in the full graph; registry results must confirm.

Local logs: `/tmp/security-typecheck.log`, `/tmp/security-tests.log`,
`/tmp/security-unit.log`, `/tmp/security-build.log`, `/tmp/security-ci.log`,
`/tmp/proposal-dependency-tree.txt`, and `/tmp/proposal-audit-{before,after}.json` plus
`/tmp/proposal-audit-prod-{before,after}.json`. These are diagnostic files outside the
upload manifest, not release files.

Run in ordinary Mac Terminal from the repository, with Node 24 active:

```sh
node --version
npm ci
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npm audit
```

**Private review recommendation:** conditional security GO only with explicit acceptance
of these documented residual advisories and a registry-connected audit review. Overall
upload remains **NO-GO pending the previously documented ownership/asset/fixture sharing
approvals** and this remaining audit check. There is no evidence here requiring changes
to the frozen proposal behavior or PDF design. No Git operations or publication occurred.


## Final private-review allowlist cleanup — 22 October 2026

This supersedes earlier 123-file proposed-retention statements, not the historical
verification results. `docs/github-files.txt` now proposes **121 files**. Excluded only
from upload (not deleted): `src/rendering/assets/desk.svg` (unused, uncleared artwork)
and `docs/release-candidate-validation.md` (unnecessary historical evaluation report).
No source/test/package references require either; historical audit mentions remain
local-evidence references. Required fixtures and used artwork stay in the allowlist
conditionally, to avoid breaking the frozen demo or regression suite.

Changed only `docs/github-files.txt`, `docs/github-file-manifest.md`, and this report.
The manifest document now provides KEEP/REMOVE/conditional REPLACE decisions for
questionable assets, recorded fixtures, website excerpts, real-name examples and legacy
material, and a five-part human approval checklist. Fixture replacements are recommendations
requiring separate authorization and test planning; none were performed. LICENSE remains
unchanged and its full hash still matches both installed Playwright licenses. No project
license or rights holder was selected, and no required third-party notice was removed.

Checked every candidate path for existence, uniqueness, symlinks and source/test/fixture/
script coverage. Scanned included files for common API/cloud/private-key credentials and
credential-bearing URLs, and reviewed email occurrences. No apparent secret was found;
four URL matches are intentionally dummy rejection-test inputs. `.env.example` is empty
of credentials; real `.env`, runtime data, generated outputs and dependency/build folders
are excluded. A pattern scan cannot clear recorded prose for confidentiality or sharing.
No application tests were rerun for this documentation/allowlist-only pass; the prior
owner-reported Node 24 176/176/build pass and local sandbox restrictions remain distinct.

**NO-GO for upload pending human decisions**, not a claim of application failure:
rights holder/license/notices, used artwork/test-image provenance, recorded and third-party
fixture/prose sharing, explicit acceptance of the two inherited dependency advisories,
and named private GitHub owner/reviewers. No upgrade, application change, Git operation,
repository creation or publication occurred. Follow the current manifest checklist.


## Owner-authorized initial-commit preparation

This entry supersedes earlier pending ownership/artwork/license and risk-acceptance
statements. Eric Della Casa stated that he developed and owns the project, authorized
MIT with copyright 2026 Eric Della Casa, confirmed permission for existing Unlayer
artwork, and accepted the two documented dependency risks only for restricted private
development review. No public or production approval is implied.

Changes:
- Root LICENSE is standard MIT. Complete prior Playwright Apache text is preserved and
  explicitly attributed in THIRD_PARTY_NOTICES.md. Source scans found no additional
  declared copied-code notices in src/, scripts/ or tests/; this is not forensic proof
  of every line's origin. No dependency license was removed.
- package.json and lockfile root project license metadata now say MIT. No dependency
  versions, URLs, integrity values or application code changed.
- Recorded fixture identities, source prose and long model company summaries were
  replaced with synthetic material. Tests use reserved example domains and corresponding
  fictional names, retaining prices, quantity cases, malformed schemas, authorization
  checks and assertions. Historical fixture filenames are retained for import stability;
  these are now synthetic regressions, not exact original live-model traces. The
  manifest lists all affected fixture groups. Real-company quality-sample names were
  also replaced; financial inputs and rendering code remain unchanged.
- Four attachment-test PNG payloads were replaced by an independently constructed
  one-pixel RGB PNG using PNG chunks/zlib. Used branding assets were retained under the
  owner's permission; excluded reference/desk artwork and videos remain local.
- README, CONTRIBUTING, template-readiness and manifest documentation now reflect MIT,
  the owner's decisions and synthetic-fixture status. README contains no em dashes.
- Allowlist is 122 files, adding only THIRD_PARTY_NOTICES.md. Every path exists and is
  a regular non-symlink file. No essential source/test/script/fixture was omitted. Nine
  private/runtime ignore probes pass and no allowlisted path is ignored. Common API,
  cloud, private-key and GitHub-token scans found no apparent secrets. Pattern scans
  cannot prove absence of arbitrary confidential prose; original raw histories remain
  excluded. Git author name/email are configured locally. Index remains empty.

Verification on Node 24: typecheck passed; unit/runtime tests 148/148 passed. Full suite
176 tests: 164 passed, 12 browser/PDF-dependent failures from sandbox Chromium
`bootstrap_check_in ... Permission denied (1100)`. Build passed in an isolated source
copy with installed dependencies, preserving the live Studio build. No model-backed or
real Chromium success is claimed here. Logs: /tmp/initial-typecheck.log,
/tmp/initial-unit.log, /tmp/initial-full.log, /tmp/initial-build.log.

**Commit held for verification, not missing owner approvals.** Prior owner-reported
176/176 results preceded these fixture edits. Run on ordinary Mac Terminal, Node 24:

```sh
npm run typecheck
npm test
npm run build
```

After those pass, inspect/stage exactly docs/github-files.txt and create the authorized
initial commit. No git add/commit, remote configuration, push, repository creation or
video upload was performed. The residual sprintf-js/braces advisories remain unchanged,
with the owner's restricted-review acceptance recorded above.
