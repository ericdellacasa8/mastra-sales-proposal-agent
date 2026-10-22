# Contributing

This is an independently maintained Conversational Sales Proposal Agent, being prepared
for private colleague review. It is not an auto-generated Mastra template mirror.
Repository creation, visibility and invitations require the owner's separate approval.

Read the [V1 architecture](README.md#architecture-and-customization),
[local development guide](docs/local-development.md) and [acceptance steps](docs/v1-acceptance.md).
Keep changes focused and include reproduction/test evidence. Preserve conversational V1,
deterministic pricing, persistence, thread isolation and shared Elements rendering.
The working PDF design is frozen. Do not add research, delivery or unsupported integrations.
Legacy website/evidence tests are retained regression coverage, not the current product.

Use Node 24 and the supplied npm lockfile:

```sh
npm ci
npm run browser:install
npm run typecheck
npm run test:unit
npm test
npm run build
```

Stop Studio before building. Report unavailable browser/network/model checks explicitly;
scripted provider tests and PDF stubs are not live-model or PDF acceptance.

Never include credentials, real customer conversations, databases, generated private
proposals or raw diagnostic traces in a change. Use fictional fixtures. Consult the
[proposed file manifest](docs/github-file-manifest.md) before any separately authorized
upload; an ignore rule is not a substitute for inspecting the actual staged file list.

Contributions are intended for the existing [MIT license](LICENSE). Include only
code/assets you have permission to share and retain applicable third-party notices.
The owner's permissions and synthetic-fixture inventory are recorded in the manifest.
Preserve [third-party notices](THIRD_PARTY_NOTICES.md); project ownership does not
replace dependency license obligations.

## Eventual Mastra consideration

First complete colleague review and incorporate approved feedback. Only after owner
approval should this project be proposed to Mastra. It is not an accepted template and
must not advertise a catalog installation command.

The [root Mastra contribution guide](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md),
checked 2026-10-22, says outside pull requests are disabled and asks for a feature request
and maintainer feedback for new functionality. Older template-mirror fork/PR instructions
are not a permission to submit. Recheck the policy after internal approval and follow
maintainer direction about access, target directory, catalog metadata and any changeset
requirements. Do not contact maintainers or submit to a generated template mirror now.

See [review readiness](docs/template-readiness.md) for the phased plan. No code contribution,
GitHub publication or official catalog acceptance is implied by this document.
