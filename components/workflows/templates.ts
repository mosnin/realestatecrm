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
  /** Most-used templates surfaced with a "Popular" badge in the gallery. */
  popular?: boolean;
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
    popular: true,
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
    popular: true,
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
    popular: true,
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
    id: 'offer-received',
    name: 'Offer received → notify + draft client message',
    description: 'When a deal stage hits "offer", log a CRM note and draft an excited client update.',
    category: 'Follow-up',
    popular: true,
    state: {
      name: 'Offer received → notify + draft client message',
      trigger: { ...baseTrigger(), type: 'deal_stage_changed', toStage: 'offer' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'Log a brief CRM note that an offer was received. Then draft an excited, warm message to the client explaining the next steps in the offer process.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Review offer details with client',
          dueInDays: '1',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'contract-signed-checklist',
    name: 'Contract signed → next-steps task list',
    description: 'When a deal closes, automatically create a closing checklist and draft a congrats message.',
    category: 'Follow-up',
    state: {
      name: 'Contract signed → next-steps task list',
      trigger: { ...baseTrigger(), type: 'deal_stage_changed', toStage: 'closed' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a heartfelt congratulations message to the client on closing their deal. Keep it warm and personal.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Schedule key handover',
          dueInDays: '3',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Send closing gift',
          dueInDays: '7',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'weekly-pipeline-review',
    name: 'Every Monday morning → pipeline briefing',
    description: 'Each Monday, Chippi reviews your pipeline and drafts a prioritized action plan for the week.',
    category: 'Scheduling',
    state: {
      name: 'Every Monday morning → pipeline briefing',
      trigger: { ...baseTrigger(), type: 'schedule', cadence: 'weekdays', hour: '7' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'Review my entire lead pipeline. Identify who is most likely to transact soon, who has gone quiet, and who needs a nudge. Draft a short prioritized action plan for today — no fluff, just the top 3–5 things to do.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'lead-gone-cold',
    name: 'Lead score drops → re-engagement message',
    description: 'When a lead\'s score falls below 40, draft a gentle re-engagement check-in.',
    category: 'Follow-up',
    state: {
      name: 'Lead score drops → re-engagement message',
      trigger: { ...baseTrigger(), type: 'lead_score_threshold', min: '40' },
      conditionOp: 'and',
      conditions: [condition('lead.score', 'lte', '40')],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a gentle, no-pressure check-in for this lead who has gone quiet. Ask if their search criteria have changed or if there is anything I can help with. Keep it short and human.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Re-engage cold lead',
          dueInDays: '3',
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
  {
    id: 'first-contact-drip',
    name: 'New lead → 3-step nurture sequence',
    description: 'Greet, follow up in 2 days, then send a listing pick at day 5.',
    category: 'New leads',
    popular: true,
    state: {
      name: 'New lead → 3-step nurture sequence',
      trigger: { ...baseTrigger(), type: 'lead_created' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a short, warm welcome text to this brand-new lead. Mention you saw their inquiry, offer to help, and invite them to reply with what they are looking for.',
        },
        {
          ...blankAction(),
          type: 'delay',
          delayMinutes: '2880',
          delayUnit: 'minutes' as const,
        },
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Two days have passed since first contact. Draft a gentle check-in asking if they had a chance to browse listings and if they have any questions.',
        },
        {
          ...blankAction(),
          type: 'delay',
          delayMinutes: '4320',
          delayUnit: 'minutes' as const,
        },
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'Five days in. Find 2–3 listings that match what this lead said they are looking for and draft a brief, personalised message sharing those picks with a note on why each one fits their criteria.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'price-drop-alert',
    name: 'Price drop webhook → notify lead',
    description: 'When your MLS fires a price-drop webhook, draft a personalised alert to the right lead.',
    category: 'Integrations',
    state: {
      name: 'Price drop webhook → notify lead',
      trigger: { ...baseTrigger(), type: 'webhook' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'A price-drop webhook just arrived with the property details and lead id in the payload. Draft a concise, excited message to the matched lead saying the property they are interested in just dropped in price, and ask if they would like to schedule a tour.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Call lead about price drop',
          dueInDays: '1',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'high-intent-call-reminder',
    name: 'Hot lead score → call reminder',
    description: 'When a lead hits score 80, create an urgent call task and draft a text while you dial.',
    category: 'New leads',
    state: {
      name: 'Hot lead score → call reminder',
      trigger: { ...baseTrigger(), type: 'lead_score_threshold', min: '80' },
      conditionOp: 'and',
      conditions: [condition('lead.score', 'gte', '80')],
      actions: [
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Call {{lead.name}} — hot lead!',
          dueInDays: '0',
        },
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a short, friendly text to send while you try to reach this hot lead by phone. Mention you noticed they are very interested and would love to help — keep it under 3 sentences.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'saturday-open-house-prep',
    name: 'Weekly Saturday → open-house prep',
    description: 'Every Saturday morning, Chippi drafts briefing notes for your upcoming open houses.',
    category: 'Scheduling',
    state: {
      name: 'Weekly Saturday → open-house prep',
      trigger: { ...baseTrigger(), type: 'schedule', cadence: 'weekdays', hour: '7' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'It is Saturday morning. Review any open houses scheduled for today and this weekend. For each one, draft a short briefing: key features of the property, talking points to highlight, and a list of leads who have shown interest in similar homes to personally invite.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'monthly-market-update',
    name: 'Monthly market update to database',
    description: 'On the first weekday of the month, draft a market update email for your entire contact list.',
    category: 'Scheduling',
    state: {
      name: 'Monthly market update to database',
      trigger: { ...baseTrigger(), type: 'schedule', cadence: 'weekdays', hour: '9' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'Draft a concise, professional monthly market update email for a real estate database. Include: 3 key market trends for this month, a brief observation on buyer vs seller conditions in Austin TX, and a soft call-to-action to book a call to discuss their situation. Keep it under 250 words and make it sound like it comes from a trusted local expert.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'buyer-pre-approval-nudge',
    name: 'Warm lead → pre-approval nudge',
    description: 'When a lead reaches score 60, ask if they\'re pre-approved — the key qualifier question.',
    category: 'New leads',
    state: {
      name: 'Warm lead → pre-approval nudge',
      trigger: { ...baseTrigger(), type: 'lead_score_threshold', min: '60' },
      conditionOp: 'and',
      conditions: [condition('lead.score', 'gte', '60')],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a friendly, conversational text to this warm lead asking if they are working with a lender or have pre-approval in hand. Phrase it naturally — like asking a practical next-step question, not a gating requirement. If they say yes, mention you can start sending listings right away.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'evening-task-wrap',
    name: 'Evening wrap-up → task summary',
    description: 'Every weekday at 5pm, Chippi summarises what got done today and preps tomorrow\'s list.',
    category: 'Scheduling',
    state: {
      name: 'Evening wrap-up → task summary',
      trigger: { ...baseTrigger(), type: 'schedule', cadence: 'weekdays', hour: '17' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'It is end of day. Summarise all tasks completed today. Then look at open leads and pending deals and build a short prioritised task list for tomorrow morning — the 3–5 highest-leverage things to do first. Keep it under 150 words.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'stale-leads-weekly-sweep',
    name: 'Weekly stale-lead sweep',
    description: 'Every Monday, find leads you haven\'t touched in 21+ days and draft re-engagement messages.',
    category: 'Scheduling',
    popular: true,
    state: {
      name: 'Weekly stale-lead sweep',
      trigger: { ...baseTrigger(), type: 'schedule', cadence: 'weekdays', hour: '9' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'Scan the pipeline for any lead I have not contacted in 21 or more days. For each one, draft a short, warm re-engagement message personalised to their situation — reference something specific like a neighbourhood they mentioned, a price range, or a home type. Do not send anything generic.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'inspection-stage-update',
    name: 'Deal hits "Inspection" → buyer update',
    description: 'When a deal moves to the inspection stage, draft an informative buyer update.',
    category: 'Follow-up',
    state: {
      name: 'Deal hits "Inspection" → buyer update',
      trigger: { ...baseTrigger(), type: 'deal_stage_changed', toStage: 'inspection' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'email',
          instruction:
            'The deal just moved to the inspection stage. Draft a clear, reassuring email to the buyer explaining what happens during the inspection, what to expect in the report, and what their options are if issues are found. Keep it informative but not alarming — inspections are normal.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Review inspection report with client',
          dueInDays: '5',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'new-lead-survey-drip',
    name: 'New lead → 24h survey invite',
    description: 'After a new lead arrives, send a welcome and follow up with a preference survey link.',
    category: 'New leads',
    state: {
      name: 'New lead → 24h survey invite',
      trigger: { ...baseTrigger(), type: 'lead_created' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'Draft a very brief welcome text — introduce yourself, say you are excited to help them find their perfect home, and let them know you will follow up shortly.',
        },
        {
          ...blankAction(),
          type: 'delay',
          delayMinutes: '1440',
          delayUnit: 'minutes' as const,
        },
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'It has been 24 hours since first contact. Draft a short follow-up asking this lead a few quick questions about what they are looking for: budget range, must-have features, desired neighbourhoods, and timeline. Keep it casual and easy to respond to.',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'post-showing-feedback',
    name: 'After a showing → request honest feedback',
    description: 'After a completed tour, text the buyer asking for a quick honest reaction.',
    category: 'Follow-up',
    popular: true,
    state: {
      name: 'After a showing → request honest feedback',
      trigger: { ...baseTrigger(), type: 'tour_completed' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'delay',
          delayMinutes: '60',
          delayUnit: 'minutes' as const,
        },
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction:
            'An hour has passed since the tour. Draft a friendly text asking for their honest gut-reaction: did they love it, was it missing something key, or just okay? Ask them to reply with a quick rating (1–5) or a few words. Keep it short and low pressure.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Review showing feedback and update search',
          dueInDays: '1',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'referral-thank-you',
    name: 'Referral lead → thank the referrer',
    description: 'When a new lead comes from a referral source, draft a thank-you to the referring contact.',
    category: 'New leads',
    state: {
      name: 'Referral lead → thank the referrer',
      trigger: { ...baseTrigger(), type: 'lead_created' },
      conditionOp: 'and',
      conditions: [condition('lead.source', 'eq', 'referral')],
      actions: [
        {
          ...blankAction(),
          type: 'run_chippi',
          instruction:
            'A new referral lead just arrived. Look up who referred them and draft a warm, genuine thank-you message to the referrer — not a generic one. Mention the name of the person they sent and express real gratitude. Then draft a separate welcome text to the new lead.',
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Send referral gift to source',
          dueInDays: '3',
        },
      ],
      autonomy: 'draft',
    },
  },
  {
    id: 'slack-new-lead-alert',
    name: 'New lead → Slack alert to team',
    description: 'Post a formatted lead summary to your team Slack channel the moment a new lead comes in.',
    category: 'Integrations',
    state: {
      name: 'New lead → Slack alert to team',
      trigger: { ...baseTrigger(), type: 'lead_created' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'call_integration',
          toolkit: 'slack',
          action: 'send_message',
        },
        {
          ...blankAction(),
          type: 'draft_message',
          channel: 'sms',
          instruction: 'Draft a brief welcome text to the new lead saying you saw their enquiry and will be in touch shortly.',
        },
      ],
      autonomy: 'notify',
    },
  },
  {
    id: 'inbound-email-auto-ack',
    name: 'Inbound email → instant acknowledgement',
    description: 'Send an immediate auto-response when an email arrives so leads know you\'re on it.',
    category: 'Follow-up',
    state: {
      name: 'Inbound email → instant acknowledgement',
      trigger: { ...baseTrigger(), type: 'inbound_message', channel: 'email' },
      conditionOp: 'and',
      conditions: [],
      actions: [
        {
          ...blankAction(),
          type: 'schedule_message',
          channel: 'email',
          instruction:
            'Draft a brief, professional auto-acknowledgement confirming you received their email. Say you personally review every message and will respond within a few hours. Do not sound like a bot — keep it warm and real.',
          delayMinutes: '2',
          delayUnit: 'minutes' as const,
        },
        {
          ...blankAction(),
          type: 'create_task',
          title: 'Reply to inbound email',
          dueInDays: '0',
        },
      ],
      autonomy: 'auto',
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
