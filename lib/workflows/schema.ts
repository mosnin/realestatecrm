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
  | 'deal_created'
  | 'contact_updated'
  | 'integration_event'
  | 'schedule'
  | 'webhook';

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
  // deal_created: fires when a new deal is opened in the CRM.
  z.object({ type: z.literal('deal_created'), config: z.object({}).strict() }),
  // contact_updated: fires when an existing contact record is edited.
  z.object({ type: z.literal('contact_updated'), config: z.object({}).strict() }),
  // webhook: fires when an HTTP POST arrives at /api/workflows/[id]/webhook.
  // config is empty — the URL is derived from the workflow id at display time.
  z.object({ type: z.literal('webhook'), config: z.object({}).strict() }),
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
  | 'run_chippi'
  | 'delay'
  | 'filter'
  | 'formatter'
  | 'webhook_post'
  | 'update_lead'
  | 'notify_agent'
  | 'iterate'
  | 'branch';

/**
 * Whitelisted fields the update_lead action can write on the Contact row.
 * Kept intentionally narrow — the executor validates against this list before
 * touching Supabase, so a tampered definition can't write arbitrary columns.
 */
export type UpdateLeadField =
  | 'score_label'     // set scoreLabel to hot/warm/cold
  | 'follow_up_in_days' // set followUpAt to now + N days
  | 'tag_add'         // append a tag to the tags array (idempotent)
  | 'tag_remove';     // remove a tag from the tags array

export const UPDATE_LEAD_FIELDS = [
  'score_label',
  'follow_up_in_days',
  'tag_add',
  'tag_remove',
] as const satisfies readonly UpdateLeadField[];

export type FormatterOperation =
  | 'uppercase'
  | 'lowercase'
  | 'capitalize'
  | 'trim'
  | 'replace'
  | 'number_format'
  | 'date_format'
  | 'extract_number'
  | 'extract_email'
  | 'extract_phone'
  | 'default_value'
  | 'truncate'
  | 'length'
  | 'split'
  | 'url_encode';

export const FORMATTER_OPERATIONS = [
  'uppercase',
  'lowercase',
  'capitalize',
  'trim',
  'replace',
  'number_format',
  'date_format',
  'extract_number',
  'extract_email',
  'extract_phone',
  'default_value',
  'truncate',
  'length',
  'split',
  'url_encode',
] as const satisfies readonly FormatterOperation[];

const channelSchema = z.enum(['sms', 'email']);
const instructionField = z.string().trim().min(1).max(LONG_TEXT);

/** Optional step label — a custom name the realtor gives a step (like Zapier's "Step name"). */
const stepLabel = z.string().trim().max(100).optional();
/** Optional private note on a step — for internal documentation, not sent anywhere. */
const stepNote = z.string().trim().max(500).optional();
/**
 * What to do if this step fails at runtime. Defaults to 'stop' (current
 * behaviour), matching Zapier's default error handling. 'skip' logs the
 * failure and continues with the next step — useful for non-critical side
 * effects (Slack pings, CRM log notes) that shouldn't derail the whole run.
 */
const stepOnError = z.enum(['stop', 'skip']).optional();
/** When false, the step is skipped at runtime (like Zapier's step disable toggle). */
const stepEnabled = z.boolean().optional();

/**
 * All action schemas EXCEPT branch — used as the element type for nested
 * actions inside branch paths (no branch-within-branch).
 */
