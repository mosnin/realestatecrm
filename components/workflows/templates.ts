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

export interface WorkflowTemplate {
  /** Stable id for the picker. */
  id: string;
  name: string;
  /** One-line human summary shown in the template picker. */
  description: string;
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
    title: '',
    dueInDays: '',
    toolkit: '',
    action: '',
    paramsJson: '',
  };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'hot-lead-instant-draft',
    name: 'Hot lead → instant draft',
    description: 'When a new lead scores 80 or higher, draft a warm intro text.',
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
];

/**
 * Deep-clone a template's form state so the builder mutates a copy, never the
 * shared preset. Re-keys every row id so two instances of the same template
 * don't collide React keys.
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
  };
}
