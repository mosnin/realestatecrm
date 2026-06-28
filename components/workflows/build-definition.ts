/**
 * buildDefinition — pure form-state → WorkflowDefinition mapper.
 *
 * The builder UI holds a flat, string-friendly `WorkflowFormState` (every
 * input is a string or a small enum, because that's what <input>/<select>
 * hand back). This file translates that loose shape into the strict
 * WorkflowDefinition the schema expects: it coerces numbers, drops the value
 * for exists/not_exists operators, parses optional JSON params, and assembles
 * the trigger/conditions/actions/autonomy object.
 *
 * It is deliberately UNIT-TESTABLE: no React, no DOM, no fetch. The builder
 * calls buildDefinition(state) and then runs parseWorkflowDefinition() on the
 * result to surface field-level issues BEFORE POSTing — buildDefinition never
 * validates, it only maps. A half-filled form therefore produces a shape that
 * parseWorkflowDefinition rejects, which is exactly how the UI learns what's
 * missing.
 *
 * Mapping notes:
 *  - Numbers come off the form as strings; we Number() them. An empty or
 *    non-numeric string becomes NaN, which the schema rejects (surfacing the
 *    error) rather than silently defaulting.
 *  - Optional config fields (deal_stage_changed.toStage, schedule.hour,
 *    create_task.dueInDays) are omitted when blank so `.optional()` holds.
 *  - call_integration.params is parsed from a JSON string; invalid JSON is
 *    left as a sentinel object the schema rejects, so the realtor sees the
 *    error instead of a swallowed exception.
 *  - Conditions are a FLAT group (op + rules). Nested groups are intentionally
 *    out of scope for v1 — a flat AND/OR list covers the templates and the
 *    common case; the schema still accepts it as a depth-1 ConditionGroup.
 */

import type {
  ConditionGroup,
  ConditionRule,
  Operator,
  TriggerType,
  WorkflowAction,
  WorkflowActionType,
  WorkflowAutonomy,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowTrigger,
} from '@/lib/workflows/schema';

// ── Form state — the loose, input-friendly shape the builder holds ───────────

export interface TriggerFormState {
  type: TriggerType;
  /** lead_score_threshold: minimum score (string off a number input). */
  min: string;
  /** inbound_message: channel filter. */
  channel: 'sms' | 'email' | 'any';
  /** integration_event. */
  toolkit: string;
  event: string;
  /** deal_stage_changed. */
  toStage: string;
  /** schedule. */
  cadence: 'hourly' | 'daily' | 'weekdays';
  /** schedule hour, 0-23 (string off a number input; blank = omit). */
  hour: string;
}

export interface ConditionRowState {
  /** Stable key for React lists; not part of the definition. */
  id: string;
  field: string;
  operator: Operator;
  value: string;
}

export interface ActionRowState {
  id: string;
  type: WorkflowActionType;
  /** draft_message / schedule_message. */
  channel: 'sms' | 'email';
  /** draft_message / schedule_message / run_chippi. */
  instruction: string;
  /** schedule_message delay (string off a number input). */
  delayMinutes: string;
  /** create_task. */
  title: string;
  dueInDays: string;
  /** call_integration. */
  toolkit: string;
  action: string;
  /** call_integration params as a JSON string; blank = omit. */
  paramsJson: string;
}

export interface WorkflowFormState {
  name: string;
  trigger: TriggerFormState;
  conditionOp: 'and' | 'or';
  conditions: ConditionRowState[];
  actions: ActionRowState[];
  autonomy: WorkflowAutonomy;
  /**
   * ADVANCED mode: when set, the workflow is authored as a branching graph on
   * the canvas and this is what runs — the linear conditions/actions above are
   * ignored (buildDefinition emits empty ones). null/undefined = linear mode.
   */
  graph?: WorkflowGraph | null;
}

// ── Operators that take no operand ───────────────────────────────────────────

const VALUELESS_OPERATORS = new Set<Operator>(['exists', 'not_exists']);

/**
 * Sentinel returned for call_integration params when the JSON string is
 * present but unparseable. It's intentionally NOT a valid params record
 * (params must be Record<string, unknown>), so parseWorkflowDefinition
 * rejects it and the builder surfaces the error rather than silently
 * dropping malformed JSON.
 */
const INVALID_JSON_SENTINEL = { __invalidJson: true } as const;

// ── Coercion helpers ─────────────────────────────────────────────────────────

/**
 * Coerce a number-input string to a number. A blank/non-numeric string becomes
 * NaN on purpose — the schema rejects NaN, which is how a missing required
 * number (e.g. lead_score_threshold.min) surfaces as a validation error
 * instead of a silent 0.
 */
function toNumber(s: string): number {
  const trimmed = s.trim();
  if (trimmed === '') return Number.NaN;
  return Number(trimmed);
}

/**
 * Build the trigger config. Discriminated by type; only the relevant fields
 * are read. Optional fields are omitted when blank so `.optional()` holds in
 * the schema rather than seeing an empty string.
 */