export const innerWorkflowActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('draft_message'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({ channel: channelSchema, instruction: instructionField })
      .strict(),
  }),
  z.object({
    type: z.literal('schedule_message'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
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
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        title: shortText,
        dueInDays: z.number().int().min(0).optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal('call_integration'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
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
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z.object({ instruction: instructionField }).strict(),
  }),
  // delay: pause execution before the next step.
  // Two modes: relative (wait N minutes) or until_weekday (wait until the next
  // occurrence of a given weekday + hour). The executor computes the actual
  // delay minutes at runtime for until_weekday so the intent survives.
  z.object({
    type: z.literal('delay'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        delayMode: z.enum(['relative', 'until_weekday']).optional(),
        delayMinutes: z.number().int().min(1).optional(),
        untilWeekday: z.number().int().min(0).max(6).optional(),
        untilHour: z.number().int().min(0).max(23).optional(),
      })
      .superRefine((cfg, ctx) => {
        const mode = cfg.delayMode ?? 'relative';
        if (mode === 'relative') {
          if (cfg.delayMinutes === undefined || cfg.delayMinutes < 1) {
            ctx.addIssue({ code: 'custom', path: ['delayMinutes'], message: 'delayMinutes required for relative delay.' });
          }
        } else if (mode === 'until_weekday') {
          if (cfg.untilWeekday === undefined) {
            ctx.addIssue({ code: 'custom', path: ['untilWeekday'], message: 'untilWeekday required.' });
          }
          if (cfg.untilHour === undefined) {
            ctx.addIssue({ code: 'custom', path: ['untilHour'], message: 'untilHour required.' });
          }
        }
      }),
  }),
  // filter: stop the run if the field condition is not met.
  z.object({
    type: z.literal('filter'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        field: z.string().trim().min(1).max(SHORT_TEXT),
        operator: operatorSchema,
        value: z.unknown().optional(),
      })
      .strict(),
  }),
  // formatter: transform a value (text/number/date) before the next step uses it.
  z.object({
    type: z.literal('formatter'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        input: z.string().trim().min(1).max(SHORT_TEXT),
        operation: z.enum(FORMATTER_OPERATIONS),
        find: z.string().max(200).optional(),
        replacement: z.string().max(200).optional(),
        format: z.string().max(100).optional(),
        toFixed: z.number().int().min(0).max(20).optional(),
        fallback: z.string().max(500).optional(),
        truncateLength: z.number().int().min(1).max(10000).optional(),
        truncateSuffix: z.string().max(20).optional(),
        splitSeparator: z.string().max(50).optional(),
        splitIndex: z.number().int().min(1).optional(),
      })
      .strict(),
  }),
  // webhook_post: POST to an external URL (HTTPS only, SSRF-guarded in the executor).
  z.object({
    type: z.literal('webhook_post'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        url: z.string().url().max(2000).refine((u) => u.startsWith('https://'), {
          message: 'Webhook URL must use HTTPS.',
        }),
        bodyJson: z.string().max(4000).optional(),
        headersJson: z.string().max(1000).optional(),
      })
      .strict(),
  }),
  // update_lead: write a whitelisted field back to the Contact row that triggered
  // this workflow (score_label, follow_up_in_days, tag_add, tag_remove).
  z.object({
    type: z.literal('update_lead'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        field: z.enum(UPDATE_LEAD_FIELDS),
        value: z.string().trim().min(1).max(SHORT_TEXT),
      })
      .strict(),
  }),
  // notify_agent: send a push notification to the realtor's subscribed device(s).
  // Like Zapier's "Send yourself an email" — a lightweight personal alert step.
  z.object({
    type: z.literal('notify_agent'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        title: z.string().trim().min(1).max(SHORT_TEXT),
        body: z.string().trim().max(500).optional(),
      })
      .strict(),
  }),
  // iterate: loop over a list (e.g. lead.tags) and apply an instruction to each item.
  z.object({
    type: z.literal('iterate'),
    label: stepLabel,
    note: stepNote,
    onError: stepOnError,
    enabled: stepEnabled,
    config: z
      .object({
        source: z.string().trim().min(1).max(SHORT_TEXT),
        instruction: z.string().trim().min(1).max(LONG_TEXT),
        limit: z.number().int().min(1).max(50).optional(),
        outputField: z.string().trim().max(100).optional(),
      })
      .strict(),
  }),
]);

export type InnerWorkflowAction = z.infer<typeof innerWorkflowActionSchema>;

/**
 * branch: Zapier-style "Paths" step. Routes execution down the FIRST path
 * whose condition matches. If no path matches and defaultActions is set,
 * those run instead. Nested actions are InnerWorkflowAction (no branch-in-branch).
 */
