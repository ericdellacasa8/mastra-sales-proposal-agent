# Local development and recovery

## Prerequisites

Use Node 24 (`nvm use` if nvm is installed) and npm. `npm ci` uses the supplied
`package-lock.json`; retain it and the pinned dependencies. The manifest's minimum is
22.13.0, but a clean Node 24 installation is the review target. Sandbox checks were
run on Node 25.8.0/npm 11.11.0; that does not establish fresh-install success on Node 24.

`npm run browser:install` downloads Playwright Chromium. On Linux, install the
platform's Playwright system-library prerequisites if missing. In restricted macOS
environments, retry browser checks in ordinary Terminal; do not disable OS protections.
Offline previews require no AI key. `--html-only` is an explicit incomplete fallback
and replaces the named disposable preview bundle, including removal of any old PDF.

For Studio, copy `.env.example` only if `.env` does not exist, set `OPENAI_API_KEY`, and
run `npm run dev`. Open http://localhost:4111. Start a fresh thread for an independent
proposal/customer. Keep the same thread for clarification and revision. The README
[configuration table](../README.md#configuration) lists all V1 environment variables.

Stop Studio before `npm run build`; it writes `.mastra/output`. The built server can
be checked with `npm start -- --env .env`. Do not run both servers on the same port.
Keep the project root, fixtures and configured data directory available. This is a
single-owner loopback development app, not a hosted multi-user deployment.

## Storage and privacy

A fresh copy defaults to `data/agent/`. An explicit `PROPOSAL_DATA_DIR` must be an
absolute, private path. Native Memory uses `memory.db` (plus SQLite sidecars); the
Workspace uses `workspace.json` for authoritative structured inputs and pending review.
Bundles live under `previews/<thread-hash>/<proposal-id>/` within that directory.
Only current-revision artifact links are served. CLI samples instead use
`data/previews/<sample-or-name>/` from the command's working directory.

Existing installations may reuse `src/mastra/public/data/agent/` rather than silently
abandoning their data. This is a compatibility path, not recommended public storage.
If both legacy and canonical workspace files exist, select the intended existing
absolute path explicitly. Do not serve or upload either directory. All colleagues
should start with their own empty local store; do not distribute the owner's history.

Before any migration, stop every writer and back up the entire directory, including
SQLite journals and artifacts. Stored artifact references contain absolute paths;
copying files and changing the environment variable is not a verified migration.
Keep originals until history, isolation and regenerated preview links are checked.
No migration is performed by the repository preparation pass.

Writes use a directory lock, `workspace.lock`, and an atomic JSON rename. A crash can
leave a stale lock. Verify no writer is active, back up the store, then remove only
that stale lock directory if necessary. Never delete the database or workspace to
work around an agent error. Rendering holds the workspace lock; avoid simultaneous
writes from multiple sessions. The JSON workspace has a 4 MB limit; archive old local
data carefully rather than publishing or manually merging it.

Thread/resource checks isolate state, but preview URLs are not tenant authentication.
Do not expose or tunnel the server. The model provider receives conversation content;
its processing/retention is outside this template. V1 does not expose seller-profile
reuse, website discovery or screenshot extraction, even though legacy code remains.

## Verification matrix

| Command | What it establishes | Requirements / limits |
| --- | --- | --- |
| `npm run typecheck` | TypeScript source, scripts and tests compile | Installed dependencies; no model key. |
| `npm run test:v1` | Current V1 Studio signal handlers, collection/revisions/review | Default scripted provider; PDF stubs; real HTML. |
| `npm run test:unit` | Unit/runtime tests including V1 and fee regression; legacy regressions retained | No AI key; scripted providers and explicit PDF stubs where used. |
| `node --import tsx --test tests/v1-fee-revision.test.ts` | Latest fee/term/confirmation service replay and conflict guards | Default PDF stub; real HTML. |
| `PROPOSAL_TEST_REAL_PDF=1 node --import tsx --test tests/v1-fee-revision.test.ts` | Same deterministic replay with actual Chromium PDF | Chromium; not live model extraction or visual inspection. |
| `npm test` | All test files, including actual browser/PDF checks | Working Chromium; no model key by default. |
| `npm run test:browser` | Browser/PDF-focused subset | Chromium; not all tests in `npm test`. |
| `npm run preview -- --sample all` | Real offline PDF/HTML/email/design-JSON sample bundles | Chromium; no AI key. |
| `npm run verify:pdf` | Text/page checks on previously generated offline fixture PDFs | macOS PDFKit and clang; not cross-platform or conversational acceptance. |
| `npm run build` | Mastra production build | Stop Studio first; not proof of built-server runtime. |
| `npm run test:v1:live` | Real provider on selected current V1 cases, with real PDF | `.env`, provider access, Chromium. Other cases in that file remain scripted. |

The live diagnostic uses real Mastra/Hono Studio subscription and send-message handlers,
not the Studio browser UI. Initial consulting/SaaS output copies are saved under ignored
`data/qa/v1-conversational/`. Inspect actual documents and complete the
[manual acceptance](v1-acceptance.md), including restart, isolation and the fee regression.
Never present stub PDF bytes or an HTML-only bundle as a rendered proposal.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Chromium missing/cannot start | Run `npm run browser:install`; check OS libraries or `CHROMIUM_EXECUTABLE_PATH`. If sandbox IPC is denied, retry in ordinary Terminal. |
| HTML exists but PDF failed | The bundle is incomplete. Fix the browser and ask to regenerate in the same thread. Do not repeat commercial facts. |
| Workspace busy | Wait for the writer/render to finish. For a verified stale lock, use the backup/recovery procedure above. |
| Multiple workspaces or relative path rejected | Select the intended existing store with an absolute `PROPOSAL_DATA_DIR`; do not merge/delete histories. |
| Missing key, DNS/network failure | Check local `.env` and provider connectivity. Offline previews still work after dependencies/browser are installed. Never paste a key into a bug report. |
| Old preview URL returns 404 | Use the current revision's three links. Old links are not permanent archive URLs. |
| Extraction fails or asks redundant questions | Record sanitized tool error and expected behavior; do not claim success or repeatedly confirm blindly. Use a confirmed structured offline fixture as a labeled fallback. |

## Historical diagnostics — not V1 acceptance

`test:acme`, `test:flowsync`, `test:website:live`, `test:agent:live`, and
`test:coordinator` remain for earlier implementations. The unregistered
`scripts/validate-v1-live.ts` also targets the historical coordinator despite its name.
Do not use these to demonstrate current product features or establish V1 live acceptance.
Their fixtures/tests have been preserved, not removed. Historical website contracts
are in [website-discovery.md](website-discovery.md), clearly marked as legacy.

Diagnostic files under `data/qa/` are local and ignored. Review them for private data
before sharing; even a fictional test can include source excerpts or provenance fields.
Email-client compatibility and visual-editor design-JSON round trips remain manual checks.
