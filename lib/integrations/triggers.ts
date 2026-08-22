/**
 * Composio trigger subscriptions — the inbound half of the integrations
 * story. Triggers are how the platform tells us "something happened in
 * the realtor's connected app" so Chippi can react without being asked.
 *
 * This module owns four things:
 *
 *   1. CURATED_TRIGGERS — the slugs we auto-register per toolkit. Hard-
 *      coded, not realtor-configurable. The realtor's choice surface is
 *      the connect/disconnect button, not a trigger picker.
 *
 *   2. TRIGGER_DISPATCH — what to do when a delivery arrives. One of:
 *        DRAFT     — fire an autonomous run with a templated instruction
 *                    so the agent drafts a response for the realtor to
 *                    approve. Never auto-sends.
 *        NOTICE    — surface a card to the activity toast (Phase 4 —
 *                    NOT WIRED yet; falls through to a logged no-op).
 *        DATA_SYNC — mirror the event directly into our DB (Phase 4 —
 *                    NOT WIRED yet).
 *
 *   3. registerForConnection / deleteForConnection — lifecycle helpers
 *      called from the OAuth callback (after status becomes active) and
 *      from `connections.revoke` (before the connection is torn down).
 *
 *   4. DB helpers + dispatcher + templater the Inngest handler depends on.
 *
 * Scope discipline (Musk lens): v1 ships with one trigger (`gmail`) and
 * one dispatch kind (`DRAFT`). The other toolkits have empty arrays and
 * the dispatcher falls through to a logged no-op. Expanding coverage is
 * a matter of adding slugs here AFTER verifying them against
 * `composio.triggers.listTypes()` — never guess slugs into this map.
 */

import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { logger } from '@/lib/logger';
import { escapeLike } from '@/lib/escape-like';
import { createTrigger, deleteTrigger } from './composio';
import { fireRoutineRun } from '@/lib/routines';
import { syncCalendarEventToTour } from '@/lib/calendar/tour-sync';
import { recordInboundMessage } from '@/lib/inbox';
import { normalizeEmail } from '@/lib/contact-dedup';
import { runWorkflowsForEvent } from '@/lib/workflows/executor';
import type { CalendarProvider } from '@/lib/calendar/mirror';
import type { IntegrationConnectionRow } from './connections';

export type TriggerStatus = 'active' | 'paused' | 'failed';
export type TriggerKind = 'DRAFT' | 'NOTICE' | 'DATA_SYNC';

