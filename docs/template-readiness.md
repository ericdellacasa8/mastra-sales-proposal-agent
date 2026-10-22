# Private review and eventual template readiness

Updated 2026-10-22. The [repository audit](repository-audit.md) is the evidence record;
the [proposed file manifest](github-file-manifest.md) is the upload boundary.
This document does not authorize repository creation, publication or maintainer outreach.

## Current scope

Conversational V1 collects salesperson-provided inputs, calculates commercial totals,
reviews progressive drafts, persists state and generates PDF proposal, HTML proposal and
HTML email through shared Elements components. It supports simple revisions. Website
research, screenshot extraction, catalog approval and delivery are outside V1.

The existing demo and PDF design are frozen. Preserve working code and retained legacy
tests; cleanup for review is documentation, metadata and safe ignore boundaries only.

## Phase gates

1. **Local preparation:** correct V1 documentation; inspect dependencies/assets; verify
   ignore rules and explicit file manifest. This bounded pass is documented in the audit.
2. **Private colleague review repository:** owner must confirm GitHub owner/name,
   visibility, invitees and rights to share code/assets/fixtures. Run the clean Node 24
   Mac checks in [V1 acceptance](v1-acceptance.md), or explicitly label outstanding checks
   for an experimental review. Inspect the actual staged files only after Git operations
   are authorized. No `.env`, runtime data, private history or generated private outputs.
3. **Internal feedback:** incorporate only agreed changes and obtain approval of the
   demonstration, scope, licensing and release materials.
4. **Mastra consideration:** only after that approval, recheck upstream policy and propose
   the template through the allowed maintainer process. No official-template claim or
   catalog installer command before acceptance.

## Upstream alignment and limits

The [Mastra catalog](https://mastra.ai/templates) and
[template directory guidance](https://github.com/mastra-ai/mastra/tree/main/templates)
provide the benchmark: clear overview, motivation, demo, prerequisites, environment,
quickstart and customization. Our entry point, ESM/TypeScript setup, OpenAI default,
`.env.example` and local Studio use follow those patterns. PDF generation adds a
Chromium prerequisite. No frontend, CRM or workflow expansion is needed for this V1.

Pinned dependencies and the npm lockfile are intentional for standalone reproducibility.
The template-directory guidance requests `latest` Mastra dependency declarations; defer
any upstream-specific adaptation until maintainers advise. Exact package/config files
for several newer reference templates were unavailable during the audit; parity is not
claimed. The audit lists the accessible primary sources and unverified requirements.

The [current root contribution guide](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md),
rechecked 2026-10-22, disables outside PRs and requests a feature issue and maintainer
feedback for new functionality. Older generated-mirror instructions describe a fork/PR
route; do not copy those into this independent repository or assume submission access.
Target name/directory, catalog metadata, media and changeset requirements remain subject
to maintainer guidance after internal approval.

## Current private-review decisions

Eric Della Casa confirmed project ownership, MIT licensing with his 2026 copyright,
permission for existing artwork, and acceptance of the two dependency advisories for
restricted private development review. Recorded fixtures were converted to synthetic
variants; dependency notices are preserved separately. See the current
[manifest](github-file-manifest.md) for the 122-file list and verification gate.

Target: ericdellacasa8/mastra-sales-proposal-agent, private. Git was initialized by the
owner; preparation has not created a commit or remote. A full Mac run against the
revised fixtures remains necessary because sandbox Chromium is blocked. Public release,
production deployment, reviewer invitations and Mastra outreach are separate actions.
`private: true` prevents npm publication; GitHub visibility is a separate setting.