const branchPathSchema = z
  .object({
    label: z.string().trim().max(100).optional(),
    field: z.string().trim().min(1).max(SHORT_TEXT),
    operator: operatorSchema,
    value: z.unknown().optional(),
    actions: z.array(innerWorkflowActionSchema).min(1).max(10),
  })
  .strict();

export const branchActionSchema = z.object({
  type: z.literal('branch'),
  label: stepLabel,
  note: stepNote,
  onError: stepOnError,
  enabled: stepEnabled,
  config: z
    .object({
      paths: z.array(branchPathSchema).min(1).max(4),
      defaultActions: z.array(innerWorkflowActionSchema).max(10).optional(),
    })
    .strict(),
});

export type BranchAction = z.infer<typeof branchActionSchema>;

/**
 * Full action schema including branch. The outer union wraps the inner
 * discriminated union (12 types) plus branch.
 */
export const workflowActionSchema = z.union([innerWorkflowActionSchema, branchActionSchema]);

export type WorkflowAction = z.infer<typeof workflowActionSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Branching graph (ADVANCED mode) — an OPTIONAL directed acyclic graph the
// advanced canvas authors. A linear workflow keeps using `actions[]`; a
// workflow that needs to branch ("if hot → text, if warm → schedule, else →
// task") stores a `graph` instead. The two are alternatives, never both: when
// `graph` is present the engine walks it; otherwise it runs the linear
// `actions[]` exactly as before. This keeps the existing model — and every test
// that exercises it — untouched, and lets branching land additively.
//
// Node kinds:
//   - trigger   : the single entry anchor (the real trigger config lives on the
//                 definition's `trigger`; this node is where the graph starts).
//   - condition : a gate carrying a ConditionGroup; its outgoing edges are
//                 labeled `true` / `false` for the matched / unmatched branch.
//   - action    : one WorkflowAction.
// Edges are directed (`from` → `to`); a `branch` label is only meaningful on an
// edge leaving a condition node. The whole graph must be acyclic.
// ───────────────────────────────────────────────────────────────────────────

/** Max nodes in a workflow graph (keeps a canvas — and the walk — bounded). */
export const MAX_GRAPH_NODES = 40;
/** Max edges in a workflow graph. */
export const MAX_GRAPH_EDGES = 80;
/** Stable node-id length bound (the canvas generates these). */
const NODE_ID = 64;

export type WorkflowNodeKind = 'trigger' | 'condition' | 'action';

export interface TriggerNode {
  id: string;
  kind: 'trigger';
}
export interface ConditionNode {
  id: string;
  kind: 'condition';
  condition: ConditionGroup;
}
export interface ActionNode {
  id: string;
  kind: 'action';
  action: WorkflowAction;
}
export type WorkflowNode = TriggerNode | ConditionNode | ActionNode;

export interface WorkflowEdge {
  from: string;
  to: string;
  /** Only valid on an edge OUT of a condition node: which branch it represents. */
  branch?: 'true' | 'false';
}

export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const nodeIdSchema = z.string().trim().min(1).max(NODE_ID);

const workflowNodeSchema = z.discriminatedUnion('kind', [
  z.object({ id: nodeIdSchema, kind: z.literal('trigger') }).strict(),
  z
    .object({ id: nodeIdSchema, kind: z.literal('condition'), condition: conditionGroupSchema })
    .strict(),
  z
    .object({ id: nodeIdSchema, kind: z.literal('action'), action: workflowActionSchema })
    .strict(),
]);

const workflowEdgeSchema = z
  .object({
    from: nodeIdSchema,
    to: nodeIdSchema,
    branch: z.enum(['true', 'false']).optional(),
  })
  .strict();

