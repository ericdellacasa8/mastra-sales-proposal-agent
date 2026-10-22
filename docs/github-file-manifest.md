# Private GitHub source manifest

The exact proposed source set is [github-files.txt](github-files.txt): **122 files**.
The former 121-file list gained `THIRD_PARTY_NOTICES.md`; no runtime files were added.
Do not upload the whole working directory or use a broad staging command.

## Recorded owner decisions

Eric Della Casa explicitly confirmed in the preparation conversation:

- He developed and owns this project and authorizes MIT licensing with copyright 2026
  Eric Della Casa.
- He has permission to include the existing Unlayer artwork. Used artwork and the
  approved rendering design remain unchanged.
- Unapproved recorded conversations and copied website excerpts should be replaced
  with synthetic regression equivalents.
- He accepts the documented sprintf-js and braces risks for restricted private
  development review, not production deployment.
- Target: `ericdellacasa8/mastra-sales-proposal-agent`, private, branch `main`.
  Initial local commit is authorized only after checks pass. Remote creation/push is not.

These are the owner's statements, not an independent legal certification. They supersede
prior pending-approval entries in the historical audit. No public release, production
risk acceptance or permission to distribute the excluded design reference is implied.

## Included

| Paths | Purpose |
| --- | --- |
| `.env.example`, `.gitignore`, `.nvmrc` | Empty-key environment template, exclusions and Node 24 selection. |
| `README.md`, `CONTRIBUTING.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md` | Onboarding, contribution boundaries, project MIT terms and preserved dependency notices. |
| `package.json`, `package-lock.json`, `tsconfig.json` | Reproducible dependency pins and build configuration. Only root project license metadata changed. |
| `src/`, except the unused desk illustration and runtime data | Frozen application, Elements components, used artwork and legacy modules needed by regressions. |
| `fixtures/`, `tests/`, `scripts/` | Offline examples, regression coverage and diagnostics. No generated bundles. |
| Allowlisted `docs/` | Development, acceptance, audit and manifest documentation. Historical observations are not current product claims. |

All source, scripts and tests remain included. The source-path exception is the unused
`src/rendering/assets/desk.svg`. No essential imported module was removed.

## Assets and attribution

| Material | Disposition |
| --- | --- |
| `src/rendering/assets/leaf.png`, inline SVG icons in `src/rendering/sections.tsx`, embedded marks in `fixtures/saas.json` and `fixtures/agency.json` | KEEP unchanged under the owner's artwork permission and project authorship statements. |
| Tiny image payloads in `tests/save-proposal.test.ts`, `tests/turn-coordinator.test.ts`, `tests/trusted-evidence.test.ts`, `tests/website-generalization.test.ts` | REPLACED with a newly generated one-pixel RGB PNG, constructed with PNG chunks and zlib. No external image source. |
| Invalid SVG syntax and dummy credential URLs in security tests | KEEP: rejection-test data, not actual credentials or copied artwork. |
| `src/rendering/assets/desk.svg`, `design/reference-proposal.png` | EXCLUDE, preserve locally. No approval is inferred for the supplied reference image. |
| System font names | KEEP. No font files are distributed. |
| Former root Playwright license | Preserve complete text in `THIRD_PARTY_NOTICES.md`, explicitly scoped to Playwright. Root LICENSE is now MIT by Eric Della Casa. |

No third-party copyright header or declared copied-source attribution was found in
`src/`, `scripts/` or `tests/`. This does not prove the origin of every line. Installed
package notices remain intact outside the upload set. Redistribution of dependencies
or browser binaries requires their applicable notices; they are not included here.

## Synthetic regression material

Historical filenames remain stable so imports and test selection do not change. These
files now contain synthetic variants and must not be described as exact original traces:

- `tests/fixtures/hubspot-human-messages.json`
- `tests/fixtures/hubspot-failed-operations.json`
- `tests/fixtures/coordinator-website-role-live.json`
- `tests/fixtures/shared-cadence-live.json`
- `tests/fixtures/studio-consulting-boundary-calls.json`
- `tests/fixtures/studio-consulting-failed-call.json`
- `tests/fixtures/websites/medallia-source-excerpts.json`
- `tests/fixtures/websites/latest-medallia-review.json`
- `tests/fixtures/websites/selection-failed-call.json`
- `tests/fixtures/websites/seller.html`, `pricing.html`, `customer.html`

Fictional identities include Silverquill/Rivergate, CedarCanvas/HarborLedger,
Birchpath Advisory/Copperbank Logistics and MapleCloud/Ironbridge. Website addresses use
reserved example domains. Named scenario assertions were updated together with fixture
values. Numeric prices, quantities, malformed call shapes, authorization guards and
assertions remain in place. Website source prose and long model-generated company
summaries were rewritten; no fetched real homepage or screenshot is required.
`fixtures/output-quality-saas.json` uses fictional names with unchanged financial inputs.

Framework references, default OpenAI provider configuration and historical descriptions
in audit documents remain descriptive references, not claims of endorsement or actual
customer engagements. Original runtime histories remain excluded.

## Excluded

- `.env` and other real environment files; retain only `.env.example`.
- `data/`, `src/mastra/public/data/`, all database/journal files and conversation history.
- Generated PDF/HTML previews, QA artifacts, screenshots and demo videos.
- `node_modules/`, `.mastra/`, build output, logs and test reports.
- Local editor/agent settings, certificates/keys and operating-system metadata.
- `AGENTS.md`, `claude-context.txt`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_STATUS.md`,
  `design/`, `src/rendering/assets/desk.svg`, `docs/release-candidate-validation.md`.
- Every path absent from the exact allowlist, regardless of Git ignore behavior.

Excluded files are retained locally. No demo video is approved for this commit.

## Accepted dependency risks

No dependency versions changed:

- `sprintf-js@1.0.3`, moderate: production dependency through core, gray-matter,
  js-yaml and argparse. No demonstrated proposal-input path to affected CLI formatting.
- `braces@3.0.3`, high: build/development dependency through deployer, find-workspaces,
  fast-glob and micromatch. No demonstrated proposal-input path to workspace patterns.

See [the dependency review](repository-audit.md#dependency-security-review--22-october-2026)
for advisories and evidence. Neither advisory is fixed or declared harmless. Owner
acceptance applies only to restricted private development review.

## Verification and commit gate

See the latest preparation entry in [repository-audit.md](repository-audit.md) for
actual typecheck/test/build results and environment limitations. Previous owner-reported
176/176 Mac results preceded synthetic fixture edits and do not verify those edits.
Only stage the allowlist after verification passes, inspect the staged diff, then make
the authorized local commit. No remote configuration, repository creation or push is
part of this preparation. Repository access should remain restricted to intended reviewers.
