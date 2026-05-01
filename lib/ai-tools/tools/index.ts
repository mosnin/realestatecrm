/**
 * All tools known to the registry. Other teams append their tools to this
 * array as they ship.
 */

import type { ToolDefinition } from '../types';
import { addChecklistItemTool } from './add-checklist-item';
import { createDealTool } from './create-deal';
import { findDealTool } from './find-deal';
import { findPersonTool } from './find-person';
import { moveDealStageTool } from './move-deal-stage';
import { pipelineSummaryTool } from './pipeline-summary';
import { scheduleTourTool } from './schedule-tour';
import { sendEmailTool } from './send-email';
import { sendSmsTool } from './send-sms';

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
  findPersonTool as ToolDefinition,
  findDealTool as ToolDefinition,
  pipelineSummaryTool as ToolDefinition,
  // Mutating — require approval
  sendEmailTool as ToolDefinition,
  sendSmsTool as ToolDefinition,
  moveDealStageTool as ToolDefinition,
  createDealTool as ToolDefinition,
  scheduleTourTool as ToolDefinition,
  addChecklistItemTool as ToolDefinition,
];