export interface IntegrationTriggerRow {
  id: string;
  connectionId: string;
  composioTriggerId: string | null;
  triggerSlug: string;
  status: TriggerStatus;
  lastFiredAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Per-toolkit list of trigger slugs to auto-register at connect time.
 *
 * Slugs verified against Composio's published catalog
 * (composio.dev/toolkits/<slug>.md → "Supported Triggers" table). Do
 * NOT guess slugs into this map — registration would fail silently and
 * the realtor would never see Chippi "noticing" what the catalog implies.
 *
 * Empty array = we don't ingest triggers for that toolkit, either
 * because Composio doesn't ship any or because the available ones don't
 * map to actionable realtor moments. See the per-entry comments for the
 * thinking.
 */
export const CURATED_TRIGGERS: Record<string, string[]> = {
  // ── Comms: the realtor's inbox surfaces ───────────────────────────
  gmail: ['GMAIL_NEW_GMAIL_MESSAGE'],
  outlook: ['OUTLOOK_MESSAGE_TRIGGER'],
  // Slack's "RECEIVE_MESSAGE" fires on every channel post — too noisy.
  // DM and reaction are the high-signal ones.
  slack: ['SLACK_DIRECT_MESSAGE_RECEIVED', 'SLACK_REACTION_ADDED'],
  discord: ['DISCORD_NEW_MESSAGE_TRIGGER'],

  // ── Calendar: tours, accepts, cancellations ───────────────────────
  googlecalendar: [
    'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
    'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
    'GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER',
  ],

  // ── CRM: deal stage + new contact mirrors ─────────────────────────
  hubspot: ['HUBSPOT_CONTACT_CREATED_TRIGGER', 'HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER'],
  salesforce: ['SALESFORCE_NEW_LEAD_TRIGGER', 'SALESFORCE_NEW_OR_UPDATED_OPPORTUNITY_TRIGGER'],
  pipedrive: ['PIPEDRIVE_NEW_DEAL_TRIGGER'],

  // ── Payments: earnest deposits, retainers ─────────────────────────
  stripe: [
    'STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER',
    'STRIPE_PAYMENT_FAILED_TRIGGER',
    'STRIPE_INVOICE_PAYMENT_SUCCEEDED_TRIGGER',
  ],

  // ── Tasks + boards ────────────────────────────────────────────────
  // Asana's task triggers don't have the _TRIGGER suffix (verified in
  // their catalog markdown). Don't normalise names — Composio is the
  // source of truth and the slug strings are what we pass to create().
  asana: ['ASANA_TASK_CREATED', 'ASANA_TASK_COMMENT_ADDED'],
  trello: ['TRELLO_NEW_CARD_TRIGGER', 'TRELLO_UPDATED_CARD_TRIGGER'],

  // ── Toolkits we deliberately do NOT register triggers for ─────────
  // Justification per entry — every empty array earns its silence.
  outlook_calendar: [], // outlook ships event triggers under the OUTLOOK_ prefix; no separate outlook_calendar trigger surface
  calendly: [], // Calendly's webhooks are configured Calendly-side, not via Composio triggers
  cal: [], // same shape as Calendly
  twilio: [], // no triggers in catalog yet (inbound SMS via Twilio's own webhook, not Composio)
  whatsapp: [], // only `STATUS_UPDATED` ships — not "new inbound message", which is the one we'd want
  microsoft_teams: [], // no curated triggers shipped — Composio surfaces Teams as outbound-only today
  facebook: [], // page-DM trigger is gated behind Meta business verification; not worth registering blindly
  instagram: [], // same gating story as facebook
  linkedin: [], // no curated triggers; LinkedIn restricts webhook access heavily
  reddit: [], // monitoring/polling pattern not yet exposed as a Composio trigger
  youtube: [
    // Subscription / new-activity triggers exist but a realtor's YouTube
    // is a content channel, not a real-time signal source. Skip until
    // proven realtors want it.
  ],
  google_ads: [], // no trigger surface; the catalog ships read tools only
  notion: [], // page/database triggers exist, but Notion isn't load-bearing in the realtor workflow
  googledocs: [], // doc-content triggers ship but rarely actionable; skip until asked
  googlesheets: [], // metadata-changed triggers are noisy; the realtor wants outcomes, not cell edits
  googledrive: [], // file-created could be useful (new disclosure?) but the signal is too generic
  onedrive: [], // same shape as googledrive
  dropbox: [], // same shape
  zoho: [], // CRM mirror; left empty until a realtor asks
  docusign: [], // envelope-completed is real but Composio's trigger surface is unclear
  dropbox_sign: [], // same shape as docusign
  typeform: [], // form submissions arrive via Typeform's own webhook (configured Typeform-side)
  googleforms: [], // same shape
  zoom: [], // meeting events ship but calendar is the better signal source
  googlemeet: [], // shape of triggers similar to zoom; skip
  loom: [], // video views aren't actionable enough to justify a trigger
  airtable: [], // schema-changed triggers — noisy, not actionable
  mailchimp: ['MAILCHIMP_SUBSCRIBE_TRIGGER', 'MAILCHIMP_UNSUBSCRIBE_TRIGGER'],
};

/**
 * What to do when a given trigger fires. Every curated slug must have
 * an entry — a slug present in CURATED_TRIGGERS but missing here falls
 * through to a logged no-op in the dispatcher (registration succeeded
 * but the delivery does nothing). The test suite asserts coverage so a
 * curation-without-dispatch can't ship silently.
 *
 * In v2, every curated slug is DRAFT-kind: the templated instruction
 * gives the model the context, and the model decides whether to draft
 * a response, ask the realtor a question, or do nothing. The kind enum
 * stays for future cost-tiered routing (NOTICE = activity card with no
 * Modal cost; DATA_SYNC = direct DB write).
 */
const TRIGGER_DISPATCH: Record<string, TriggerKind> = {
  // Comms
  GMAIL_NEW_GMAIL_MESSAGE: 'DRAFT',
  OUTLOOK_MESSAGE_TRIGGER: 'DRAFT',
  SLACK_DIRECT_MESSAGE_RECEIVED: 'DRAFT',
  SLACK_REACTION_ADDED: 'DRAFT',
  DISCORD_NEW_MESSAGE_TRIGGER: 'DRAFT',
  // Calendar
  GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER: 'DRAFT',
  GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER: 'DRAFT',
  GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER: 'DRAFT',
  // CRM
  HUBSPOT_CONTACT_CREATED_TRIGGER: 'DRAFT',
  HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER: 'DRAFT',
  SALESFORCE_NEW_LEAD_TRIGGER: 'DRAFT',
  SALESFORCE_NEW_OR_UPDATED_OPPORTUNITY_TRIGGER: 'DRAFT',
  PIPEDRIVE_NEW_DEAL_TRIGGER: 'DRAFT',
  // Payments
  STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER: 'DRAFT',
  STRIPE_PAYMENT_FAILED_TRIGGER: 'DRAFT',
  STRIPE_INVOICE_PAYMENT_SUCCEEDED_TRIGGER: 'DRAFT',
  // Tasks
  ASANA_TASK_CREATED: 'DRAFT',
  ASANA_TASK_COMMENT_ADDED: 'DRAFT',
  TRELLO_NEW_CARD_TRIGGER: 'DRAFT',
  TRELLO_UPDATED_CARD_TRIGGER: 'DRAFT',
  // Marketing
  MAILCHIMP_SUBSCRIBE_TRIGGER: 'DRAFT',
  MAILCHIMP_UNSUBSCRIBE_TRIGGER: 'DRAFT',
};

/**
 * Pull a string from the payload by trying each key in order, supporting
 * both flat (`'subject'`) and dotted-nested (`'message.subject'`) paths.
 *
 * Why both: Composio's webhook V1/V2 toolkits often emit flat payloads
 * (`{ subject, sender, snippet }`), while V3 + the Gmail/Calendar/HubSpot
 * "Email Sent V2" generation nests fields under one of `payload`,
 * `data`, `message`, or `properties`. We try both flat and nested so
 * the template doesn't silently miss real data.
 *
 * Returns the first non-empty string found, or null.
 */
function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = key.includes('.') ? pickPath(obj, key.split('.')) : obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function pickPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur && typeof cur === 'object' && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function pickNested(obj: Record<string, unknown>, path: string[]): unknown {
  return pickPath(obj, path);
}

/**
 * Find the "real" payload root inside an envelope. Composio sometimes
 * wraps the event data under one of `data`, `payload`, `message`,
 * `properties` — and the SDK's normalised IncomingTriggerPayload itself
 * carries the toolkit data under `.payload`. We give templates a flat
 * union view by merging the envelope and its first-level wrapper, so
 * `pickString(p, 'subject')` works whether the field arrived flat or
 * inside one of the common envelopes.
 *
 * Same-name fields prefer the nested copy — Composio's V3 normalisation
 * places the canonical field there.
 */
function flattenPayload(p: Record<string, unknown>): Record<string, unknown> {
  const wrappers = ['payload', 'data', 'message'] as const;
  let out: Record<string, unknown> = { ...p };
  for (const w of wrappers) {
    const inner = p[w];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      out = { ...out, ...(inner as Record<string, unknown>) };
    }
  }
  return out;
}

/**
 * Build a uniform instruction block. Every per-slug template has the
 * same shape:
 *
 *   <one-line frame describing what just happened>
 *
 *   <field>: <value>
 *   <field>: <value>
 *   ...
 *
 *   <one-line action rule>
 *
 * Centralising the shape ensures voice consistency across all 24
 * templates (was a Jobs-lens audit finding) and lets us evolve the
 * voice in one place. Fields with null values are dropped.
 *
 * Returns null when EVERY field is empty — the model would get a
 * frame + action rule with no anchoring data, which is worse than a
 * skipped run.
 */
function build(args: {
  frame: string;
  fields: Array<[label: string, value: string | null]>;
  action: string;
}): string | null {
  const present = args.fields.filter(([, v]) => v && v.trim().length > 0);
  if (present.length === 0) return null;
  const lines = [
    args.frame,
    '',
    ...present.map(([label, value]) => `${label}: ${value}`),
    '',
    args.action,
  ];
  return lines.join('\n');
}

/**
 * The structured shape every per-slug extractor returns, OR null when the
 * payload is too thin to anchor on (a required content field is missing).
 *
 * This is the ONE source of payload extraction. Two consumers derive from
 * it without duplicating the per-slug `pickString` calls:
 *   - `templateInstruction` → renders `build({ frame, fields, action })`,
 *     the natural-language instruction the autonomous Modal run sees.
 *   - `normalizeTriggerEvent` → maps `{ title, actor, snippet }` onto the
 *     IntegrationEvent row for the activity feed.
 *
 * `frame`/`fields`/`action` reproduce the instruction byte-for-byte (the
 * Jobs-lens uniform shape); `title`/`actor`/`snippet` are the same values
 * re-labelled for the feed. Keeping both in one place means the feed
 * summary and the dispatch instruction can never drift.
 */
interface ExtractedEvent {
  frame: string;
  fields: Array<[label: string, value: string | null]>;
  action: string;
  /** Feed: the headline (subject / event / deal / contact / task …). */
  title: string | null;
  /** Feed: who it's from (sender / attendee / author / customer …). */
  actor: string | null;
  /** Feed: short body/preview/message/comment text, when present. */
  snippet: string | null;
}

