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
  FormatterOperation,
  InnerWorkflowAction,
  Operator,
  TriggerType,
  UpdateLeadField,
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
  /** webhook: optional HMAC-SHA256 signing secret (min 8 chars). Blank = unsigned. */
  webhookSecret?: string;
}

export interface ConditionRowState {
  /** Stable key for React lists; not part of the definition. */
  id: string;
  field: string;
  operator: Operator;
  value: string;
}

/** A nested condition group (AND block within an OR list, or vice-versa). */
export interface ConditionGroupFormState {
  id: string;
  /** Discriminant that separates this from a flat ConditionRowState. */
  type: 'group';
  op: 'and' | 'or';
  rules: ConditionRowState[];
}

/** One path lane in a branch step's config. */
export interface BranchPathFormState {
  /** Stable key for React lists. */
  id: string;
  /** Optional label shown on the path lane header. */
  label: string;
  /** Dot-path into workflow context (e.g. 'lead.score'). */
  field: string;
  operator: Operator;
  /** Comparison value (string; coerced on build). */
  value: string;
  /** Nested actions for this path (no branch-in-branch). */
  actions: ActionRowState[];
}

export interface ActionRowState {
  id: string;
  type: WorkflowActionType;
  /** Optional custom step name shown in the card header (Zapier-style). */
  label?: string;
  /** Optional private note for internal documentation — not executed or sent. */
  note?: string;
  /** What to do if this step errors: 'stop' (default), 'skip' and continue, or 'retry' with backoff. */
  onError?: 'stop' | 'skip' | 'retry';
  /** Number of retry attempts when onError='retry'. 1–5; defaults to 3. Stored as string off number input. */
  retryCount: string;
  /** When false, this step is skipped at runtime (Zapier-style step disable). Defaults to true. */
  stepEnabled: boolean;
  /** draft_message / schedule_message. */
  channel: 'sms' | 'email';
  /** draft_message / schedule_message / run_chippi. */
  instruction: string;
  /** schedule_message / delay (relative mode): numeric amount (string off a number input). */
  delayMinutes: string;
  /** delay: the display unit. Converted to minutes by buildAction. */
  delayUnit: 'minutes' | 'hours' | 'days' | 'weeks';
  /** delay: mode — 'relative', 'until_weekday', or 'until_date'. */
  delayMode: 'relative' | 'until_weekday' | 'until_date';
  /** delay (until_weekday mode): 0=Sun … 6=Sat. */
  untilWeekday: string;
  /** delay (until_weekday mode): 0-23 hour. */
  untilHour: string;
  /** delay (until_date mode): ISO date string YYYY-MM-DD. */
  untilDate: string;
  /** create_task. */
  title: string;
  dueInDays: string;
  /** call_integration. */
  toolkit: string;
  action: string;
  /** call_integration params as a JSON string; blank = omit. */
  paramsJson: string;
  /** filter: field path (e.g. 'lead.score'). */
  filterField: string;
  /** filter: comparison operator. */
  filterOperator: Operator;
  /** filter: comparison value (string; coerced on build). */
  filterValue: string;
  /** formatter: dotted path or literal value to transform (e.g. 'lead.name'). */
  formatterInput: string;
  /** formatter: the transform to apply. */
  formatterOperation: FormatterOperation;
  /** formatter: search string for 'replace'. */
  formatterFind: string;
  /** formatter: replacement string for 'replace'. */
  formatterReplace: string;
  /** formatter: date format string for 'date_format' (e.g. 'MM/DD/YYYY'). */
  formatterFormat: string;
  /** formatter: decimal places for 'number_format' (as string off a number input). */
  formatterToFixed: string;
  /** formatter: fallback value used when input is blank ('default_value'). */
  formatterFallback: string;
  /** formatter: max character count for 'truncate' (string off number input). */
  formatterTruncateLength: string;
  /** formatter: suffix appended after truncating, e.g. '…' ('truncate'). */
  formatterTruncateSuffix: string;
  /** formatter: delimiter for 'split'. */
  formatterSplitSeparator: string;
  /** formatter: 1-based part index for 'split'. */
  formatterSplitIndex: string;
  /** webhook_post: target HTTPS URL. */
  webhookUrl: string;
  /** webhook_post: JSON body template (optional, {{tokens}} supported). */
  webhookBody: string;
  /** webhook_post: extra headers as JSON object string (optional). */
  webhookHeaders: string;
  /** update_lead: which Contact column to update. */
  updateField: UpdateLeadField;
  /** update_lead: the value to set (supports {{tokens}}). */
  updateValue: string;
  /** notify_agent: notification title (supports {{tokens}}). */
  notifyTitle: string;
  /** notify_agent: notification body text (optional, supports {{tokens}}). */
  notifyBody: string;
  /** branch: the conditional path lanes. */
  branchPaths?: BranchPathFormState[];
}