function buildTrigger(t: TriggerFormState): WorkflowTrigger {
  switch (t.type) {
    case 'lead_created':
      return { type: 'lead_created', config: {} };
    case 'lead_score_threshold':
      return { type: 'lead_score_threshold', config: { min: toNumber(t.min) } };
    case 'inbound_message':
      return {
        type: 'inbound_message',
        config: t.channel === 'any' ? { channel: 'any' } : { channel: t.channel },
      };
    case 'tour_completed':
      return { type: 'tour_completed', config: {} };
    case 'deal_stage_changed':
      return {
        type: 'deal_stage_changed',
        config: t.toStage.trim() ? { toStage: t.toStage.trim() } : {},
      };
    case 'integration_event':
      return {
        type: 'integration_event',
        config: { toolkit: t.toolkit.trim(), event: t.event.trim() },
      };
    case 'schedule':
      return {
        type: 'schedule',
        config:
          t.hour.trim() === ''
            ? { cadence: t.cadence }
            : { cadence: t.cadence, hour: toNumber(t.hour) },
      };
    default: {
      // Exhaustiveness guard — an unknown type still produces SOMETHING the
      // schema will reject rather than throwing here.
      const _never: never = t.type;
      return { type: _never, config: {} } as unknown as WorkflowTrigger;
    }
  }
}

/** Map one condition row to a ConditionRule, dropping value for exists ops. */
function buildRule(row: ConditionRowState): ConditionRule {
  const base = { field: row.field.trim(), operator: row.operator };
  if (VALUELESS_OPERATORS.has(row.operator)) return base;
  return { ...base, value: coerceConditionValue(row.value) };
}

/**
 * Coerce a condition value string into a comparable. Numbers stay numbers
 * (so gte/lt compare numerically), 'true'/'false' become booleans, everything
 * else stays a string. `value` is typed `unknown` in the schema, so this is a
 * convenience for the common cases, not a constraint.
 */
function coerceConditionValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  // Numeric-looking string → number. Guard against '' and whitespace via the
  // trimmed check above; Number('') is 0 which we don't want.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

/** Map one action row to a WorkflowAction by its type's config shape. */
function buildAction(row: ActionRowState): WorkflowAction {
  switch (row.type) {
    case 'draft_message':
      return {
        type: 'draft_message',
        config: { channel: row.channel, instruction: row.instruction.trim() },
      };
    case 'schedule_message':
      return {
        type: 'schedule_message',
        config: {
          channel: row.channel,
          instruction: row.instruction.trim(),
          delayMinutes: toNumber(row.delayMinutes),
        },
      };
    case 'create_task':
      return {
        type: 'create_task',
        config:
          row.dueInDays.trim() === ''
            ? { title: row.title.trim() }
            : { title: row.title.trim(), dueInDays: toNumber(row.dueInDays) },
      };
    case 'call_integration':
      return {
        type: 'call_integration',
        config: {
          toolkit: row.toolkit.trim(),
          action: row.action.trim(),
          ...buildParams(row.paramsJson),
        },
      };
    case 'run_chippi':
      return { type: 'run_chippi', config: { instruction: row.instruction.trim() } };
    default: {
      const _never: never = row.type;
      return { type: _never, config: {} } as unknown as WorkflowAction;
    }
  }
}

/**
 * Parse the optional params JSON for call_integration. Blank → omitted (no
 * `params` key). Valid JSON object → `{ params }`. Invalid JSON → a sentinel
 * the schema rejects so the realtor sees the error.
 */
function buildParams(json: string): { params?: Record<string, unknown> } {
  const trimmed = json.trim();
  if (trimmed === '') return {};
  try {
    const parsed = JSON.parse(trimmed);
    return { params: parsed as Record<string, unknown> };
  } catch {
    return { params: INVALID_JSON_SENTINEL as unknown as Record<string, unknown> };
  }
}

/**
 * Map the whole form to a WorkflowDefinition. Pure: never throws, never
 * validates. The caller runs parseWorkflowDefinition on the result to learn
 * whether the form is complete — an incomplete form yields a definition the
 * schema rejects (NaN numbers, blank required strings), which is the intended
 * signal back to the UI.
 */
export function buildDefinition(state: WorkflowFormState): WorkflowDefinition {
  // ADVANCED mode: the graph carries the whole logic. Emit empty linear
  // conditions/actions (the schema accepts an empty action list) so a half-
  // filled When/If/Then left behind in the form can't fail validation — the
  // graph's own nodes are validated by workflowGraphSchema.
  if (state.graph) {
    return {
      trigger: buildTrigger(state.trigger),
      conditions: { op: 'and', rules: [] },
      actions: [],
      autonomy: state.autonomy,
      graph: state.graph,
    };
  }

  const conditions: ConditionGroup = {
    op: state.conditionOp,
    rules: state.conditions.map(buildRule),
  };

  return {
    trigger: buildTrigger(state.trigger),
    conditions,
    actions: state.actions.map(buildAction),
    autonomy: state.autonomy,
  };
}
