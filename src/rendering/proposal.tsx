import {presentationProposal} from './presentation.js';
import { Email, Document } from '@unlayer/react-elements';
import type { Proposal } from '../proposal/schema.js';
import { createSections, font } from './sections.js';

export function proposalTree(p: Proposal, mode: 'email' | 'document') {
  p=presentationProposal(p);
  const palette = p.seller.colors;
  const { BrandHeader, CustomerSummary, RecommendationSection, PricingSection, DetailsSection, NextStepsSection, Footer } = createSections(p.seller);
  const detail = mode === 'email' ? 'summary' : 'full';
  const sections = [
    BrandHeader(p), CustomerSummary(p, detail),
    ...RecommendationSection(p, detail), PricingSection(p, detail),
    ...(mode === 'document' ? DetailsSection(p) : []),
    NextStepsSection(p), Footer(p, detail),
  ];
  return mode === 'email'
    ? <Email contentWidth="600px" backgroundColor={palette.canvas} fontFamily={font} textColor={palette.ink} previewText={`Your proposed scope and investment from ${p.seller.name}`}>{sections}</Email>
    : <Document contentWidth="680px" documentSize="A4" documentOrientation="portrait" backgroundColor={palette.white} fontFamily={font} textColor={palette.ink}>{sections}</Document>;
}
