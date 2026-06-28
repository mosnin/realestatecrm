/**
 * Workflow definition — TS types + Zod validators for the three JSONB shapes
 * stored on the "Workflow" table (trigger / conditions / actions) plus the
 * autonomy enum.
 *
 * Postgres only guarantees these columns are JSON; the real validation lives
 * here and runs in the API layer before any write. Keep the configs minimal and
 * typed — a workflow is data the realtor (or Chippi) authors, not free text.
 *
 * The trigger vocabulary deliberately overlaps the autonomous EVENT names in
 * lib/agent/trigger-policy.ts (inbound_message, tour_completed,
 * deal_stage_changed) so the two systems speak the same language where they
 * map; the workflow types add their own config object per trigger.
 *
 * This is the FOUNDATION pass: shapes + validation only. No executor, no
 * actions runtime — those land later and consume these types.
 */

import { z } from 'zod';

// ───────────────────────────────────────────────────────────────────────────
// Bounds. Kept here so the schemas and any caller agree on payload limits.
// ───────────────────────────────────────────────────────────────────────────

/** Maximum nesting depth of a condition tree (root group counts as depth 1). */
export const MAX_CONDITION_DEPTH = 5;
/** Maximum number of rules in a single condition group. */
export const MAX_RULES_PER_GROUP = 50;
/** Maximum number of actions in a workflow. */
export const MAX_ACTIONS = 20;
/** Generic upper bound for short free-text fields (names, stages, channels). */
const SHORT_TEXT = 200;
/** Upper bound for instruction-style fields handed to the model. */
const LONG_TEXT = 4000;

// ───────────────────────────────────────────────────────────────────────────
// Trigger — WHEN a workflow fires. Discriminated union on `type`, each variant
// carrying its own `config`.
// ───────────────────────────────────────────────────────────────────────────

export type TriggerType =
  | 'lead_created'
  | 'lead_score_threshold'
  | 'inbound_message'
  | 'tour_completed'
  | 'deal_stage_changed'
  | 'integration_event'
  | 'schedule';

const shortText = z.string().trim().min(1).max(SHORT_TEXT);

export const workflowTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead_created'), config: z.object({}).strict() }),
  z.object({
    type: z.literal('lead_score_threshold'),
    // Fires when a lead's score crosses `min`.
    config: z.object({ min: z.number() }).strict(),
  }),
  z.object({
    type: z.literal('inbound_message'),
    config: z
      .object({ channel: z.enum(['sms', 'email', 'any']).optional() })
      .strict(),
  }),
  z.object({ type: z.literal('tour_completed'), config: z.object({}).strict() }),
  z.object({
    type: z.literal('deal_stage_changed'),
    config: z.object({ toStage: shortText.optional() }).strict(),
  }),
  z.object({
    type: z.literal('integration_event'),
    config: z.object({ toolkit: shortText, event: shortText }).strict(),
  }),
  z.object({
    type: z.literal('schedule'),
    config: z
      .object({
        cadence: z.enum(['hourly', 'daily', 'weekdays']),
        hour: z.number().int().min(0).max(23).optional(),
      })
      .strict(),
  }),
]);

export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Conditions — IF a boolean tree over the trigger context holds.
// ───────────────────────────────────────────────────────────────────────────

export type Operator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'not_contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists'
  | 'starts_with'
  | 'ends_with';

export const OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'in',
  'not_in',
  'exists',
  'not_exists',
  'starts_with',
  'ends_with',
] as const satisfies readonly Operator[];

export const operatorSchema = z.enum(OPERATORS);

export interface ConditionRule {
  /** Dotted path into the trigger context, e.g. 'lead.score' or 'tags.0'. */
  field: string;
  operator: Operator;
  /** Comparison operand; omitted for exists/not_exists. */
  value?: unknown;
}

export interface ConditionGroup {
  op: 'and' | 'or';
  rules: Array<ConditionRule | ConditionGroup>;
}

export const conditionRuleSchema: z.ZodType<ConditionRule> = z
  .object({
    field: z.string().trim().min(1).max(SHORT_TEXT),
    operator: operatorSchema,
    // `value` is intentionally unconstrained in type but capped in size below;
    // the evaluator coerces per operator. unknown() keeps it optional+typed.
    value: z.unknown().optional(),
  })
  .strict();

