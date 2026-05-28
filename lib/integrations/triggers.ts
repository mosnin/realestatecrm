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
import { logger } from '@/lib/logger';
import { createTrigger, deleteTrigger } from './composio';
import { fireRoutineRun } from '@/lib/routines';
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

function pickString(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function pickNested(obj: Record<string, unknown>, path: string[]): unknown {
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

/**
 * Per-slug templates. Each fn receives the trigger payload and returns
 * the natural-language instruction the autonomous Modal run will see —
 * or null when the payload is too thin to act on, in which case the
 * dispatcher skips the run instead of burning Modal time on no-op
 * context.
 *
 * Templates pull fields defensively: Composio's payload shapes differ
 * between webhook V1/V2/V3 and across toolkit-specific normalisations.
 * Each field has 2–3 likely names tried in order; we bail if none
 * resolve and the model would get a content-free instruction.
 *
 * Style: ≤8 short lines. Frame the event, give the model the data,
 * say what's noise vs signal. The model decides whether to draft.
 */
const TEMPLATES: Record<string, (p: Record<string, unknown>) => string | null> = {
  GMAIL_NEW_GMAIL_MESSAGE(p) {
    const subject = pickString(p, 'subject', 'messageSubject');
    const from = pickString(p, 'sender', 'from', 'fromEmail');
    const snippet = pickString(p, 'preview', 'snippet', 'messageText');
    if (!subject && !from && !snippet) return null;
    return [
      "A new email arrived in the realtor's inbox. Here's what we know:",
      '',
      subject && `Subject: ${subject}`,
      from && `From: ${from}`,
      snippet && `Snippet: ${snippet}`,
      '',
      "If this looks like it needs a response — it's from a known contact, references a property/showing/offer, or asks a real question — read the full thread and draft a reply for me to approve. If it's noise (newsletter, system message, cold pitch), do nothing.",
    ].filter(Boolean).join('\n');
  },

  OUTLOOK_MESSAGE_TRIGGER(p) {
    const subject = pickString(p, 'subject', 'messageSubject');
    const from = pickString(p, 'from', 'sender', 'fromEmail', 'senderEmail');
    const snippet = pickString(p, 'bodyPreview', 'preview', 'snippet');
    if (!subject && !from && !snippet) return null;
    return [
      "A new email arrived in the realtor's Outlook inbox. Here's what we know:",
      '',
      subject && `Subject: ${subject}`,
      from && `From: ${from}`,
      snippet && `Snippet: ${snippet}`,
      '',
      "Same rules as Gmail — known contact / property / real question → draft a reply. Noise → do nothing.",
    ].filter(Boolean).join('\n');
  },

  SLACK_DIRECT_MESSAGE_RECEIVED(p) {
    const from = pickString(p, 'user', 'userId', 'userName', 'sender');
    const text = pickString(p, 'text', 'message', 'messageText');
    if (!text) return null;
    return [
      'A direct message arrived on Slack.',
      '',
      from && `From: ${from}`,
      `Message: ${text}`,
      '',
      "If it's a real question or coordination need (a co-agent, a client, a coordinator), draft a response. If it's a noise channel notification or an automated alert, do nothing.",
    ].filter(Boolean).join('\n');
  },

  SLACK_REACTION_ADDED(p) {
    const reaction = pickString(p, 'reaction', 'emoji');
    const user = pickString(p, 'user', 'userName');
    if (!reaction) return null;
    return [
      `Someone reacted on Slack with :${reaction}:${user ? ` (from ${user})` : ''}.`,
      '',
      "Usually noise on its own — only surface this if it looks like a confirmation or rejection on something we asked. Otherwise do nothing.",
    ].filter(Boolean).join('\n');
  },

  DISCORD_NEW_MESSAGE_TRIGGER(p) {
    const author = pickString(p, 'author', 'userName', 'username');
    const text = pickString(p, 'content', 'text', 'message');
    if (!text) return null;
    return [
      'A new Discord message arrived.',
      '',
      author && `From: ${author}`,
      `Message: ${text}`,
      '',
      "Real question or coordination → draft a response. Channel noise → do nothing.",
    ].filter(Boolean).join('\n');
  },

  GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER(p) {
    const summary = pickString(p, 'summary', 'title');
    const status = pickString(p, 'responseStatus', 'response', 'status');
    const attendee = pickString(p, 'attendee', 'email', 'attendeeEmail');
    if (!summary && !attendee) return null;
    return [
      'A calendar attendee changed their RSVP.',
      '',
      summary && `Event: ${summary}`,
      attendee && `Attendee: ${attendee}`,
      status && `New status: ${status}`,
      '',
      "If the event is a tour or client meeting and the attendee declined, draft a polite follow-up offering to reschedule. If they accepted, confirm warmly. If it's an internal/team event, do nothing.",
    ].filter(Boolean).join('\n');
  },

  GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER(p) {
    const summary = pickString(p, 'summary', 'title');
    const start = pickString(p, 'startTime', 'start', 'startDateTime');
    if (!summary) return null;
    return [
      'A calendar event was canceled or deleted.',
      '',
      `Event: ${summary}`,
      start && `Was scheduled for: ${start}`,
      '',
      "If this was a tour or client meeting, draft a follow-up to the contact acknowledging and offering to reschedule. Internal event → do nothing.",
    ].filter(Boolean).join('\n');
  },

  GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER(p) {
    const summary = pickString(p, 'summary', 'title');
    const attendees = (() => {
      const a = pickNested(p, ['attendees']);
      return Array.isArray(a) ? a.map((x) => (typeof x === 'object' && x ? (x as Record<string, unknown>).email : null)).filter(Boolean).join(', ') : null;
    })();
    if (!summary) return null;
    return [
      "A calendar event is starting soon.",
      '',
      `Event: ${summary}`,
      attendees && `With: ${attendees}`,
      '',
      "Refresh me on who this is with, what we know about them from CRM and past threads, and anything pending I should address in this meeting. Be concise — I'm walking in.",
    ].filter(Boolean).join('\n');
  },

  HUBSPOT_CONTACT_CREATED_TRIGGER(p) {
    const props = (pickNested(p, ['properties']) as Record<string, unknown>) ?? p;
    const name = pickString(props, 'firstname', 'firstName', 'name') ?? null;
    const last = pickString(props, 'lastname', 'lastName') ?? null;
    const email = pickString(props, 'email');
    const phone = pickString(props, 'phone', 'mobilephone');
    if (!name && !last && !email && !phone) return null;
    const fullName = [name, last].filter(Boolean).join(' ') || null;
    return [
      'A new contact was just created in HubSpot.',
      '',
      fullName && `Name: ${fullName}`,
      email && `Email: ${email}`,
      phone && `Phone: ${phone}`,
      '',
      "Tell me where this contact likely came from (form, import, manual?) and whether I should reach out. If yes, draft an opener tuned to what we know. If the contact looks like a system/import row, do nothing.",
    ].filter(Boolean).join('\n');
  },

  HUBSPOT_DEAL_STAGE_UPDATED_TRIGGER(p) {
    const props = (pickNested(p, ['properties']) as Record<string, unknown>) ?? p;
    const dealName = pickString(props, 'dealname', 'name');
    const stage = pickString(props, 'dealstage', 'stage');
    const prior = pickString(props, 'previousStage', 'priorStage');
    if (!dealName && !stage) return null;
    return [
      'A HubSpot deal moved stages.',
      '',
      dealName && `Deal: ${dealName}`,
      prior && `From: ${prior}`,
      stage && `To: ${stage}`,
      '',
      "Tell me whether the move warrants client communication — congratulating an accepted offer, nudging a stalled negotiation, etc. Draft the message if so. If it's a routine stage tick, do nothing.",
    ].filter(Boolean).join('\n');
  },

  SALESFORCE_NEW_LEAD_TRIGGER(p) {
    const name = pickString(p, 'name', 'leadName', 'firstName');
    const company = pickString(p, 'company', 'companyName');
    const source = pickString(p, 'leadSource', 'source');
    if (!name && !company) return null;
    return [
      'A new lead landed in Salesforce.',
      '',
      name && `Name: ${name}`,
      company && `Company: ${company}`,
      source && `Source: ${source}`,
      '',
      "Tell me what we know about this lead and draft an opener if a first touch is warranted. If it looks like a junk/test row, do nothing.",
    ].filter(Boolean).join('\n');
  },

  SALESFORCE_NEW_OR_UPDATED_OPPORTUNITY_TRIGGER(p) {
    const name = pickString(p, 'name', 'opportunityName');
    const stage = pickString(p, 'stageName', 'stage');
    const amount = pickString(p, 'amount');
    if (!name) return null;
    return [
      'A Salesforce opportunity was created or updated.',
      '',
      `Opportunity: ${name}`,
      stage && `Stage: ${stage}`,
      amount && `Amount: ${amount}`,
      '',
      "If the change is meaningful (stage advance, amount delta, close-date move), tell me what changed and whether I should reach out. Otherwise do nothing.",
    ].filter(Boolean).join('\n');
  },

  PIPEDRIVE_NEW_DEAL_TRIGGER(p) {
    const title = pickString(p, 'title', 'dealTitle', 'name');
    const value = pickString(p, 'value', 'amount');
    const person = pickString(p, 'personName', 'contactName', 'person');
    if (!title) return null;
    return [
      'A new deal was created in Pipedrive.',
      '',
      `Deal: ${title}`,
      person && `Contact: ${person}`,
      value && `Value: ${value}`,
      '',
      "Tell me what we know and draft an opener if the contact is fresh. Skip if it looks like an internal/test row.",
    ].filter(Boolean).join('\n');
  },

  STRIPE_CHECKOUT_SESSION_COMPLETED_TRIGGER(p) {
    const amount = pickString(p, 'amount_total', 'amount', 'totalAmount');
    const email = pickString(p, 'customer_email', 'email', 'customerEmail');
    const desc = pickString(p, 'description', 'metadata.description');
    if (!amount && !email) return null;
    return [
      'A Stripe payment just came through.',
      '',
      amount && `Amount: ${amount}`,
      email && `From: ${email}`,
      desc && `For: ${desc}`,
      '',
      "Draft a short thank-you / confirmation to the customer, and note in CRM if this is an earnest deposit, retainer, or service fee. Match the tone to what we already knew about this person.",
    ].filter(Boolean).join('\n');
  },

  STRIPE_PAYMENT_FAILED_TRIGGER(p) {
    const email = pickString(p, 'customer_email', 'email', 'customerEmail');
    const reason = pickString(p, 'failure_message', 'reason', 'failureReason');
    if (!email && !reason) return null;
    return [
      'A Stripe payment just failed.',
      '',
      email && `Customer: ${email}`,
      reason && `Reason: ${reason}`,
      '',
      "Draft a polite, low-friction follow-up letting them know we'll retry and asking them to update payment details if needed. Don't sound alarming — most failures are bank-side, not customer intent.",
    ].filter(Boolean).join('\n');
  },

  STRIPE_INVOICE_PAYMENT_SUCCEEDED_TRIGGER(p) {
    const amount = pickString(p, 'amount_paid', 'amount', 'totalAmount');
    const email = pickString(p, 'customer_email', 'email', 'customerEmail');
    if (!amount && !email) return null;
    return [
      'A Stripe invoice was paid.',
      '',
      amount && `Amount: ${amount}`,
      email && `Customer: ${email}`,
      '',
      "If this is a recurring retainer, no action — just stamp the CRM. If it's a one-off, send a brief confirmation.",
    ].filter(Boolean).join('\n');
  },

  ASANA_TASK_CREATED(p) {
    const name = pickString(p, 'name', 'taskName');
    const assignee = pickString(p, 'assignee', 'assigneeName');
    if (!name) return null;
    return [
      'A new task landed in Asana.',
      '',
      `Task: ${name}`,
      assignee && `Assigned to: ${assignee}`,
      '',
      "If the task is one I would owe to a client (callback, follow-up, doc send), surface it as a today-item. If it's an internal team task, do nothing.",
    ].filter(Boolean).join('\n');
  },

  ASANA_TASK_COMMENT_ADDED(p) {
    const task = pickString(p, 'taskName', 'name');
    const author = pickString(p, 'author', 'commenter');
    const comment = pickString(p, 'text', 'comment', 'commentText');
    if (!comment) return null;
    return [
      'A new comment appeared on an Asana task.',
      '',
      task && `Task: ${task}`,
      author && `From: ${author}`,
      `Comment: ${comment}`,
      '',
      "If it's a question or blocker, tell me what's needed. Otherwise do nothing.",
    ].filter(Boolean).join('\n');
  },

  TRELLO_NEW_CARD_TRIGGER(p) {
    const name = pickString(p, 'name', 'cardName');
    const list = pickString(p, 'listName', 'list');
    if (!name) return null;
    return [
      'A new Trello card was created.',
      '',
      `Card: ${name}`,
      list && `List: ${list}`,
      '',
      "If the card represents work I owe a client, surface it. Otherwise do nothing.",
    ].filter(Boolean).join('\n');
  },

  TRELLO_UPDATED_CARD_TRIGGER(p) {
    const name = pickString(p, 'name', 'cardName');
    const change = pickString(p, 'change', 'updateType');
    if (!name) return null;
    return [
      'A Trello card was updated.',
      '',
      `Card: ${name}`,
      change && `Change: ${change}`,
      '',
      "If this is a status that matters to a client (e.g., closing checklist item), tell me. Otherwise do nothing.",
    ].filter(Boolean).join('\n');
  },

  MAILCHIMP_SUBSCRIBE_TRIGGER(p) {
    const email = pickString(p, 'email', 'emailAddress');
    const listName = pickString(p, 'listName', 'list');
    if (!email) return null;
    return [
      'Someone just subscribed to a Mailchimp list.',
      '',
      `Email: ${email}`,
      listName && `List: ${listName}`,
      '',
      "If we recognise this person from CRM, surface what we know. If they're new, draft a low-key welcome and add them as a lead.",
    ].filter(Boolean).join('\n');
  },

  MAILCHIMP_UNSUBSCRIBE_TRIGGER(p) {
    const email = pickString(p, 'email', 'emailAddress');
    if (!email) return null;
    return [
      'Someone unsubscribed from a Mailchimp list.',
      '',
      `Email: ${email}`,
      '',
      "If they're a known CRM contact, flag the relationship — they may have signaled they want less from us, which is useful context. No outreach.",
    ].filter(Boolean).join('\n');
  },
};

/**
 * Per-slug instruction templater. Given the trigger's payload, returns
 * the natural-language instruction the autonomous Modal run will see —
 * or null when the payload is too thin to act on (the dispatcher then
 * skips the run rather than burn Modal time on a content-free prompt).
 *
 * A slug missing from TEMPLATES returns null — dispatch then logs a gap
 * and no-ops. Adding a slug to CURATED_TRIGGERS without a template is
 * caught by the test suite.
 */
function templateInstruction(
  triggerSlug: string,
  payload: Record<string, unknown> | undefined,
): string | null {
  const fn = TEMPLATES[triggerSlug];
  if (!fn) return null;
  return fn(payload ?? {});
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

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
    try {
      const { triggerId } = await createTrigger({
        entityId: args.connection.userId,
        slug,
        connectedAccountId: args.connection.composioConnectionId,
      });
      const ok = await upsertTriggerRow({
        connectionId: args.connection.id,
        triggerSlug: slug,
        composioTriggerId: triggerId,
        status: 'active',
      });
      if (ok) registered++;
      else failed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[integrations.triggers] registration failed', {
        toolkit: args.connection.toolkit,
        slug,
        connectionId: args.connection.id,
        err: message,
      });
      // Record the failure so a later reconcile can see we tried.
      await upsertTriggerRow({
        connectionId: args.connection.id,
        triggerSlug: slug,
        composioTriggerId: null,
        status: 'failed',
        lastError: message,
      });
      failed++;
    }
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

/**
 * Per-connection trigger summary for the integrations list endpoint.
 * Three states:
 *   - "off"     → no triggers registered (toolkit has empty CURATED_TRIGGERS)
 *   - "active"  → at least one trigger active
 *   - "paused"  → at least one trigger registered but all paused
 * Returns null entries for connection IDs with no rows.
 */
export async function summariesForConnections(connectionIds: string[]): Promise<
  Record<string, 'off' | 'active' | 'paused'>
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
  const map: Record<string, 'off' | 'active' | 'paused'> = {};
  for (const id of connectionIds) map[id] = 'off';
  for (const r of rows) {
    // 'active' wins over 'paused' wins over 'off'.
    if (r.status === 'active') map[r.connectionId] = 'active';
    else if (r.status === 'paused' && map[r.connectionId] !== 'active') {
      map[r.connectionId] = 'paused';
    }
  }
  return map;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

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
}): Promise<{ dispatched: 'DRAFT' | 'NOTICE' | 'DATA_SYNC' | 'noop'; reason?: string }> {
  const kind: TriggerKind | undefined = TRIGGER_DISPATCH[args.triggerSlug];
  if (!kind) {
    logger.info('[integrations.triggers] no dispatch handler — dropping', {
      slug: args.triggerSlug,
      connectionId: args.connection.id,
    });
    return { dispatched: 'noop', reason: 'no_dispatch' };
  }

  if (kind === 'DRAFT') {
    const instruction = templateInstruction(args.triggerSlug, args.payload);
    if (!instruction) {
      logger.info('[integrations.triggers] payload too thin — skipping draft', {
        slug: args.triggerSlug,
        connectionId: args.connection.id,
      });
      return { dispatched: 'noop', reason: 'thin_payload' };
    }
    await fireRoutineRun(args.connection.spaceId, instruction, args.connection.userId);
    return { dispatched: 'DRAFT' };
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
  return { dispatched: 'noop', reason: 'unwired_kind' };
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