/** Depth-first cycle check over the edge list. Returns true if a cycle exists. */
function graphHasCycle(nodeIds: Set<string>, edges: WorkflowEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const list = adj.get(e.from);
    if (list) list.push(e.to);
    else adj.set(e.from, [e.to]);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  let cycle = false;
  // Iterative DFS with an explicit color map (recursion would be fine at N≤40,
  // but an explicit walk avoids any stack-depth surprise and is easy to read).
  const visit = (start: string) => {
    const stack: string[] = [start];
    while (stack.length) {
      const u = stack[stack.length - 1];
      const c = color.get(u) ?? WHITE;
      if (c === WHITE) {
        color.set(u, GRAY);
        for (const v of adj.get(u) ?? []) {
          const cv = color.get(v) ?? WHITE;
          if (cv === GRAY) {
            cycle = true;
            return;
          }
          if (cv === WHITE) stack.push(v);
        }
      } else {
        if (c === GRAY) color.set(u, BLACK);
        stack.pop();
      }
    }
  };
  for (const id of nodeIds) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      visit(id);
      if (cycle) return true;
    }
  }
  return false;
}

export const workflowGraphSchema: z.ZodType<WorkflowGraph> = z
  .object({
    nodes: z.array(workflowNodeSchema).min(1).max(MAX_GRAPH_NODES),
    edges: z.array(workflowEdgeSchema).max(MAX_GRAPH_EDGES),
  })
  .strict()
  .superRefine((graph, ctx) => {
    // Unique ids.
    const ids = new Set<string>();
    for (const n of graph.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate node id: ${n.id}`, path: ['nodes'] });
      }
      ids.add(n.id);
    }

    // Exactly one trigger node (the entry point).
    const triggerCount = graph.nodes.filter((n) => n.kind === 'trigger').length;
    if (triggerCount !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `graph must have exactly one trigger node (found ${triggerCount})`,
        path: ['nodes'],
      });
    }

    const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));

    // Edge integrity + branch-label rules.
    const branchSeen = new Map<string, Set<string>>();
    graph.edges.forEach((e, i) => {
      if (!ids.has(e.from)) {
        ctx.addIssue({ code: 'custom', message: `edge.from references unknown node: ${e.from}`, path: ['edges', i, 'from'] });
      }
      if (!ids.has(e.to)) {
        ctx.addIssue({ code: 'custom', message: `edge.to references unknown node: ${e.to}`, path: ['edges', i, 'to'] });
      }
      if (e.from === e.to) {
        ctx.addIssue({ code: 'custom', message: 'an edge cannot loop a node to itself', path: ['edges', i] });
      }
      // Nothing may point AT the trigger (it's the entry).
      if (nodeById.get(e.to)?.kind === 'trigger') {
        ctx.addIssue({ code: 'custom', message: 'the trigger node cannot have incoming edges', path: ['edges', i, 'to'] });
      }
      if (e.branch !== undefined) {
        const src = nodeById.get(e.from);
        if (src && src.kind !== 'condition') {
          ctx.addIssue({ code: 'custom', message: 'a branch label is only valid on an edge out of a condition node', path: ['edges', i, 'branch'] });
        }
        const seen = branchSeen.get(e.from) ?? new Set<string>();
        if (seen.has(e.branch)) {
          ctx.addIssue({ code: 'custom', message: `condition node ${e.from} already has a "${e.branch}" branch`, path: ['edges', i, 'branch'] });
        }
        seen.add(e.branch);
        branchSeen.set(e.from, seen);
      }
    });

    // Acyclic.
    if (graphHasCycle(ids, graph.edges)) {
      ctx.addIssue({ code: 'custom', message: 'the workflow graph must be acyclic (a cycle was detected)', path: ['edges'] });
    }
  }) as unknown as z.ZodType<WorkflowGraph>;

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
  /**
   * OPTIONAL advanced-mode branching graph. When present, the engine walks the
   * graph instead of the linear `actions[]`. Absent for every linear workflow
   * (the default), so the existing model is fully backward-compatible.
   */
  graph?: WorkflowGraph;
}

export const workflowDefinitionSchema = z
  .object({
    trigger: workflowTriggerSchema,
    conditions: conditionGroupSchema,
    actions: z.array(workflowActionSchema).max(MAX_ACTIONS),
    autonomy: workflowAutonomySchema,
    graph: workflowGraphSchema.optional(),
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
