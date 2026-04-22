/**
 * All tools known to the registry. New tools get added to this array in
 * their own Phase 2 / Phase 3 / Phase 5 commits.
 */

import type { ToolDefinition } from '../types';
import { getContactTool } from './get-contact';
import { pipelineSummaryTool } from './pipeline-summary';
import { searchContactsTool } from './search-contacts';
import { searchDealsTool } from './search-deals';

export const ALL_TOOLS: ToolDefinition[] = [
  searchContactsTool as ToolDefinition,
  searchDealsTool as ToolDefinition,
  getContactTool as ToolDefinition,
  pipelineSummaryTool as ToolDefinition,
];
