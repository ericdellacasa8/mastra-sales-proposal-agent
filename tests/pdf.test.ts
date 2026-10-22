import { demoCommercial } from '../src/proposal/catalog.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { sampleProposal } from '../src/proposal/samples.js';
import { renderProposal } from '../src/rendering/render.js';
import { renderPdf, assertPdf } from '../src/rendering/pdf.js';

function pageCount(pdf: Buffer) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}
test('real Chromium generates both sample PDFs and a multi-page stress fixture', async () => {
  await mkdir('data/qa', { recursive: true });
  for (const id of ['software', 'healthcare'] as const) {
    const rendered = renderProposal(sampleProposal(id), demoCommercial);
    const pdf = await renderPdf(rendered.documentHtml, rendered.proposal.seller);
    assertPdf(pdf);
    assert.equal(pageCount(pdf), 2, `${id}: customer context and investment fit two pages, without a disclaimer-only page`);
    await writeFile(`data/qa/${id}.pdf`, pdf);
  }
  const p = sampleProposal('software');
  p.customer.company = 'Fictional Regional Administrative Operations and Coordination Team';
  p.customer.name = 'Demo Buyer with an Extended Display Name';
  p.content.needs = Array.from({ length: 5 }, (_, i) => ({ text: `${i + 1}. ${'An extended operational requirement for pagination review. '.repeat(6)}`, evidenceQuote: p.content.needs[0]!.evidenceQuote }));
  p.content.assumptions = Array.from({ length: 5 }, () => 'Long-content visual stress check. '.repeat(10));
  p.content.openQuestions = Array.from({ length: 5 }, () => 'Confirm these requirements before setting the pilot scope. '.repeat(6));
  const pdf = await renderPdf(renderProposal(p, demoCommercial).documentHtml, p.seller);
  assert.ok(pageCount(pdf) > 2, 'Long content flows beyond two pages without shrinking or clipping');
  await writeFile('data/qa/long-content.pdf', pdf);
});
import qualityInput from '../fixtures/output-quality-saas.json';
import {confirmedInputSchema} from '../src/proposal/fixtures.js';
import {finalizeProposal} from '../src/proposal/finalize.js';
test('compact single-offering quality fixture fits one real PDF page',async()=>{
 const input=confirmedInputSchema.parse(qualityInput);
 const rendered=renderProposal(finalizeProposal(input.discovery,input.draft,input.commercial),input.commercial);
 const pdf=await renderPdf(rendered.documentHtml,rendered.proposal.seller);
 assert.equal(pageCount(pdf),1,'Compact substantive content should not orphan the CTA/footer onto a second page');
 await mkdir('data/qa',{recursive:true});await writeFile('data/qa/output-quality-saas.pdf',pdf);
});