/**
 * Per-slug extractors. Each receives the flattened payload and returns an
 * `ExtractedEvent`, or null when a required content field is absent (the
 * old per-template `if (!text) return null` guards — instruction then no-ops
 * and the feed row carries null title/actor/snippet).
 *
 * Field-name fallbacks: Composio webhook V1/V2/V3 payloads use different
 * keys for the same logical field; `flattenPayload` collapses common
 * envelopes upstream and `pickString()` tries each key in order.
 *
 * Voice rule (instruction `action`): describe a JUDGMENT to make, not a
 * rulebook. The model knows the realtor's CRM and history.
 */
export const EXTRACTORS: Record<string, (p: Record<string, unknown>) => ExtractedEvent | null> = {
  GMAIL_NEW_GMAIL_MESSAGE: (p) => {
    const subject = pickString(p, 'subject', 'messageSubject', 'message.subject');
    const from = pickString(p, 'sender', 'from', 'fromEmail', 'message.from');
    const snippet = pickString(p, 'snippet', 'preview', 'messageText', 'message.snippet');
    return {
      frame: 'A new email just arrived in my Gmail.',
      fields: [
        ['Subject', subject],
        ['From', from],
        ['Snippet', snippet],
      ],
      action:
        'If this looks like it needs a response, read the thread and draft a reply for me to approve. Use your judgment on noise vs signal — I trust you.',
      title: subject,
      actor: from,
      snippet,
    };
  },

  OUTLOOK_MESSAGE_TRIGGER: (p) => {
    const subject = pickString(p, 'subject', 'messageSubject');
    const from = pickString(p, 'from', 'sender', 'fromEmail', 'senderEmail');
    const snippet = pickString(p, 'bodyPreview', 'preview', 'snippet');
    return {
      frame: 'A new email just arrived in my Outlook.',
      fields: [
        ['Subject', subject],
        ['From', from],
        ['Snippet', snippet],
      ],
      action:
        'Same as Gmail — draft a reply if it warrants one, otherwise let it pass.',
      title: subject,
      actor: from,
      snippet,
    };
  },

  SLACK_DIRECT_MESSAGE_RECEIVED: (p) => {
    const text = pickString(p, 'text', 'message', 'messageText');
    if (!text) return null;
    const from = pickString(p, 'user', 'userId', 'userName', 'sender');
    return {
      frame: 'A direct message just arrived on Slack.',
      fields: [
        ['From', from],
        ['Message', text],
      ],
      action: 'Draft a response if it warrants one — automated alerts can pass.',
      title: null,
      actor: from,
      snippet: text,
    };
  },

  SLACK_REACTION_ADDED: (p) => {
    const reaction = pickString(p, 'reaction', 'emoji');
    if (!reaction) return null;
    const from = pickString(p, 'user', 'userName');
    return {
      frame: `Someone reacted on Slack with :${reaction}:.`,
      fields: [
        ['From', from],
      ],
      action:
        'Usually a quiet ack. Only surface if it reads as confirmation or rejection of something I asked.',
      title: `:${reaction}:`,
      actor: from,
      snippet: null,
    };
  },

  DISCORD_NEW_MESSAGE_TRIGGER: (p) => {
    const text = pickString(p, 'content', 'text', 'message');
    if (!text) return null;
    const from = pickString(p, 'author', 'userName', 'username');
    return {
      frame: 'A new Discord message just arrived.',
      fields: [
        ['From', from],
        ['Message', text],
      ],
      action: 'Draft a reply if it warrants one.',
      title: null,
      actor: from,
      snippet: text,
    };
  },

  GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER: (p) => {
    const event = pickString(p, 'summary', 'title');
    const attendee = pickString(p, 'attendee', 'email', 'attendeeEmail');
    const status = pickString(p, 'responseStatus', 'response', 'status');
    return {
      frame: 'A calendar attendee changed their RSVP.',
      fields: [
        ['Event', event],
        ['Attendee', attendee],
        ['New status', status],
      ],
      action:
        'If this is a tour or client meeting, draft a warm confirm (if accepted) or a reschedule offer (if declined). Internal events can pass.',
      title: event,
      actor: attendee,
      snippet: status,
    };
  },

  GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER: (p) => {
    const event = pickString(p, 'summary', 'title');
    const was = pickString(p, 'startTime', 'start', 'startDateTime');
    return {
      frame: 'A calendar event was canceled.',
      fields: [
        ['Event', event],
        ['Was', was],
      ],
      action:
        'If this was a tour or client meeting, draft a follow-up acknowledging and offering to reschedule.',
      title: event,
      actor: null,
      snippet: was,
    };
  },

  GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER: (p) => {
    const event = pickString(p, 'summary', 'title');
    const attendees = (() => {
      const a = pickNested(p, ['attendees']);
      return Array.isArray(a)
        ? a
            .map((x) =>
              typeof x === 'object' && x ? (x as Record<string, unknown>).email : null,
            )
            .filter(Boolean)
            .join(', ') || null
        : null;
    })();
    return {
      frame: 'A calendar event is starting soon.',
      fields: [
        ['Event', event],
        ['With', attendees],
      ],
      action:
        "Refresh me on who this is with, what we know about them, and anything pending. Tight — I'm walking in.",
      title: event,
      actor: attendees,
      snippet: null,
    };
  },

  HUBSPOT_CONTACT_CREATED_TRIGGER: (p) => {
    const props = (pickNested(p, ['properties']) as Record<string, unknown>) ?? p;
    const first = pickString(props, 'firstname', 'firstName', 'name');
    const last = pickString(props, 'lastname', 'lastName');
    const fullName = [first, last].filter(Boolean).join(' ') || null;
    const email = pickString(props, 'email');
    const phone = pickString(props, 'phone', 'mobilephone');
    return {
      frame: 'A new contact was just created in HubSpot.',
      fields: [
        ['Name', fullName],
        ['Email', email],
        ['Phone', phone],
      ],
      action:
        'Tell me where this contact likely came from and draft an opener if I should reach out. System/import rows can pass.',
      title: fullName,
      actor: email,
      snippet: phone,
    };
  },

  HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER: (p) => {
    const props = (pickNested(p, ['properties']) as Record<string, unknown>) ?? p;
    const deal = pickString(props, 'dealname', 'name');
    const fromStage = pickString(props, 'previousStage', 'priorStage');
    const toStage = pickString(props, 'dealstage', 'stage');
    return {
      frame: 'A HubSpot deal moved stages.',
      fields: [
        ['Deal', deal],
        ['From', fromStage],
        ['To', toStage],
      ],
      action:
        'If the move warrants client communication — congratulating an accepted offer, nudging a stalled negotiation — draft it.',
      title: deal,
      actor: null,
      // Feed: the human-meaningful change is the stage transition.
      snippet:
        fromStage && toStage ? `${fromStage} → ${toStage}` : toStage ?? fromStage,
    };
  },

  SALESFORCE_NEW_LEAD_TRIGGER: (p) => {
    const name = pickString(p, 'name', 'leadName', 'firstName');
    const company = pickString(p, 'company', 'companyName');
    const source = pickString(p, 'leadSource', 'source');
    return {
      frame: 'A new lead just landed in Salesforce.',
      fields: [
        ['Name', name],
        ['Company', company],
        ['Source', source],
      ],
      action:
        'Tell me what we know and draft an opener if a first touch is warranted.',
      title: name,
      actor: company,
      snippet: source,
    };
  },

  SALESFORCE_NEW_OR_UPDATED_OPPORTUNITY_TRIGGER: (p) => {
    const opp = pickString(p, 'name', 'opportunityName');
    const stage = pickString(p, 'stageName', 'stage');
    const amount = pickString(p, 'amount');
    return {
      frame: 'A Salesforce opportunity was created or updated.',
      fields: [
        ['Opportunity', opp],
        ['Stage', stage],
        ['Amount', amount],
      ],
      action:
        'If the change is meaningful — stage advance, amount delta, close-date move — tell me what changed and whether I should reach out.',
      title: opp,
      actor: null,
      snippet: stage,
    };
  },

  PIPEDRIVE_NEW_DEAL_TRIGGER: (p) => {
    const deal = pickString(p, 'title', 'dealTitle', 'name');
    const contact = pickString(p, 'personName', 'contactName', 'person');
    const value = pickString(p, 'value', 'amount');
    return {
      frame: 'A new deal was just created in Pipedrive.',
      fields: [
        ['Deal', deal],
        ['Contact', contact],
        ['Value', value],
      ],
      action:
        'Draft an opener if the contact is fresh and a first touch is warranted.',
      title: deal,
      actor: contact,
      snippet: value,
    };
  },

  STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER: (p) => {
    const amount = pickString(p, 'amount_total', 'amount', 'totalAmount');
    const from = pickString(p, 'customer_email', 'email', 'customerEmail');
    const forWhat = pickString(p, 'description', 'metadata.description');
    return {
      frame: 'A Stripe payment just came through.',
      fields: [
        ['Amount', amount],
        ['From', from],
        ['For', forWhat],
      ],
      action:
        'Draft a short thank-you / confirmation matching the tone we already had with this person, and note in CRM whether this is an earnest deposit, retainer, or service fee.',
      title: amount,
      actor: from,
      snippet: forWhat,
    };
  },

  STRIPE_PAYMENT_FAILED_TRIGGER: (p) => {
    const customer = pickString(p, 'customer_email', 'email', 'customerEmail');
    const reason = pickString(p, 'failure_message', 'reason', 'failureReason');
    return {
      frame: 'A Stripe payment just failed.',
      fields: [
        ['Customer', customer],
        ['Reason', reason],
      ],
      action:
        "Draft a low-friction follow-up — we'll retry, they can update their method. Don't sound alarming; most failures are bank-side.",
      title: null,
      actor: customer,
      snippet: reason,
    };
  },

  STRIPE_INVOICE_PAYMENT_SUCCEEDED_TRIGGER: (p) => {
    const amount = pickString(p, 'amount_paid', 'amount', 'totalAmount');
    const customer = pickString(p, 'customer_email', 'email', 'customerEmail');
    return {
      frame: 'A Stripe invoice was paid.',
      fields: [
        ['Amount', amount],
        ['Customer', customer],
      ],
      action:
        'Recurring retainer → just stamp the CRM. One-off → send a brief confirmation.',
      title: amount,
      actor: customer,
      snippet: null,
    };
  },

  ASANA_TASK_CREATED: (p) => {
    const task = pickString(p, 'name', 'taskName');
    const assignee = pickString(p, 'assignee', 'assigneeName');
    return {
      frame: 'A new task just landed in Asana.',
      fields: [
        ['Task', task],
        ['Assigned to', assignee],
      ],
      action:
        'If this is work I owe a client (callback, follow-up, doc send), surface it as a today-item.',
      title: task,
      actor: assignee,
      snippet: null,
    };
  },

  ASANA_TASK_COMMENT_ADDED: (p) => {
    const comment = pickString(p, 'text', 'comment', 'commentText');
    if (!comment) return null;
    const task = pickString(p, 'taskName', 'name');
    const from = pickString(p, 'author', 'commenter');
    return {
      frame: 'A new comment appeared on an Asana task.',
      fields: [
        ['Task', task],
        ['From', from],
        ['Comment', comment],
      ],
      action: "If it's a question or blocker, tell me what's needed.",
      title: task,
      actor: from,
      snippet: comment,
    };
  },

  TRELLO_NEW_CARD_TRIGGER: (p) => {
    const card = pickString(p, 'name', 'cardName');
    const list = pickString(p, 'listName', 'list');
    return {
      frame: 'A new Trello card was created.',
      fields: [
        ['Card', card],
        ['List', list],
      ],
      action: 'If this is work I owe a client, surface it.',
      title: card,
      actor: null,
      snippet: list,
    };
  },

  TRELLO_UPDATED_CARD_TRIGGER: (p) => {
    const card = pickString(p, 'name', 'cardName');
    const change = pickString(p, 'change', 'updateType');
    return {
      frame: 'A Trello card was updated.',
      fields: [
        ['Card', card],
        ['Change', change],
      ],
      action:
        'If this is a status a client cares about — e.g., closing checklist item — tell me.',
      title: card,
      actor: null,
      snippet: change,
    };
  },

  MAILCHIMP_SUBSCRIBE_TRIGGER: (p) => {
    const email = pickString(p, 'email', 'emailAddress');
    const list = pickString(p, 'listName', 'list');
    return {
      frame: 'Someone just subscribed to a Mailchimp list.',
      fields: [
        ['Email', email],
        ['List', list],
      ],
      action:
        "If we know them from CRM, surface what we know. If new, draft a low-key welcome and add them as a lead.",
      title: email,
      actor: email,
      snippet: list,
    };
  },

  MAILCHIMP_UNSUBSCRIBE_TRIGGER: (p) => {
    const email = pickString(p, 'email', 'emailAddress');
    return {
      frame: 'Someone unsubscribed from a Mailchimp list.',
      fields: [
        ['Email', email],
      ],
      action:
        'Known CRM contact → flag the signal quietly, no outreach. They may want less from us.',
      title: email,
      actor: email,
      snippet: null,
    };
  },
};

