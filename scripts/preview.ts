import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { sampleIds, sampleProposal, type SampleId } from '../src/proposal/samples.js';
import { demoCommercial } from '../src/proposal/catalog.js';
import { fixtureIds, fixtureProposal, confirmedInputSchema, type FixtureId } from '../src/proposal/fixtures.js';
import type { CommercialInput } from '../src/proposal/commercial.js';
import type { Proposal } from '../src/proposal/schema.js';
import { finalizeProposal } from '../src/proposal/finalize.js';
import { renderProposal } from '../src/rendering/render.js';
import { renderPdf } from '../src/rendering/pdf.js';
import { writePreview, verifyPreview } from '../src/services/artifacts.js';

async function main() {
  const { values } = parseArgs({ options: {
    sample: { type: 'string' }, input: { type: 'string' }, name: { type: 'string' },
    'html-only': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  }, strict: true });
  if (values.help) {
    console.log('npm run preview -- --sample all|software|healthcare|saas|consulting|agency [--html-only]');
    console.log('npm run preview -- --input confirmed-input.json --name custom-preview [--html-only]');
    console.log('Replaces disposable previews under data/previews. No API keys. Prices must come from a seller-confirmed catalog.');
    return;
  }
  if (values.input && values.sample) throw new Error('Choose --input or --sample');
  if (values.name && !values.input) throw new Error('--name requires --input');
  const ids = [...sampleIds, ...fixtureIds];
  const selected = values.input ? [] : !values.sample || values.sample === 'all' ? ids : ids.filter(id => id === values.sample);
  if (!values.input && !selected.length) throw new Error(`Sample must be all or ${ids.join(', ')}`);
  const jobs: { id: string; proposal: Proposal; commercial: CommercialInput }[] = selected.map(id => {
    if (fixtureIds.includes(id as FixtureId)) {
      const { input, proposal } = fixtureProposal(id as FixtureId);
      return { id, proposal, commercial: input.commercial };
    }
    return { id, proposal: sampleProposal(id as SampleId), commercial: demoCommercial };
  });
  if (values.input) {
    const id = values.name ?? 'custom-preview';
    if (!/^[a-z][a-z0-9-]{0,49}$/.test(id)) throw new Error('Use a short lowercase preview name without path separators');
    const input = confirmedInputSchema.parse(JSON.parse(await readFile(values.input, 'utf8')));
    jobs.push({ id, proposal: finalizeProposal(input.discovery, input.draft, input.commercial), commercial: input.commercial });
  }
  for (const { id, proposal, commercial } of jobs) {
    const rendered = renderProposal(proposal, commercial);
    const pdf = values['html-only'] ? undefined : await renderPdf(rendered.documentHtml, rendered.proposal.seller);
    const directory = resolve('data', 'previews', id);
    await writePreview(directory, rendered, pdf);
    await verifyPreview(directory);
    console.log(`${id}: ${Buffer.byteLength(rendered.emailHtml)} bytes email${pdf ? `, ${pdf.length} bytes PDF` : ' (HTML-only; PDF not generated)'}`);
    console.log(resolve(directory, 'email.html'));
    if (pdf) console.log(resolve(directory, 'proposal.pdf'));
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