/**
 * Build a condition-group schema bounded to `depth` levels of nesting. Zod has
 * no native depth limit on recursive schemas, so we construct a finite chain:
 * the base level allows only rules; each level above also allows groups one
 * level shallower. depth=1 => leaf-rules only; depth=MAX_CONDITION_DEPTH =>
 * the public root. This rejects over-deep trees at parse time rather than
 * trusting the evaluator to bail.
 */
function buildConditionGroupSchema(depth: number): z.ZodType<ConditionGroup> {
  const member: z.ZodType<ConditionRule | ConditionGroup> =
    depth <= 1
      ? conditionRuleSchema
      : z.union([conditionRuleSchema, buildConditionGroupSchema(depth - 1)]);

  return z
    .object({
      op: z.enum(['and', 'or']),
      rules: z.array(member).max(MAX_RULES_PER_GROUP),
    })
    .strict() as z.ZodType<ConditionGroup>;
}

export const conditionGroupSchema: z.ZodType<ConditionGroup> =
  buildConditionGroupSchema(MAX_CONDITION_DEPTH);

// ───────────────────────────────────────────────────────────────────────────
// Actions — THEN, an ordered list of effects. Discriminated union on `type`.
// Configs are deliberately minimal; the executor pass fills in the runtime.
// ───────────────────────────────────────────────────────────────────────────

export type WorkflowActionType =
  | 'draft_message'
  | 'schedule_message'
  | 'create_task'
  | 'call_integration'
  | 'run_chippi';

const channelSchema = z.enum(['sms', 'email']);
const instructionField = z.string().trim().min(1).max(LONG_TEXT);

export const workflowActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('draft_message'),
    config: z
      .object({ channel: channelSchema, instruction: instructionField })
      .strict(),
  }),
  z.object({
    type: z.literal('schedule_message'),
    config: z
      .object({
        channel: channelSchema,
        instruction: instructionField,
        delayMinutes: z.number().int().min(0),
      })
      .strict(),
  }),
  z.object({
    type: z.literal('create_task'),
    config: z
      .object({
        title: shortText,
        dueInDays: z.number().int().min(0).optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal('call_integration'),
    config: z
      .object({
        toolkit: shortText,
        action: shortText,
        params: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal('run_chippi'),
    config: z.object({ instruction: instructionField }).strict(),
  }),
]);

export type WorkflowAction = z.infer<typeof workflowActionSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Autonomy + the assembled definition.
// ───────────────────────────────────────────────────────────────────────────

export type WorkflowAutonomy = 'draft' | 'notify' | 'auto';

export const workflowAutonomySchema = z.enum(['draft', 'notify', 'auto']);

export interface WorkflowDefinition {
  trigger: WorkflowTrigger;
  conditions: ConditionGroup;
  actions: WorkflowAction[];
  autonomy: WorkflowAutonomy;
}

export const workflowDefinitionSchema = z
  .object({
    trigger: workflowTriggerSchema,
    conditions: conditionGroupSchema,
    actions: z.array(workflowActionSchema).max(MAX_ACTIONS),
    autonomy: workflowAutonomySchema,
  })
  .strict();

/**
 * Error thrown by parseWorkflowDefinition on invalid input. Named so callers
 * (and tests) can distinguish a malformed definition from any other failure.
 */
export class WorkflowDefinitionError extends Error {
  override readonly name = 'WorkflowDefinitionError';
  /** The underlying Zod issues, for surfacing field-level messages in the UI. */
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    const summary = issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    super(`Invalid workflow definition: ${summary}`);
    this.issues = issues;
  }
}

/**
 * Parse + validate an unknown input into a WorkflowDefinition. Throws a
 * WorkflowDefinitionError (never a raw ZodError) on failure so callers have a
 * single, named error type to catch.
 */
export function parseWorkflowDefinition(input: unknown): WorkflowDefinition {
  const result = workflowDefinitionSchema.safeParse(input);
  if (!result.success) {
    throw new WorkflowDefinitionError(result.error.issues);
  }
  return result.data;
}