/** Timestamp keys Composio payloads use across toolkits. First valid one wins;
 *  callers fall back to now() when none parse. */
function pickOccurredAt(p: Record<string, unknown>): string | null {
  const raw = pickString(
    p,
    'occurredAt',
    'occurred_at',
    'timestamp',
    'createdAt',
    'created_at',
    'eventTime',
    'event_time',
    'date',
  );
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * Shared normalizer — the SINGLE source the activity feed derives from.
 * Pure: same toolkit/slug/payload in → same summary out, no I/O.
 *
 * Pulls the feed-facing `{ title, actor, snippet }` out of the SAME per-slug
 * extractor the dispatch instruction uses, so the two can't drift. Null-safe:
 * an unknown slug or a thin/empty payload yields all-null fields (and
 * occurredAt falls back to now()). `toolkit` is accepted for a stable
 * signature and future per-toolkit tweaks; extraction keys off the slug today.
 */
export function normalizeTriggerEvent(
  _toolkit: string,
  slug: string,
  payload: Record<string, unknown> | undefined,
): { title: string | null; actor: string | null; snippet: string | null; occurredAt: string } {
  const flat = flattenPayload(payload ?? {});
  const extractor = EXTRACTORS[slug];
  const extracted = extractor ? extractor(flat) : null;
  return {
    title: extracted?.title ?? null,
    actor: extracted?.actor ?? null,
    snippet: extracted?.snippet ?? null,
    occurredAt: pickOccurredAt(flat) ?? new Date().toISOString(),
  };
}

/**
 * Per-slug instruction templater. Given the trigger's payload, returns
 * the natural-language instruction the autonomous Modal run will see —
 * or null when the payload is too thin to act on (the dispatcher then
 * skips the run rather than burn Modal time on a content-free prompt).
 *
 * A slug missing from EXTRACTORS returns null — dispatch then logs a gap
 * and no-ops. Adding a slug to CURATED_TRIGGERS without an extractor is
 * caught by the test suite. Output is unchanged from the prior per-slug
 * templates: the extractor's `frame`/`fields`/`action` feed `build()` as
 * before; only the extraction now lives in one place (shared with the feed
 * normalizer).
 */
function templateInstruction(
  triggerSlug: string,
  payload: Record<string, unknown> | undefined,
): string | null {
  const extractor = EXTRACTORS[triggerSlug];
  if (!extractor) return null;
  // Flatten envelope wrappers so extractors can use flat keys regardless
  // of whether Composio V1/V2 sent flat fields or V3 wrapped them under
  // `payload`/`data`/`message`. Without this, the Gmail launch slug
  // silently no-ops on real V3 deliveries — V3 puts `snippet` and
  // `subject` inside `payload.*` while our flat-key picks miss them.
  const extracted = extractor(flattenPayload(payload ?? {}));
  if (!extracted) return null;
  return build({
    frame: extracted.frame,
    fields: extracted.fields,
    action: extracted.action,
  });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Subscribe ONE slug for a connection — the idempotent per-slug body that both
 * connect-time registration and the workflow-trigger reconcile share. Creates
 * the Composio trigger, then upserts the IntegrationTrigger row 'active'. A
 * failure is logged and recorded as a 'failed' row (so a later reconcile sees we
 * tried) and reported as 'failed' WITHOUT throwing — one bad slug never blocks
 * the rest. The upsert is keyed on (connectionId, triggerSlug), so re-subscribing
 * an already-active slug is a no-op-shaped overwrite.
 */
export async function subscribeSlug(
  connection: IntegrationConnectionRow,
  slug: string,
): Promise<'ok' | 'failed'> {
  try {
    const { triggerId } = await createTrigger({
      entityId: connection.userId,
      slug,
      connectedAccountId: connection.composioConnectionId,
    });
    const ok = await upsertTriggerRow({
      connectionId: connection.id,
      triggerSlug: slug,
      composioTriggerId: triggerId,
      status: 'active',
    });
    return ok ? 'ok' : 'failed';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[integrations.triggers] registration failed', {
      toolkit: connection.toolkit,
      slug,
      connectionId: connection.id,
      err: message,
    });
    // Record the failure so a later reconcile can see we tried.
    await upsertTriggerRow({
      connectionId: connection.id,
      triggerSlug: slug,
      composioTriggerId: null,
      status: 'failed',
      lastError: message,
    });
    return 'failed';
  }
}

