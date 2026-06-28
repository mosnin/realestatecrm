/**
 * Workflow TEMPLATES — ready-made presets the realtor can start from.
 *
 * Each template carries a `name`, a `description` (the human one-liner shown in
 * the picker) and a full `WorkflowFormState` that pre-fills the builder. We
 * store the FORM state (not the WorkflowDefinition) so picking a template drops
 * the realtor straight into an editable builder with every field populated —
 * buildDefinition + parseWorkflowDefinition then run on save exactly as if they
 * had typed it.
 *
 * The marquee template — "Hot lead → instant draft" — is the demo: a lead
 * crosses score 80, Chippi drafts a warm SMS intro, and (draft autonomy) the
 * realtor approves it. The others show the breadth: an inbound Gmail reply and
 * a scheduled morning follow-up sweep.
 */

import type { WorkflowFormState } from './build-definition';
import type { WorkflowGraph } from '@/lib/workflows/schema';

export type TemplateCategory =
  | 'New leads'
  | 'Follow-up'
  | 'Scheduling'
  | 'Integrations';

export interface WorkflowTemplate {
  /** Stable id for the picker. */
  id: string;
  name: string;
  /** One-line human summary shown in the template picker. */
  description: string;
  /** Category shown in the gallery filter pills. */
  category: TemplateCategory;
  /** Pre-filled builder state. Cloned on pick so edits don't mutate the preset. */
  state: WorkflowFormState;
}

/** Empty trigger sub-state with sensible field defaults (only the relevant
 *  fields per trigger type are read by buildDefinition). */
function baseTrigger(): WorkflowFormState['trigger'] {
  return {
    type: 'lead_created',
    min: '',
    channel: 'any',
    toolkit: '',
    event: '',
    toStage: '',
    cadence: 'daily',
    hour: '',
  };
}

let counter = 0;
function rowId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** A condition row pre-filled. */
function condition(
  field: string,
  operator: WorkflowFormState['conditions'][number]['operator'],
  value: string,
): WorkflowFormState['conditions'][number] {
  return { id: rowId('cond'), field, operator, value };
}

