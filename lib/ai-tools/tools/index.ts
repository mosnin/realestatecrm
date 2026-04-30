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

/**
 * Domain tools only. The orchestrator's `delegate_to_subagent` tool is
 * intentionally NOT in this list — it gets added at the `registry` layer.
 * That separation breaks the cycle where delegate-to-subagent needs
 * skills/registry which needs ALL_TOOLS for validation. It also keeps this
 * list safe to pass into `validateSkill` as a pool of tools a sub-agent is
 * allowed to use (sub-agents calling sub-agents isn't a feature we want).
 */
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