/**
 * Register every curated trigger for a freshly-active connection.
 *
 * Called from the OAuth callback AFTER `upsertByComposioId` confirms the
 * row is active. Each (connection, slug) pair becomes one IntegrationTrigger
 * row. A registration failure for one slug is logged + recorded with
 * status='failed' and does NOT block the rest — a realtor with three
 * triggers should get the two that work even if one slug is wrong.
 *
 * Best-effort overall: a Composio outage here doesn't reject the OAuth
 * completion. The realtor sees the connection succeed; missing triggers
 * surface later via the health endpoint and can be re-registered on
 * reconnect.
 */
export async function registerForConnection(args: {
  connection: IntegrationConnectionRow;
}): Promise<{ registered: number; failed: number }> {
  const slugs = CURATED_TRIGGERS[args.connection.toolkit] ?? [];
  if (slugs.length === 0) {
    return { registered: 0, failed: 0 };
  }

  let registered = 0;
  let failed = 0;

  for (const slug of slugs) {
    const outcome = await subscribeSlug(args.connection, slug);
    if (outcome === 'ok') registered++;
    else failed++;
  }

  if (registered > 0 || failed > 0) {
    logger.info('[integrations.triggers] registered for connection', {
      toolkit: args.connection.toolkit,
      connectionId: args.connection.id,
      registered,
      failed,
    });
  }
  return { registered, failed };
}

/**
 * Delete every trigger subscription for a connection — at Composio AND
 * locally. Called from `connections.revoke` BEFORE the connection itself
 * is torn down, so a disconnected realtor doesn't keep paying for
 * webhook deliveries that go nowhere.
 *
 * If the connection row is hard-deleted (ON DELETE CASCADE removes our
 * IntegrationTrigger rows), the Composio side still needs explicit
 * cleanup — this function is the one path that guarantees both.
 */
export async function deleteForConnection(connectionId: string): Promise<void> {
  const rows = await listTriggersForConnection(connectionId);
  for (const row of rows) {
    if (row.composioTriggerId) {
      await deleteTrigger(row.composioTriggerId);
    }
  }
  // DB-side cleanup. CASCADE on connection delete handles the case where
  // the connection row is removed; this covers the live revoke path where
  // the connection row sticks around as status='revoked'.
  const { error } = await supabase
    .from('IntegrationTrigger')
    .delete()
    .eq('connectionId', connectionId);
  if (error) {
    logger.warn('[integrations.triggers] db delete failed', {
      connectionId,
      err: error.message,
    });
  }
}

/**
 * Flip every IntegrationTrigger row for a connection between 'active'
 * and 'paused'. Realtor-facing — the integrations panel offers ONE
 * toggle per connected app, not one per trigger. Per-trigger granularity
 * is a settings rabbit hole the realtor does not need.
 *
 * Idempotent: pausing an already-paused connection is a no-op.
 * Failed rows (status='failed') are left alone — those are a separate
 * recovery path (re-register on reconnect).
 */
export async function setPausedForConnection(args: {
  connectionId: string;
  paused: boolean;
}): Promise<{ updated: number }> {
  const targetStatus: TriggerStatus = args.paused ? 'paused' : 'active';
  const oppositeStatus: TriggerStatus = args.paused ? 'active' : 'paused';
  const { data, error } = await supabase
    .from('IntegrationTrigger')
    .update({ status: targetStatus, updatedAt: new Date().toISOString() })
    .eq('connectionId', args.connectionId)
    .eq('status', oppositeStatus)
    .select('id');
  if (error) {
    logger.warn('[integrations.triggers] setPausedForConnection failed', {
      connectionId: args.connectionId,
      paused: args.paused,
      err: error.message,
    });
    return { updated: 0 };
  }
  return { updated: (data ?? []).length };
}