export interface WorkflowFormState {
  name: string;
  /** Optional short annotation shown on the workflow list card — Zapier-style Zap description. */
  description?: string;
  trigger: TriggerFormState;
  conditionOp: 'and' | 'or';
  /** Flat rules + optional nested groups (at most one level deep). */
  conditions: Array<ConditionRowState | ConditionGroupFormState>;
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
    case 'deal_created':
      return { type: 'deal_created', config: {} };
    case 'contact_updated':
      return { type: 'contact_updated', config: {} };
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
    case 'webhook': {
      const secret = t.webhookSecret?.trim();
      return { type: 'webhook', config: secret && secret.length >= 8 ? { webhookSecret: secret } : {} };
    }
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
export function buildAction(row: ActionRowState): WorkflowAction {
  const label = row.label?.trim() || undefined;
  const note = row.note?.trim() || undefined;
  const onError = row.onError === 'skip' ? 'skip' : row.onError === 'retry' ? 'retry' : undefined;
  const maxRetriesProp = row.onError === 'retry' && row.retryCount.trim() !== '' ? { maxRetries: Math.max(1, Math.min(5, Number(row.retryCount) || 3)) } : {};
  const enabledProp = row.stepEnabled === false ? { enabled: false as const } : {};
  switch (row.type) {
    case 'draft_message':
      return {
        type: 'draft_message',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: { channel: row.channel, instruction: row.instruction.trim() },
      };
    case 'schedule_message': {
      const smMultiplier = row.delayUnit === 'weeks' ? 10080 : row.delayUnit === 'days' ? 1440 : row.delayUnit === 'hours' ? 60 : 1;
      return {
        type: 'schedule_message',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: {
          channel: row.channel,
          instruction: row.instruction.trim(),
          delayMinutes: toNumber(row.delayMinutes) * smMultiplier,
        },
      };
    }
    case 'create_task':
      return {
        type: 'create_task',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config:
          row.dueInDays.trim() === ''
            ? { title: row.title.trim() }
            : { title: row.title.trim(), dueInDays: toNumber(row.dueInDays) },
      };
    case 'call_integration':
      return {
        type: 'call_integration',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: {
          toolkit: row.toolkit.trim(),
          action: row.action.trim(),
          ...buildParams(row.paramsJson),
        },
      };
    case 'run_chippi':
      return {
        type: 'run_chippi',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: { instruction: row.instruction.trim() },
      };
    case 'delay': {
      const multiplier = row.delayUnit === 'weeks' ? 10080 : row.delayUnit === 'days' ? 1440 : row.delayUnit === 'hours' ? 60 : 1;
      const delayMeta = {
        type: 'delay' as const,
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
      };
      if (row.delayMode === 'until_weekday') {
        return { ...delayMeta, config: { delayMode: 'until_weekday' as const, untilWeekday: toNumber(row.untilWeekday), untilHour: toNumber(row.untilHour) } } as WorkflowAction;
      }
      if (row.delayMode === 'until_date') {
        return { ...delayMeta, config: { delayMode: 'until_date' as const, untilDate: row.untilDate.trim() } } as WorkflowAction;
      }
      return { ...delayMeta, config: { delayMode: 'relative' as const, delayMinutes: toNumber(row.delayMinutes) * multiplier } } as WorkflowAction;
    }
    case 'filter': {
      const base = { field: row.filterField.trim(), operator: row.filterOperator };
      return {
        type: 'filter',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: VALUELESS_OPERATORS.has(row.filterOperator)
          ? base
          : { ...base, value: coerceConditionValue(row.filterValue) },
      };
    }
    case 'webhook_post': {
      const url = row.webhookUrl.trim();
      const bodyJson = row.webhookBody.trim() || undefined;
      const headersJson = row.webhookHeaders.trim() || undefined;
      return {
        type: 'webhook_post',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: { url, ...(bodyJson ? { bodyJson } : {}), ...(headersJson ? { headersJson } : {}) },
      };
    }
    case 'update_lead':
      return {
        type: 'update_lead',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: { field: row.updateField, value: row.updateValue.trim() },
      };
    case 'notify_agent': {
      const body = row.notifyBody.trim();
      return {
        type: 'notify_agent',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: { title: row.notifyTitle.trim(), ...(body ? { body } : {}) },
      };
    }
    case 'iterate': {
      const limitStr = row.delayMinutes.trim();
      return {
        type: 'iterate',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: {
          source: row.filterField.trim() || 'lead.tags',
          instruction: row.instruction.trim() || 'Process {{item}}',
          ...(limitStr && !isNaN(Number(limitStr)) ? { limit: Number(limitStr) } : {}),
        },
      };
    }
    case 'branch': {
      return {
        type: 'branch',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: {
          paths: (row.branchPaths ?? []).map((p) => ({
            ...(p.label.trim() ? { label: p.label.trim() } : {}),
            field: p.field.trim(),
            operator: p.operator,
            ...(VALUELESS_OPERATORS.has(p.operator) ? {} : { value: coerceConditionValue(p.value) }),
            actions: p.actions.map(buildAction) as InnerWorkflowAction[],
          })),
        },
      };
    }
    case 'formatter': {
      const op = row.formatterOperation;
      type FormatterConfig = {
        input: string;
        operation: FormatterOperation;
        find?: string;
        replacement?: string;
        format?: string;
        toFixed?: number;
        fallback?: string;
        truncateLength?: number;
        truncateSuffix?: string;
        splitSeparator?: string;
        splitIndex?: number;
      };
      const cfg: FormatterConfig = { input: row.formatterInput.trim(), operation: op };
      if (op === 'replace') {
        if (row.formatterFind) cfg.find = row.formatterFind;
        cfg.replacement = row.formatterReplace;
      }
      if (op === 'date_format' && row.formatterFormat.trim()) cfg.format = row.formatterFormat.trim();
      if (op === 'number_format' && row.formatterToFixed.trim() !== '') {
        cfg.toFixed = toNumber(row.formatterToFixed);
      }
      if (op === 'default_value') cfg.fallback = row.formatterFallback;
      if (op === 'truncate') {
        if (row.formatterTruncateLength.trim() !== '') cfg.truncateLength = toNumber(row.formatterTruncateLength);
        if (row.formatterTruncateSuffix !== '') cfg.truncateSuffix = row.formatterTruncateSuffix;
      }
      if (op === 'split') {
        cfg.splitSeparator = row.formatterSplitSeparator || ',';
        if (row.formatterSplitIndex.trim() !== '') cfg.splitIndex = toNumber(row.formatterSplitIndex);
      }
      return {
        type: 'formatter',
        ...(label ? { label } : {}),
        ...(note ? { note } : {}),
        ...(onError ? { onError } : {}),
        ...maxRetriesProp,
        ...enabledProp,
        config: cfg,
      };
    }
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
    rules: state.conditions.map((item) => {
      if ('type' in item && item.type === 'group') {
        return { op: item.op, rules: item.rules.map(buildRule) } satisfies ConditionGroup;
      }
      return buildRule(item as ConditionRowState);
    }),
  };

  return {
    trigger: buildTrigger(state.trigger),
    conditions,
    actions: state.actions.map(buildAction),
    autonomy: state.autonomy,
  };
}
