import { demoCommercial } from '../src/proposal/catalog.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleProposal } from '../src/proposal/samples.js';
import { renderProposal, assertEmailSize } from '../src/rendering/render.js';
import { palette, sharedCopy } from '../src/rendering/sections.js';

for (const id of ['software', 'healthcare'] as const) {
  test(`${id}: shared content, valid shells, plain text and real design JSON`, () => {
    const p = sampleProposal(id), r = renderProposal(p, demoCommercial);
    for (const html of [r.emailHtml, r.documentHtml]) {
      for (const tag of ['html', 'head', 'body']) assert.equal((html.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length, 1);
      assert.match(html, /<html[^>]*lang="en"/);
      assert.match(html, /charset=UTF-8|charset="?utf-8/i);
      assert.match(html, /name="viewport"/);
      assert.ok(html.includes(p.customer.company));
      assert.ok(html.includes(id === 'software' ? '$531' : '$384'));
      assert.ok(html.includes(id === 'software' ? '$7,272' : '$5,508'));
      assert.doesNotMatch(html, /<script\b|<iframe\b/);
      assert.match(html, /Discuss the proposal with Fennquill Systems/);
    }
    assert.match(r.emailHtml, /\[if gte mso/);
    assert.ok(Buffer.byteLength(r.emailHtml) < 100_000);
    assert.match(r.emailText, /Fennquill Systems/);
    assert.doesNotMatch(r.emailText, /<table|<p[ >]/);
    assert.ok(r.design.body.rows.length >= 6);
    const json = JSON.stringify(r.design);
    assert.ok(json.includes(p.customer.company));
    assert.ok(json.includes('Your next step'));
    assert.match(r.documentHtml, /Scope and open questions/);
    assert.doesNotMatch(r.emailHtml, /Scope and open questions/);
    assert.match(r.documentHtml, /class="proposal-pricing"/);
    for (const html of [r.emailHtml, r.documentHtml]) {
      for (const label of ['Monthly investment:', 'One-time fees:', 'First-year estimate:', 'First month:', 'Taxes excluded', 'No discounts']) assert.ok(html.includes(label));
    }
    assert.match(r.documentHtml, /Your priority/);
    assert.ok(r.documentHtml.includes(`Proposal for ${p.customer.company}`));
    assert.equal((r.documentHtml.match(/class="proposal-card-row"/g) ?? []).length, 1);
    assert.match(r.documentHtml, /font-family: Georgia/);
    assert.match(r.documentHtml, /data:image\/svg\+xml;base64/);
    assert.ok(JSON.stringify(r.design).includes('data:image/png;base64'));
    for (const term of p.terms) assert.ok(r.documentHtml.includes(term));
    for (const recommendation of p.content.recommendations) assert.ok(r.documentHtml.includes(recommendation.rationale));
  });
}
test('one shared section edit updates email, document HTML and design JSON', () => {
  const original = sharedCopy.nextStep;
  try {
    sharedCopy.nextStep = 'Plan the next conversation';
    const r = renderProposal(sampleProposal('software'), demoCommercial);
    for (const output of [r.emailHtml, r.documentHtml, r.emailText, JSON.stringify(r.design)]) assert.ok(output.toLowerCase().includes(sharedCopy.nextStep.toLowerCase()));
  } finally { sharedCopy.nextStep = original; }
});
test('untrusted customer and every rendered narrative field are escaped', () => {
  const p = sampleProposal('software');
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script> & test';
  p.customer.name = payload; p.customer.company = payload;
  p.content.summary = payload; p.content.nextStep = payload;
  p.content.needs[0]!.text = payload;
  p.content.recommendations.forEach(r => { r.rationale = payload; });
  p.content.timeline[0]!.phase = payload; p.content.timeline[0]!.detail = payload;
  p.content.assumptions = [payload]; p.content.openQuestions = [payload];
  const r = renderProposal(p, demoCommercial);
  for (const html of [r.emailHtml, r.documentHtml]) {
    assert.doesNotMatch(html, /<img src=x|<script>/);
    assert.match(html, /&lt;img/);
  }
  assert.ok(JSON.stringify(r.design).includes('&lt;img'));
});
test('email limit counts UTF-8 bytes and rejects boundary/oversized output', () => {
  assert.doesNotThrow(() => assertEmailSize('a'.repeat(99_999)));
  assert.throws(() => assertEmailSize('a'.repeat(100_000)));
  assert.throws(() => assertEmailSize('é'.repeat(50_000)));
});
function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(h => parseInt(h, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
}
test('all text palette combinations meet normal-text contrast', () => {
  assert.ok((luminance(palette.white) + 0.05) / (luminance(palette.dark) + 0.05) >= 4.5);
  for (const color of [palette.ink, palette.muted, palette.accent]) {
    for (const bg of [palette.white, palette.soft, '#DCECE8']) {
      const values = [luminance(color), luminance(bg)].sort((a, b) => b - a);
      assert.ok((values[0]! + 0.05) / (values[1]! + 0.05) >= 4.5, `${color} on ${bg}`);
    }
  }
});

import qualityInput from '../fixtures/output-quality-saas.json';
import {finalizeProposal} from '../src/proposal/finalize.js';
import {confirmedInputSchema} from '../src/proposal/fixtures.js';
import {presentationProposal,recommendationDescription} from '../src/rendering/presentation.js';
test('customer-facing cleanup preserves source state and commercial figures',()=>{
 const input=confirmedInputSchema.parse(qualityInput),p=finalizeProposal(input.discovery,input.draft,input.commercial),before=JSON.stringify(p);
 const r=renderProposal(p,input.commercial);
 assert.equal(JSON.stringify(p),before);assert.match(p.content.assumptions[0]!,/Quantity check/);
 assert.equal(recommendationDescription('Plan','Plan','Plan'),undefined);
 assert.equal(recommendationDescription('Plan','Provide the requested Plan.','Supplied description.'),'Supplied description.');
 for(const html of [r.documentHtml,r.emailHtml]){
  assert.doesNotMatch(html,/Quantity check:|Implementation considerations/);
  assert.match(html,/This proposal outlines QuillChat Enterprise licenses/);
  assert.equal((html.match(/boost company-wide operational efficiency/g)??[]).length,1);
  assert.match(html,/5,250/);assert.match(html,/63,000/);assert.match(html,/Committed contract total/);
  assert.match(html,/background:#FFFFFF;color:#003D43;padding:12px 14px;border-radius:24px;font-weight:bold">Discuss the proposal/);
 }
 assert.equal(presentationProposal(p).content.assumptions.length,0);
 assert.doesNotMatch(r.emailText,/Quantity check/);assert.doesNotMatch(JSON.stringify(r.design),/Quantity check/);
});

test('summary grammar handles action goals, noun phrases and complete sentences',()=>{
 const input=confirmedInputSchema.parse(qualityInput),base=finalizeProposal(input.discovery,input.draft,input.commercial);
 for(const goals of [['reduce manual effort','improve coordination'],['Reliable reporting','A clearer operating model'],['Our team needs a common process.'],['to improve planning']]){
  const p=structuredClone(base);p.content.needs=goals.map(text=>({text,evidenceQuote:p.content.needs[0]!.evidenceQuote}));
  const summary=presentationProposal(p).content.summary;
  assert.doesNotMatch(summary,/focus on|to to/);assert.match(summary,/Rivergate/);
  for(const goal of goals)assert.ok(summary.includes(goal.replace(/^to /,'').replace(/[.!]+$/,'')));
 }
 const neutral=structuredClone(base);neutral.content.needs=[{text:'Provide the requested scope.',evidenceQuote:base.content.needs[0]!.evidenceQuote}];neutral.content.summary='Proposal for Rivergate covering the requested scope.';assert.equal(presentationProposal(neutral).content.summary,neutral.content.summary);
});