/**
 * Did this connection have ANY active trigger at the time of the check?
 * Used by the integrations list endpoint to render the per-connection
 * "Chippi is watching" / "Paused" affordance. Returns false when the
 * connection has no rows at all (nothing curated for that toolkit).
 */
export async function hasActiveTriggers(connectionId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('IntegrationTrigger')
    .select('id', { count: 'exact', head: true })
    .eq('connectionId', connectionId)
    .eq('status', 'active');
  if (error) return false;
  return (count ?? 0) > 0;
}

export type TriggerSummary = 'off' | 'active' | 'paused' | 'failed';

/**
 * Per-connection trigger summary for the integrations list endpoint.
 * Four states:
 *   - "off"     → no triggers registered (toolkit has empty CURATED_TRIGGERS)
 *   - "active"  → at least one trigger active
 *   - "paused"  → triggers registered but realtor paused them
 *   - "failed"  → registration attempted but Composio rejected; realtor
 *                 sees Chippi promised to watch and silently doesn't
 *                 unless we expose this state.
 *
 * Precedence: active > paused > failed > off. If a connection has both
 * a working trigger and a broken one, we show active (the realtor's
 * coverage isn't zero) — the broken slug surfaces in /api/integrations/health.
 */
export async function summariesForConnections(connectionIds: string[]): Promise<
  Record<string, TriggerSummary>
> {
  if (connectionIds.length === 0) return {};
  const { data, error } = await supabase
    .from('IntegrationTrigger')
    .select('connectionId, status')
    .in('connectionId', connectionIds);
  if (error) {
    logger.warn('[integrations.triggers] summariesForConnections failed', { err: error.message });
    return {};
  }
  const rows = (data ?? []) as Array<{ connectionId: string; status: TriggerStatus }>;
  const map: Record<string, TriggerSummary> = {};
  for (const id of connectionIds) map[id] = 'off';
  const rank: Record<TriggerSummary, number> = { off: 0, failed: 1, paused: 2, active: 3 };
  for (const r of rows) {
    const incoming: TriggerSummary = r.status;
    if (rank[incoming] > rank[map[r.connectionId]]) {
      map[r.connectionId] = incoming;
    }
  }
  return map;
}

// ─── Inbound email capture ───────────────────────────────────────────────────

/**
 * The inbound-EMAIL trigger slugs we capture as threaded InboxMessages. These
 * are the two comms slugs whose payloads carry a sender email we can resolve to
 * a Contact. Slack/Discord are intentionally NOT here: their "from" is a
 * provider user id, not an email, so it can't be threaded onto a Contact (and
 * inbound SMS is deferred — no Telnyx webhook this phase).
 */
const INBOUND_EMAIL_SLUGS = new Set<string>([
  'GMAIL_NEW_GMAIL_MESSAGE',
  'OUTLOOK_MESSAGE_TRIGGER',
]);

/**
 * The fields the inbound-email capture needs from a flattened payload:
 *   - `from`      sender email (raw — may be "Name <addr>"; normalized below)
 *   - `subject`   email subject (optional)
 *   - `body`      best available body text (full body if present, else snippet)
 *   - `messageId` provider message id → the InboxMessage.externalId for
 *                 at-least-once dedupe across Composio/Inngest retries
 */
interface InboundEmailFields {
  from: string | null;
  subject: string | null;
  body: string | null;
  messageId: string | null;
}

/**
 * Extract sender / subject / body / message-id from a flattened Gmail or
 * Outlook trigger payload. Reuses the same field-name fallbacks as the
 * EXTRACTORS map (Composio webhook V1/V2/V3 disagree on key names) and prefers
 * the FULL body over the snippet, falling back to the snippet when no full body
 * is present (the launch Gmail trigger often ships only `snippet`).
 *
 * Returns all-null fields for a non-email slug or an empty payload — the caller
 * treats a missing sender/body as "can't capture" and skips.
 */
function extractInboundEmail(slug: string, flat: Record<string, unknown>): InboundEmailFields {
  if (!INBOUND_EMAIL_SLUGS.has(slug)) {
    return { from: null, subject: null, body: null, messageId: null };
  }
  const from =
    slug === 'OUTLOOK_MESSAGE_TRIGGER'
      ? pickString(flat, 'from', 'sender', 'fromEmail', 'senderEmail')
      : pickString(flat, 'sender', 'from', 'fromEmail', 'message.from');
  const subject =
    slug === 'OUTLOOK_MESSAGE_TRIGGER'
      ? pickString(flat, 'subject', 'messageSubject')
      : pickString(flat, 'subject', 'messageSubject', 'message.subject');
  // Prefer a full body; fall back to the preview/snippet the templater uses.
  const body =
    pickString(
      flat,
      'body',
      'messageBody',
      'bodyText',
      'textBody',
      'plainText',
      'body.content',
      'message.body',
    ) ??
    (slug === 'OUTLOOK_MESSAGE_TRIGGER'
      ? pickString(flat, 'bodyPreview', 'preview', 'snippet')
      : pickString(flat, 'snippet', 'preview', 'messageText', 'message.snippet'));
  // Provider message id — the idempotency key for the InboxMessage write. Gmail
  // nests it under `message.message_id`/`id`; Outlook uses a flat `id`/`messageId`.
  const messageId = pickString(
    flat,
    'message_id',
    'messageId',
    'message.message_id',
    'message.messageId',
    'message.id',
    'id',
  );
  return { from, subject, body, messageId };
}

/**
 * A sender email may arrive as a display-name form ("Sarah <sarah@x.com>") or a
 * bare address. Pull the address out of the angle brackets when present, then
 * lowercase/trim via the shared normalizer. Returns '' when no address is found.
 */
function normalizeSenderEmail(raw: string | null): string {
  if (!raw) return '';
  const angle = raw.match(/<([^>]+)>/);
  return normalizeEmail(angle ? angle[1] : raw);
}

/**
 * Resolve a Contact by email WITHIN a single space (case-insensitive). Mirrors
 * the email-match guard used by the client portal / dedup: lower+trim, then an
 * `ilike` on the escaped literal so it stays an exact (not pattern) match.
 * Returns the contact id, or null when no contact in this space owns the email.
 */
async function resolveContactByEmail(
  spaceId: string,
  normalizedEmail: string,
): Promise<string | null> {
  if (!normalizedEmail) return null;
  const { data, error } = await tenantTable(supabase, 'Contact', { spaceId })
    .select('id')
    .ilike('email', escapeLike(normalizedEmail))
    .maybeSingle();
  if (error) throw error;
  return data ? ((data as { id: string }).id) : null;
}

export type InboundCaptureOutcome =
  | 'recorded'
  | 'deduped'
  | 'no_contact'
  | 'no_sender'
  | 'not_email'
  | 'error';

