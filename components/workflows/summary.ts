/**
 * summarizeWorkflow — a one-line human sentence for a stored workflow.
 *
 * Renders a WorkflowDefinition's trigger + first action into the kind of
 * sentence a realtor scans in a list row: "When a new lead scores ≥ 80, draft
 * a message." Pure and dependency-free so the manager row can render it
 * synchronously. It reads the already-validated stored shapes (trigger,
 * conditions, actions) — not the loose form state.
 */

import type {
  ConditionGroup,
  WorkflowAction,
  WorkflowTrigger,
} from '@/lib/workflows/schema';

function triggerPhrase(trigger: WorkflowTrigger): string {
  switch (trigger.type) {
    case 'lead_created':
      return 'a new lead is created';
    case 'lead_score_threshold':
      return `a lead scores ≥ ${trigger.config.min}`;
    case 'inbound_message': {
      const ch = trigger.config.channel;
      return ch && ch !== 'any' ? `an inbound ${ch} arrives` : 'an inbound message arrives';
    }
    case 'tour_completed':
      return 'a tour is completed';
    case 'deal_stage_changed':
      return trigger.config.toStage
        ? `a deal moves to ${trigger.config.toStage}`
        : 'a deal changes stage';
    case 'integration_event':
      return `${trigger.config.toolkit} fires ${trigger.config.event}`;
    case 'schedule': {
      const { cadence, hour } = trigger.config;
      const at = typeof hour === 'number' ? ` at ${hour}:00` : '';
      if (cadence === 'hourly') return 'every hour';
      if (cadence === 'weekdays') return `every weekday${at}`;
      return `every day${at}`;
    }
    default:
      return 'triggered';
  }
}

function actionPhrase(action: WorkflowAction): string {
  switch (action.type) {
    case 'draft_message':
      return `draft a ${action.config.channel} message`;
    case 'schedule_message':
      return `schedule a ${action.config.channel} message`;
    case 'create_task':
      return 'create a task';
    case 'call_integration':
      return `call ${action.config.toolkit}`;
    case 'run_chippi':
      return 'ask Chippi to take it from there';
    default:
      return 'run an action';
  }
}

export function summarizeWorkflow(
  trigger: WorkflowTrigger,
  _conditions: ConditionGroup,
  actions: WorkflowAction[],
): string {
  const when = triggerPhrase(trigger);
  if (actions.length === 0) return `When ${when}, do nothing yet.`;
  const first = actionPhrase(actions[0]);
  const extra = actions.length > 1 ? ` (+${actions.length - 1} more)` : '';
  return `When ${when}, ${first}${extra}.`;
}
