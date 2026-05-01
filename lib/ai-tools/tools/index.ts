/**
 * All tools known to the registry. New tools get appended here when they
 * ship. The list is grouped by category and within each category by
 * read-only first, then mutating (approval-gated) — keep that order.
 */

import type { ToolDefinition } from '../types';

// People — find + state changes + activity capture
import { findPersonTool } from './find-person';
import { logCallTool } from './log-call';
import { logMeetingTool } from './log-meeting';
import { setFollowupTool } from './set-followup';
import { clearFollowupTool } from './clear-followup';
import { markPersonHotTool } from './mark-person-hot';
import { markPersonColdTool } from './mark-person-cold';
import { archivePersonTool } from './archive-person';
import { mergePersonsTool } from './merge-persons';
import { noteOnPersonTool } from './note-on-person';

// Deals — find + lifecycle + activity capture
import { findDealTool } from './find-deal';
import { createDealTool } from './create-deal';
import { moveDealStageTool } from './move-deal-stage';
import { updateDealValueTool } from './update-deal-value';
import { updateDealCloseDateTool } from './update-deal-close-date';
import { attachPropertyToDealTool } from './attach-property-to-deal';
import { markDealWonTool } from './mark-deal-won';
import { markDealLostTool } from './mark-deal-lost';
import { noteOnDealTool } from './note-on-deal';
import { addChecklistItemTool } from './add-checklist-item';

// Tours
import { scheduleTourTool } from './schedule-tour';
import { rescheduleTourTool } from './reschedule-tour';
import { cancelTourTool } from './cancel-tour';
import { findToursTool } from './find-tours';

// Properties
import { findPropertyTool } from './find-property';
import { findComparablePropertiesTool } from './find-comparable-properties';
import { updatePropertyStatusTool } from './update-property-status';
import { noteOnPropertyTool } from './note-on-property';

// Calendar
import { checkAvailabilityTool } from './check-availability';
import { blockTimeTool } from './block-time';

// Pipeline aggregates
import { pipelineSummaryTool } from './pipeline-summary';
import { findStuckDealsTool } from './find-stuck-deals';
import { findQuietHotPersonsTool } from './find-quiet-hot-persons';
import { findOverdueFollowupsTool } from './find-overdue-followups';

// Communication — drafting + sending + post-hoc logging
import { draftEmailTool } from './draft-email';
import { draftSmsTool } from './draft-sms';
import { sendEmailTool } from './send-email';
import { sendSmsTool } from './send-sms';
import { logEmailSentTool } from './log-email-sent';
import { logSmsSentTool } from './log-sms-sent';

// Brokerage — broker-role gated
import { summarizeRealtorTool } from './summarize-realtor';
import { assignLeadToRealtorTool } from './assign-lead-to-realtor';

// Memory
import { recallHistoryTool } from './recall-history';

/**
 * Domain tools only. The orchestrator's `delegate_to_subagent` tool is
 * intentionally NOT in this list — it gets added at the `registry` layer.
 * That separation breaks the cycle where delegate-to-subagent needs
 * skills/registry which needs ALL_TOOLS for validation. It also keeps this
 * list safe to pass into `validateSkill` as a pool of tools a sub-agent is
 * allowed to use (sub-agents calling sub-agents isn't a feature we want).
 */
export const ALL_TOOLS: ToolDefinition[] = [
  // ── People ─────────────────────────────────────────────────────────────
  findPersonTool as ToolDefinition,
  logCallTool as ToolDefinition,
  logMeetingTool as ToolDefinition,
  setFollowupTool as ToolDefinition,
  clearFollowupTool as ToolDefinition,
  markPersonHotTool as ToolDefinition,
  markPersonColdTool as ToolDefinition,
  archivePersonTool as ToolDefinition,
  mergePersonsTool as ToolDefinition,
  noteOnPersonTool as ToolDefinition,

  // ── Deals ──────────────────────────────────────────────────────────────
  findDealTool as ToolDefinition,
  createDealTool as ToolDefinition,
  moveDealStageTool as ToolDefinition,
  updateDealValueTool as ToolDefinition,
  updateDealCloseDateTool as ToolDefinition,
  attachPropertyToDealTool as ToolDefinition,
  markDealWonTool as ToolDefinition,
  markDealLostTool as ToolDefinition,
  noteOnDealTool as ToolDefinition,
  addChecklistItemTool as ToolDefinition,

  // ── Tours ──────────────────────────────────────────────────────────────
  scheduleTourTool as ToolDefinition,
  rescheduleTourTool as ToolDefinition,
  cancelTourTool as ToolDefinition,
  findToursTool as ToolDefinition,

  // ── Properties ─────────────────────────────────────────────────────────
  findPropertyTool as ToolDefinition,
  findComparablePropertiesTool as ToolDefinition,
  updatePropertyStatusTool as ToolDefinition,
  noteOnPropertyTool as ToolDefinition,

  // ── Calendar ───────────────────────────────────────────────────────────
  checkAvailabilityTool as ToolDefinition,
  blockTimeTool as ToolDefinition,

  // ── Pipeline aggregates ────────────────────────────────────────────────
  pipelineSummaryTool as ToolDefinition,
  findStuckDealsTool as ToolDefinition,
  findQuietHotPersonsTool as ToolDefinition,
  findOverdueFollowupsTool as ToolDefinition,

  // ── Communication ──────────────────────────────────────────────────────
  draftEmailTool as ToolDefinition,
  draftSmsTool as ToolDefinition,
  sendEmailTool as ToolDefinition,
  sendSmsTool as ToolDefinition,
  logEmailSentTool as ToolDefinition,
  logSmsSentTool as ToolDefinition,

  // ── Brokerage ──────────────────────────────────────────────────────────
  summarizeRealtorTool as ToolDefinition,
  assignLeadToRealtorTool as ToolDefinition,

  // ── Memory ─────────────────────────────────────────────────────────────
  recallHistoryTool as ToolDefinition,
];