/**
 * Capture an inbound EMAIL trigger as a contact-resolved threaded InboxMessage,
 * BEFORE the DRAFT dispatch fires. Runs only for the inbound-email slugs.
 *
 * Flow: extract sender/subject/body/message-id → normalize the sender → resolve
 * a Contact by email within `connection.spaceId` → on a match, recordInbound
 * (idempotent on the provider message id). On NO match we skip the message
 * record (can't thread to an unknown sender) — we do NOT create a contact.
 *
 * BEST-EFFORT by contract: every failure path is caught and logged and returns
 * an outcome string. This NEVER throws, so a capture problem can't break the
 * trigger handler or the DRAFT dispatch that runs after it. The outcome is
 * returned purely for logging/tests; the caller ignores it for control flow.
 */
export async function captureInboundEmail(args: {
  triggerSlug: string;
  connection: IntegrationConnectionRow;
  payload: Record<string, unknown> | undefined;
}): Promise<InboundCaptureOutcome> {
  if (!INBOUND_EMAIL_SLUGS.has(args.triggerSlug)) return 'not_email';
  try {
    const flat = flattenPayload(args.payload ?? {});
    const { from, subject, body, messageId } = extractInboundEmail(args.triggerSlug, flat);

    const senderEmail = normalizeSenderEmail(from);
    if (!senderEmail) {
      logger.info('[integrations.triggers] inbound email capture: no sender — skipping', {
        slug: args.triggerSlug,
        connectionId: args.connection.id,
      });
      return 'no_sender';
    }

    const contactId = await resolveContactByEmail(args.connection.spaceId, senderEmail);
    if (!contactId) {
      // Unknown sender → nothing to thread onto. We deliberately do NOT create
      // a contact here (out of scope); the DRAFT dispatch still runs after this.
      logger.info('[integrations.triggers] inbound email capture: no matching contact — skipping', {
        slug: args.triggerSlug,
        connectionId: args.connection.id,
      });
      return 'no_contact';
    }

    const result = await recordInboundMessage({
      spaceId: args.connection.spaceId,
      contactId,
      channel: 'email',
      subject: subject ?? null,
      // recordInbound requires a string body; an email with neither full body
      // nor snippet still threads (the subject carries the signal).
      body: body ?? '',
      externalId: messageId,
      metadata: { from, triggerSlug: args.triggerSlug },
    });

    logger.info('[integrations.triggers] inbound email captured', {
      slug: args.triggerSlug,
      connectionId: args.connection.id,
      contactId,
      messageId,
      deduped: result.deduped,
    });
    return result.deduped ? 'deduped' : 'recorded';
  } catch (err) {
    // Best-effort: a capture failure must NEVER break the trigger handler or
    // the DRAFT dispatch. Swallow + log; the IntegrationEvent already persisted
    // the raw delivery upstream, so nothing is lost.
    logger.error(
      '[integrations.triggers] inbound email capture failed (non-fatal)',
      { slug: args.triggerSlug, connectionId: args.connection.id },
      err,
    );
    return 'error';
  }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Calendar event-change slugs that must SYNC back to the mapped Tour (the
 * two-way calendar fix), in addition to whatever their dispatch kind does.
 *
 *   - CANCELED_DELETED → the external event vanished → cancel the tour.
 *   - ATTENDEE_RESPONSE_CHANGED → an RSVP, OR a drag-to-new-time some Composio
 *     generations surface here → record the RSVP / move the tour.
 *
 * STARTING_SOON is deliberately NOT here — it's a reminder, not a state change.
 * The sync itself is the single place that decides delete vs move vs rsvp from
 * the payload; this set just gates WHICH slugs get fed to it.
 *
 * These slugs keep their existing DRAFT dispatch too: the sync corrects the CRM
 * (the truth), the DRAFT drafts the guest-facing follow-up (the outreach). Two
 * different jobs; both wanted.
 */
const CALENDAR_SYNC_SLUGS = new Set<string>([
  'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
  'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
]);

/** Map a connection toolkit to a calendar provider slug, or null if the
 *  connection isn't a calendar we sync. Keeps the sync gated to the two
 *  provider slugs lib/calendar/mirror.ts knows how to map. */
function calendarProviderForToolkit(toolkit: string): CalendarProvider | null {
  if (toolkit === 'googlecalendar' || toolkit === 'outlook_calendar') return toolkit;
  return null;
}

/**
 * Run the inbound calendar→Tour sync for a calendar event-change delivery.
 * Best-effort: never throws (syncCalendarEventToTour swallows its own errors),
 * so a sync failure can't change the DRAFT dispatch outcome that follows.
 * No-ops cleanly when the connection isn't a mappable calendar provider.
 */
async function runCalendarSync(args: {
  triggerSlug: string;
  connection: IntegrationConnectionRow;
  payload: Record<string, unknown> | undefined;
}): Promise<void> {
  const provider = calendarProviderForToolkit(args.connection.toolkit);
  if (!provider) return;
  // Flatten envelope wrappers (payload/data/message) so the sync's flat-key
  // extractors find the event id / times / status regardless of Composio's
  // V1/V2/V3 payload shape — same normalisation the templater uses.
  const flat = flattenPayload(args.payload ?? {});
  const result = await syncCalendarEventToTour({
    spaceId: args.connection.spaceId,
    provider,
    triggerSlug: args.triggerSlug,
    payload: flat,
  });
  if (result.action !== 'noop') {
    logger.info('[integrations.triggers] calendar sync applied', {
      slug: args.triggerSlug,
      connectionId: args.connection.id,
      action: result.action,
      tourId: result.tourId,
    });
  }
}

/**
 * Dispatch one delivery to the right downstream path. Called by the
 * Inngest handler — keeps the inngest function thin and the dispatch
 * logic testable in isolation.
 *
 * Idempotency lives upstream of this (the receiver dedupes on the
 * webhook delivery id). This function may be called more than once for
 * the same logical event if Inngest retries; the downstream paths must
 * be idempotent on their own terms.
 */
export async function dispatchTrigger(args: {
  triggerSlug: string;
  connection: IntegrationConnectionRow;
  payload: Record<string, unknown> | undefined;
  deliveryId?: string;
}): Promise<{
  dispatched: 'DRAFT' | 'NOTICE' | 'DATA_SYNC' | 'noop';
  reason?: string;
  /** How many enabled workflows this delivery actually fired. A delivery can
   *  drive a workflow even when its dispatch kind is a no-op (no DRAFT handler),
   *  so callers stamp lastFiredAt on `dispatched !== 'noop' || workflowsRan > 0`. */
  workflowsRan: number;
}> {
  // Inbound calendar sync FIRST — correct the CRM Tour (cancel/move/RSVP) for
  // calendar event-change slugs before the kind-based routing drafts any
  // guest-facing follow-up. State-based idempotent + best-effort, so an
  // Inngest retry can't double-apply and a sync hiccup can't sink the dispatch.
  if (CALENDAR_SYNC_SLUGS.has(args.triggerSlug)) {
    await runCalendarSync({
      triggerSlug: args.triggerSlug,
      connection: args.connection,
      payload: args.payload,
    });
  }

  // Inbound EMAIL capture — BEFORE the DRAFT dispatch below. For Gmail/Outlook
  // deliveries this resolves the sender to a Contact (within this connection's
  // space) and records the message on the contact's thread, so the inbox shows
  // the inbound that prompted Chippi's draft. Best-effort by contract: it never
  // throws, no-ops for non-email slugs, and skips silently for an unknown
  // sender — the DRAFT dispatch fires regardless of the capture outcome.
  if (INBOUND_EMAIL_SLUGS.has(args.triggerSlug)) {
    await captureInboundEmail({
      triggerSlug: args.triggerSlug,
      connection: args.connection,
      payload: args.payload,
    });
  }

  // Workflow dispatch — fire-and-forget, AFTER the inbound captures/sync above
  // and BEFORE the kind-based routing returns so it runs for EVERY delivery
  // regardless of dispatch kind. STRICTLY best-effort: any failure is logged
  // and swallowed; this never throws out of dispatchTrigger and never changes
  // the dispatch outcome the receiver depends on.
  //
  // runWorkflowsForEvent now narrows on toolkit + event slug (it reads
  // context.event.toolkit/event below), so a workflow keyed to a specific event
  // is only evaluated for that event's deliveries — no longer "every
  // integration_event workflow on every delivery".
  let workflowsRan = 0;
  try {
    const wfResult = await runWorkflowsForEvent({
      spaceId: args.connection.spaceId,
      triggerType: 'integration_event',
      context: {
        event: {
          type: 'integration_event',
          toolkit: args.connection.toolkit,
          event: args.triggerSlug,
          deliveryId: args.deliveryId ?? '',
          payload: args.payload ?? {},
        },
      },
      triggerEvent: {
        slug: args.triggerSlug,
        toolkit: args.connection.toolkit,
        deliveryId: args.deliveryId ?? '',
        payload: args.payload ?? {},
      },
    });
    workflowsRan = wfResult.ran;
  } catch (err) {
    logger.error(
      '[integrations.triggers] workflow dispatch failed (non-fatal)',
      { slug: args.triggerSlug, connectionId: args.connection.id },
      err,
    );
  }

  const kind: TriggerKind | undefined = TRIGGER_DISPATCH[args.triggerSlug];
  if (!kind) {
    logger.info('[integrations.triggers] no dispatch handler — dropping', {
      slug: args.triggerSlug,
      connectionId: args.connection.id,
    });
    return { dispatched: 'noop', reason: 'no_dispatch', workflowsRan };
  }

  if (kind === 'DRAFT') {
    const instruction = templateInstruction(args.triggerSlug, args.payload);
    if (!instruction) {
      logger.info('[integrations.triggers] payload too thin — skipping draft', {
        slug: args.triggerSlug,
        connectionId: args.connection.id,
      });
      return { dispatched: 'noop', reason: 'thin_payload', workflowsRan };
    }
    // Prepend a structured trigger tag so the Modal autonomous-mode
    // detector can tell this run from a chat turn. Without it, the
    // model may read the first-person instruction as a chat message
    // and reply "Got it." instead of doing the work.
    const tagged = `[Autonomous run — Composio trigger: ${args.triggerSlug}]\n\n${instruction}`;
    // Also pass the structured triggerSource through so the drafts
    // tool can persist it on AgentDraft.triggerSource. The inbox UI
    // reads from that column to render the "Chippi noticed because
    // [event]" breadcrumb — the trust moment Phase 4 surfaces.
    const triggerSource = {
      kind: 'composio_trigger' as const,
      slug: args.triggerSlug,
      toolkit: args.connection.toolkit,
      deliveryId: args.deliveryId ?? '',
    };
    const runStatus = await fireRoutineRun(
      args.connection.spaceId,
      tagged,
      args.connection.userId,
      triggerSource,
    );
    if (runStatus === 'error') {
      logger.error('[integrations.triggers] autonomous draft dispatch failed', {
        slug: args.triggerSlug,
        connectionId: args.connection.id,
        deliveryId: args.deliveryId ?? null,
      });
      throw new Error(`Autonomous draft dispatch failed for ${args.triggerSlug}`);
    }
    return { dispatched: 'DRAFT', workflowsRan };
  }

  // NOTICE and DATA_SYNC paths are wired to no-ops for v1 — the dispatch
  // table never routes to them today (no slugs use them), but if a future
  // slug gets added with kind='NOTICE' it should not silently break. Log
  // loudly so the gap is obvious in production.
  logger.warn('[integrations.triggers] dispatch kind not yet wired', {
    slug: args.triggerSlug,
    kind,
    connectionId: args.connection.id,
  });
  return { dispatched: 'noop', reason: 'unwired_kind', workflowsRan };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

interface UpsertTriggerArgs {
  connectionId: string;
  triggerSlug: string;
  composioTriggerId: string | null;
  status: TriggerStatus;
  lastError?: string;
}

async function upsertTriggerRow(args: UpsertTriggerArgs): Promise<boolean> {
  // Unique (connectionId, triggerSlug) — onConflict makes this an upsert.
  const { error } = await supabase
    .from('IntegrationTrigger')
    .upsert(
      {
        connectionId: args.connectionId,
        triggerSlug: args.triggerSlug,
        composioTriggerId: args.composioTriggerId,
        status: args.status,
        lastError: args.lastError ?? null,
        updatedAt: new Date().toISOString(),
      },
      { onConflict: 'connectionId,triggerSlug' },
    );
  if (error) {
    logger.error('[integrations.triggers] upsert failed', {
      connectionId: args.connectionId,
      slug: args.triggerSlug,
      err: error.message,
    });
    return false;
  }
  return true;
}

export async function listTriggersForConnection(
  connectionId: string,
): Promise<IntegrationTriggerRow[]> {
  const { data, error } = await supabase
    .from('IntegrationTrigger')
    .select('*')
    .eq('connectionId', connectionId);
  if (error) {
    logger.warn('[integrations.triggers] list failed', { connectionId, err: error.message });
    return [];
  }
  return (data ?? []) as IntegrationTriggerRow[];
}

/**
 * Look up an IntegrationTrigger by Composio's trigger id — the join key
 * the webhook receiver has on hand. Returns null when the delivery
 * arrives for a trigger we don't track (stale registration, mid-disconnect).
 */
export async function findByComposioTriggerId(
  composioTriggerId: string,
): Promise<IntegrationTriggerRow | null> {
  const { data } = await supabase
    .from('IntegrationTrigger')
    .select('*')
    .eq('composioTriggerId', composioTriggerId)
    .maybeSingle();
  return (data ?? null) as IntegrationTriggerRow | null;
}

/** Stamp `lastFiredAt`. Non-blocking: a failure here doesn't fail dispatch. */
export async function stampFired(triggerRowId: string): Promise<void> {
  const { error } = await supabase
    .from('IntegrationTrigger')
    .update({ lastFiredAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .eq('id', triggerRowId);
  if (error) {
    logger.warn('[integrations.triggers] stampFired failed', { triggerRowId, err: error.message });
  }
}
