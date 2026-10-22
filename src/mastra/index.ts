import { Mastra } from '@mastra/core';
import { salesProposalAgent, proposalService } from './agents/sales-proposal.js';

import { previewRoutes } from '../assistant/previews.js';

// Single-owner local Studio. No delivery tools, workflows or content logging.
export const mastra = new Mastra({
  agents: { salesProposalAgent },
  logger: false,
  server: { host: '127.0.0.1', apiRoutes: previewRoutes(proposalService.store) },
});