/** A blank action row with all per-type fields defaulted. */
function blankAction(): WorkflowFormState['actions'][number] {
  return {
    id: rowId('act'),
    type: 'draft_message',
    channel: 'sms',
    instruction: '',
    delayMinutes: '',
    delayUnit: 'minutes',
    title: '',
    dueInDays: '',
    toolkit: '',
    action: '',
    paramsJson: '',
    filterField: '',
    filterOperator: 'eq',
    filterValue: '',
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'hot-lead-instant-draft',
    name: 'Hot lead → instant draft',
    description: 'When a new lead scores 80 or higher, draft a warm intro text.',
    category: 'New leads',
    state: {
      name: 'Hot lead → instant draft',
      trigger: { ...baseTrigger(), type: 'lead_score_threshold', min: '80' },
      conditionOp: 'and',
      conditions: [condition('lead.score', 'gte', '80')],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a warm, personal intro to this new high-intent lead and reference their interest.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'gmail-client-reply',
    name: 'New Gmail from a client → draft a reply',
    description: 'When an email lands from a known contact, draft a reply for me.',
    category: 'Integrations',
    state: {
      name: 'New Gmail from a client → draft a reply',
      trigger: {
        ...baseTrigger(),
        type: 'integration_event',
        toolkit: 'gmail',
        event: 'new_message',
      },
      conditionOp: 'and',
      conditions: [condition('contact.name', 'exists', '')],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'email',
          instruction:
            'Read the inbound email and draft a friendly, on-brand reply that moves the conversation forward.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'morning-follow-ups',
    name: 'Every weekday 8am → draft my morning follow-ups',
    description: 'Each weekday morning, draft check-ins for leads that have gone quiet.',
    category: 'Scheduling',
    state: {
      name: 'Every weekday 8am → draft my morning follow-ups',
      trigger: { ...baseTrigger(), type: 'schedule', cadence: 'weekdays', hour: '8' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'Review my pipeline and draft a short, personal follow-up for every lead I have not contacted in over a week.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'tour-completed-thanks',
    name: 'After a tour → thank-you + next step',
    description: 'When a tour wraps, draft a thank-you and set a follow-up task.',
    category: 'Follow-up',
    state: {
      name: 'After a tour → thank-you + next step',
      trigger: { ...baseTrigger(), type: 'tour_completed' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a warm thank-you for the tour and ask for their honest take on the home.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Follow up after tour',
          dueInDays: '2',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'new-lead-welcome',
    name: 'New lead → instant welcome',
    description: 'The moment a new lead comes in, draft a warm welcome text and create a follow-up task.',
    category: 'New leads',
    state: {
      name: 'New lead → instant welcome',
      trigger: { ...baseTrigger(), type: 'lead_created' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a short, warm welcome to this brand-new lead. Make it personal, mention you saw their inquiry, and ask when they are available to chat.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Call new lead within 24 hours',
          dueInDays: '1',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'deal-stage-changed-notify',
    name: 'Deal moves stage → Chippi updates CRM',
    description: 'When a deal advances, ask Chippi to log a note and draft a client update.',
    category: 'Follow-up',
    state: {
      name: 'Deal moves stage → Chippi updates CRM',
      trigger: { ...baseTrigger(), type: 'deal_stage_changed', toStage: '' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'The deal just moved to a new stage. Log a brief CRM note about the stage change and draft a short client update explaining what happens next.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'inbound-inquiry-multi-step',
    name: 'Inbound inquiry → draft reply + task',
    description: 'When a new message arrives, draft a reply and set a follow-up reminder.',
    category: 'Follow-up',
    state: {
      name: 'Inbound inquiry → draft reply + task',
      trigger: { ...baseTrigger(), type: 'inbound_message', channel: 'any' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Read the inbound message and draft a prompt, helpful reply that addresses their question and invites a next step.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Follow up if no response in 48h',
          dueInDays: '2',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'webhook-any-service',
    name: 'Webhook → Chippi takes action',
    description: 'Trigger from any external service via HTTP POST — Chippi handles the rest.',
    category: 'Integrations',
    state: {
      name: 'Webhook → Chippi takes action',
      trigger: { ...baseTrigger(), type: 'webhook' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'A webhook just fired with a payload. Review what arrived and decide the best next action for this real estate contact.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'hot-vs-warm-branch',
    name: 'Hot vs warm → different play',
    description: 'If the lead is hot, text now; if not, schedule a follow-up.',
    category: 'New leads',
    state: {
      name: 'Hot vs warm → different play',
      // ADVANCED template: the graph carries the branching logic; the linear
      // conditions/actions stay empty (buildDefinition emits empty ones).
      trigger: { ...baseTrigger(), type: 'lead_score_threshold', min: '80' },
      conditionOp: 'and',
      conditions: [],
      actions: [],
      autonomy: 'draft',
      graph: hotVsWarmGraph(),
    },
  },
];

/**
 * The branching graph for the "Hot vs warm" template:
 *   trigger → condition(lead.score ≥ 80)
 *     true  → draft an SMS now
 *     false → schedule a follow-up message
 */
function hotVsWarmGraph(): WorkflowGraph {
  return {
    nodes: [
      { id: 't', kind: 'trigger' },
      {
        id: 'c',
        kind: 'condition',
        condition: { op: 'and', rules: [{ field: 'lead.score', operator: 'gte', value: 80 }] },
      },
      {
        id: 'hot',
        kind: 'action',
        action: {
          type: 'draft_message',
          config: {
            channel: 'sms',
            instruction:
              'Draft a warm, personal intro to this hot lead and reference their interest — send it now.',
          },
        },
      },
      {
        id: 'warm',
        kind: 'action',
        action: {
          type: 'schedule_message',
          config: {
            channel: 'sms',
            instruction:
              'Draft a friendly check-in for this warm lead to go out in a couple of days.',
            delayMinutes: 2880,
          },
        },
      },
    ],
    edges: [
      { from: 't', to: 'c' },
      { from: 'c', to: 'hot', branch: 'true' },
      { from: 'c', to: 'warm', branch: 'false' },
    ],
  };
}

/**
 * Deep-clone a template's form state so the builder mutates a copy, never the
 * shared preset. Re-keys every row id so two instances of the same template
 * don't collide React keys. The optional branching `graph` is structurally
 * cloned so advanced templates open editable on the canvas without aliasing the
 * preset.
 */
export function cloneTemplateState(template: WorkflowTemplate): WorkflowFormState {
  const s = template.state;
  return {
    name: s.name,
    trigger: { ...s.trigger },
    conditionOp: s.conditionOp,
    conditions: s.conditions.map((c) => ({ ...c, id: rowId('cond') })),
    actions: s.actions.map((a) => ({ ...a, id: rowId('act') })),
    autonomy: s.autonomy,
    graph: s.graph
      ? (structuredClone(s.graph) as WorkflowGraph)
      : s.graph,
  };
}
