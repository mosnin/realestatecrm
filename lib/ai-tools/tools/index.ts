/**
 * All tools known to the registry. New tools get added to this array in
 * their own Phase 2 / Phase 3 / Phase 5 commits.
 */

import type { ToolDefinition } from '../types';
import { addChecklistItemTool } from './add-checklist-item';
import { advanceDealStageTool } from './advance-deal-stage';
import { createDealTool } from './create-deal';
import { getContactTool } from './get-contact';
import { pipelineSummaryTool } from './pipeline-summary';
import { scheduleTourTool } from './schedule-tour';
import { searchContactsTool } from './search-contacts';
import { searchDealsTool } from './search-deals';
import { sendEmailTool } from './send-email';
import { sendSmsTool } from './send-sms';
import { updateContactTool } from './update-contact';

export const ALL_TOOLS: ToolDefinition[] = [
  // Read-only
  searchContactsTool as ToolDefinition,
  searchDealsTool as ToolDefinition,
  getContactTool as ToolDefinition,
  pipelineSummaryTool as ToolDefinition,
  // Mutating — require approval
  sendEmailTool as ToolDefinition,
  sendSmsTool as ToolDefinition,
  updateContactTool as ToolDefinition,
  advanceDealStageTool as ToolDefinition,
  createDealTool as ToolDefinition,
  scheduleTourTool as ToolDefinition,
  addChecklistItemTool as ToolDefinition,
];
