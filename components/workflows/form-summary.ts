/**
 * summarizeFormState — a live, plain-English reading of the builder's CURRENT
 * (possibly half-filled) form state.
 *
 * The manager's summarizeWorkflow() renders a SAVED, validated workflow. This
 * one renders the LOOSE WorkflowFormState the builder holds while the realtor is
 * still typing — so it must be tolerant of blanks (no NaN, no "undefined fires
 * undefined"). It powers the always-on preview card at the top of the builder:
 * the realtor watches the sentence assemble as they pick a trigger, add a
 * condition, choose an action, and set autonomy. Show, don't tell.
 *
 * Returns STRUCTURED parts (when / conditions / then / autonomy) so the preview
 * can emphasise the trigger and action phrases while the connective words
 * recede. summaryToSentence() flattens them for tests and for any plain-text
 * consumer.
 *
 * Pure + dependency-light (only the form-state types): unit-testable, no React.
 */

import type {
  ActionRowState,
  ConditionRowState,
  TriggerFormState,
  WorkflowFormState,
} from './build-definition';
import type { WorkflowAutonomy } from '@/lib/workflows/schema';

export interface FormSummary {
  /** The trigger clause, e.g. "a lead's score reaches 80". Never empty. */
  when: string;
  /** The optional condition clause, e.g. "only if 2 conditions match". */
  conditions: string | null;
  /** The action clause, e.g. "draft a text (+1 more)". Never empty. */
  then: string;
  /** The trust clause keyed off autonomy. Never empty. */
  autonomy: string;
}

// ── Trigger ───────────────────────────────────────────────────────────────────

function triggerPhrase(t: TriggerFormState): string {
  switch (t.type) {
    case 'lead_created':
      return 'a new lead comes in';
    case 'lead_score_threshold': {
      const min = t.min.trim();
      return min ? `a lead's score reaches ${min}` : "a lead's score crosses your threshold";
    }
    case 'inbound_message':
      if (t.channel === 'email') return 'a lead emails you';
      return 'a lead messages you';
    case 'tour_completed':
      return 'a tour wraps up';
    case 'deal_stage_changed': {
      const stage = t.toStage.trim();
      return stage ? `a deal moves to ${stage}` : 'a deal changes stage';
    }
    case 'integration_event': {
      const app = t.toolkit.trim();
      return app ? `${app} fires an event` : 'a connected app fires an event';
    }
    case 'schedule': {
      const hour = t.hour.trim();
      const at = hour !== '' && /^\d+$/.test(hour) ? ` at ${hour}:00` : '';
      if (t.cadence === 'hourly') return 'every hour';
      if (t.cadence === 'weekdays') return `every weekday${at}`;
      return `every day${at}`;
    }
    case 'webhook':
      return 'your webhook URL receives a POST';
    default:
      return 'something happens';
  }
}

// ── Conditions ────────────────────────────────────────────────────────────────

const VALUELESS = new Set(['exists', 'not_exists']);

/** A row counts once it names a field (and, for value-taking ops, a value). */
function isFilledCondition(row: ConditionRowState): boolean {
  if (!row.field.trim()) return false;
  if (VALUELESS.has(row.operator)) return true;
  return row.value.trim() !== '';
}

function conditionClause(state: WorkflowFormState): string | null {
  const filled = state.conditions.filter(isFilledCondition).length;
  if (filled === 0) return null;
  const joiner = state.conditionOp === 'or' ? 'any' : 'all';
  if (filled === 1) return 'only if 1 condition matches';
  return `only if ${joiner} of ${filled} conditions match`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

function channelNoun(channel: 'sms' | 'email'): string {
  return channel === 'email' ? 'an email' : 'a text';
}

function actionPhrase(a: ActionRowState): string {
  switch (a.type) {
    case 'draft_message':
      return `draft ${channelNoun(a.channel)}`;
    case 'schedule_message':
      return `schedule ${channelNoun(a.channel)}`;
    case 'create_task': {
      const title = a.title.trim();
      return title ? `create the task “${title}”` : 'create a task';
    }
    case 'call_integration': {
      const app = a.toolkit.trim();
      return app ? `call ${app}` : 'call a connected app';
    }
    case 'run_chippi':
      return 'ask Chippi to handle it';
    case 'delay': {
      const amt = a.delayMinutes.trim();
      const unit = a.delayUnit ?? 'minutes';
      if (!amt) return 'wait a moment';
      return `wait ${amt} ${unit}`;
    }
    case 'filter': {
      const f = a.filterField.trim();
      return f ? `filter on ${f}` : 'check a filter condition';
    }
    case 'formatter': {
      const input = a.formatterInput.trim();
      const op = a.formatterOperation.replace(/_/g, ' ');
      return input ? `${op} ${input}` : 'format a value';
    }
    case 'webhook_post': {
      const url = a.webhookUrl.trim();
      return url ? `POST to ${url.replace(/^https?:\/\//, '').slice(0, 40)}` : 'POST to a webhook URL';
    }
    case 'update_lead': {
      const fieldLabel: Record<string, string> = {
        score_label: 'set score to',
        follow_up_in_days: 'follow up in',
        tag_add: 'add tag',
        tag_remove: 'remove tag',
      };
      const val = a.updateValue.trim();
      return val
        ? `${fieldLabel[a.updateField] ?? a.updateField} "${val}"`
        : 'update this lead';
    }
    case 'notify_agent': {
      const title = a.notifyTitle.trim();
      return title ? `send push: "${title.slice(0, 40)}"` : 'send a push alert';
    }
    default:
      return 'take an action';
  }
}

function thenClause(actions: ActionRowState[]): string {
  if (actions.length === 0) return 'do nothing yet';
  const first = actionPhrase(actions[0]);
  const extra = actions.length > 1 ? ` (+${actions.length - 1} more)` : '';
  return `${first}${extra}`;
}

// ── Autonomy ──────────────────────────────────────────────────────────────────

const AUTONOMY_CLAUSE: Record<WorkflowAutonomy, string> = {
  draft: 'You approve each one before anything goes out.',
  notify: 'It runs on its own and keeps you posted.',
  auto: 'It runs fully on its own — no approval needed.',
};

// ── Public API ────────────────────────────────────────────────────────────────

export function summarizeFormState(state: WorkflowFormState): FormSummary {
  return {
    when: triggerPhrase(state.trigger),
    conditions: conditionClause(state),
    then: thenClause(state.actions),
    autonomy: AUTONOMY_CLAUSE[state.autonomy],
  };
}

/** Flatten a FormSummary into one sentence (tests + plain-text consumers). */
export function summaryToSentence(s: FormSummary): string {
  const cond = s.conditions ? `, ${s.conditions}` : '';
  return `When ${s.when}${cond}, I’ll ${s.then}. ${s.autonomy}`;
}
