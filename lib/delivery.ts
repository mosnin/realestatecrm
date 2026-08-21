/**
 * Draft delivery — routes approved agent drafts to the right channel.
 *
 * Email routing precedence (when the realtor has connected an inbox):
 *   1. Realtor's connected Gmail/Outlook via Composio (sends as the realtor —
 *      their address, their domain, their reply-to). Requires {spaceId, userId}
 *      in options + an active IntegrationConnection row for the toolkit.
 *   2. Resend with the shared RESEND_FROM_EMAIL (platform-branded sender —
 *      used for realtors who haven't connected their own inbox yet, and as the
 *      automatic fallback when the connected-inbox send fails; see below).
 *
 * If a connected inbox is found but the Composio send fails (the SDK throws,
 * returns not-successful, or Composio isn't configured), we DON'T just give up
 * — losing a human-approved transactional message is the worst outcome. We
 * fall back to the shared Resend sender (best-effort, well-logged) so the
 * message still goes out. The result records this: `method` becomes 'email',
 * `fallback` is true, and `primaryError` carries the original inbox failure so
 * the realtor can still be told "we sent this from the platform address, not
 * your inbox — reconnect to send as yourself." Identity drift is recoverable;
 * a silently-dropped message is not.
 *
 * The not-configured-vs-failed distinction is preserved end-to-end: a missing
 * inbox connection skips straight to Resend (config gap, not a failure), and
 * if Resend itself is unconfigured we return { sent: false, error:
 * 'not_configured' } rather than pretending we sent.
 *
 * SMS routing:
 *   1. Telnyx REST (only path for now; per-realtor SMS-as-themselves is
 *      a follow-up that requires per-realtor 10DLC approval).
 *
 * Notes: no external delivery; treated as immediately "sent" (internal log).
 *
 * Returns a DeliveryResult so the caller can decide the final draft status:
 *   sent=true  → mark draft "sent"
 *   sent=false → mark draft "approved" (human reviewed; delivery failed or
 *                unconfigured); the realtor sees the error in the UI.
 */

import { Resend } from 'resend';
import { supabase } from '@/lib/supabase';
import { toE164 } from '@/lib/phone';
import {
  composioConfigured,
  executeToolForEntity,
} from '@/lib/integrations/composio';
import { logger } from '@/lib/logger';

export interface DeliveryResult {
  sent: boolean;
  /** 'gmail' / 'outlook' = via realtor's inbox; 'email' = via shared Resend. */
  method: 'gmail' | 'outlook' | 'email' | 'sms' | 'note';
  error?: string;
  /**
   * True when the primary path (the realtor's connected inbox) failed and we
   * delivered via the shared Resend sender instead. `method` already reflects
   * the path that actually delivered ('email'); this flag lets callers tell a
   * fallback delivery apart from a first-choice shared-sender delivery, and
   * `primaryError` carries the original inbox failure for surfacing/telemetry.
   */
  fallback?: boolean;
  /** The primary (inbox) error that triggered the Resend fallback, if any. */
  primaryError?: string;
}

export interface DraftPayload {
  channel: 'email' | 'sms' | 'note';
  subject: string | null;
  content: string;
}

export interface ContactPayload {
  name: string;
  email: string | null;
  phone: string | null;
}

/**
 * Context for routing the send. Both fields are needed to attempt inbox-
 * connect; absent either, we fall back to Resend.
 */
export interface SendDraftOptions {
  /** Space ID — scopes the IntegrationConnection lookup. */
  spaceId?: string;
  /** Clerk userId of the realtor who approved the draft. Becomes the
   *  Composio entity id for the OAuth lookup. */
  userId?: string;
}

// ─── Inbox-connect: send as the realtor via Composio ──────────────────────────

type InboxToolkit = 'gmail' | 'outlook';

/** Composio action slugs for "send mail" per toolkit. */
const INBOX_SEND_SLUG: Record<InboxToolkit, string> = {
  gmail: 'GMAIL_SEND_EMAIL',
  outlook: 'OUTLOOK_SEND_EMAIL',
};

/**
 * Returns the first active inbox toolkit connected for this (space, user),
 * or null. Gmail wins ties because it's the dominant realtor inbox; if a
 * realtor has both, the deliberate fallback to Outlook would need an
 * explicit per-space preference (not built yet — configuration is failure
 * to decide).
 */
async function activeInboxToolkit(
  spaceId: string,
  userId: string,
): Promise<InboxToolkit | null> {
  const { data, error } = await supabase
    .from('IntegrationConnection')
    .select('toolkit')
    .eq('spaceId', spaceId)
    .eq('userId', userId)
    .eq('status', 'active')
    .in('toolkit', ['gmail', 'outlook']);

  if (error || !data?.length) return null;
  const toolkits = new Set(data.map((r) => r.toolkit));
  if (toolkits.has('gmail')) return 'gmail';
  if (toolkits.has('outlook')) return 'outlook';
  return null;
}

async function deliverViaInbox(
  toolkit: InboxToolkit,
  draft: DraftPayload,
  contact: ContactPayload,
  userId: string,
): Promise<DeliveryResult> {
  if (!contact.email) {
    return { sent: false, method: toolkit, error: 'Contact has no email address' };
  }
  if (!composioConfigured()) {
    return { sent: false, method: toolkit, error: 'composio_not_configured' };
  }

  try {
    const res = await executeToolForEntity({
      entityId: userId,
      slug: INBOX_SEND_SLUG[toolkit],
      arguments: {
        // Both Gmail and Outlook composio actions accept this shape. If the
        // action surface changes (Composio bumps a version), the failure
        // mode is a clean error from the SDK, not a silent misdelivery.
        recipient_email: contact.email,
        to: contact.email,
        subject: draft.subject ?? 'A message for you',
        body: draft.content,
      },
    });

    // The SDK's ToolExecuteResponse has `successful` and `error`. Map to
    // our shape so the caller never needs to know which provider we used.
    const successful = (res as { successful?: boolean }).successful;
    if (successful === false) {
      const err = (res as { error?: string | null }).error ?? 'inbox_send_failed';
      logger.warn('[delivery] inbox send returned not-successful', {
        toolkit,
        error: err,
      });
      return { sent: false, method: toolkit, error: err };
    }
    return { sent: true, method: toolkit };
  } catch (err) {
    logger.error('[delivery] inbox send threw', { toolkit }, err as Error);
    return { sent: false, method: toolkit, error: (err as Error).message };
  }
}

// ─── Email via Resend (shared-sender fallback) ────────────────────────────────

async function deliverEmail(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  // The rest of the codebase (lib/email.ts, lib/tour-emails.ts, env.ts,
  // .env.example) standardizes on RESEND_FROM_EMAIL; FROM_EMAIL was a stray
  // key here that no environment actually sets, which quietly made this path
  // report "not_configured" even when Resend was fully wired. Read the real
  // key, keep FROM_EMAIL as a backward-compatible fallback.
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? process.env.FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return { sent: false, method: 'email', error: 'not_configured' };
  }
  if (!contact.email) {
    return { sent: false, method: 'email', error: 'Contact has no email address' };
  }

  try {
    const resend = new Resend(apiKey);
    const from = fromEmail.includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;

    const { error } = await resend.emails.send({
      from,
      to: contact.email,
      subject: draft.subject ?? 'A message for you',
      text: draft.content,
    });

    if (error) return { sent: false, method: 'email', error: error.message };
    return { sent: true, method: 'email' };
  } catch (err) {
    return { sent: false, method: 'email', error: String(err) };
  }
}

/**
 * Run the shared Resend sender as a FALLBACK after the realtor's inbox path
 * failed, and reconcile the two outcomes into one DeliveryResult.
 *
 *   Resend succeeds → { sent: true, method: 'email', fallback: true,
 *                       primaryError } so the caller can still tell the realtor
 *                       "delivered via the platform address, not your inbox."
 *   Resend fails    → { sent: false } with a combined error naming BOTH the
 *                     inbox failure and the Resend failure, and Resend's own
 *                     'not_configured' marker preserved when that's the cause
 *                     (keeps the not-configured-vs-failed distinction intact).
 */
async function fallbackToResend(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
  primaryError: string | undefined,
): Promise<DeliveryResult> {
  const result = await deliverEmail(draft, contact, fromName);

  if (result.sent) {
    logger.info('[delivery] shared-sender fallback delivered after inbox failure', {
      primaryError,
    });
    return { ...result, fallback: true, primaryError };
  }

  // Both paths failed — give the caller the whole story in one error string,
  // but keep the machine-readable 'not_configured' marker when the shared
  // sender simply wasn't set up (vs. an actual send rejection).
  logger.error('[delivery] shared-sender fallback also failed', {
    primaryError,
    fallbackError: result.error,
  });
  const combined =
    result.error === 'not_configured'
      ? `inbox send failed (${primaryError ?? 'unknown'}); fallback sender not_configured`
      : `inbox send failed (${primaryError ?? 'unknown'}); fallback also failed (${result.error ?? 'unknown'})`;
  return { ...result, fallback: true, primaryError, error: combined };
}

// ─── SMS via Telnyx REST API ──────────────────────────────────────────────────

async function deliverSms(
  draft: DraftPayload,
  contact: ContactPayload,
): Promise<DeliveryResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !fromNumber) {
    return { sent: false, method: 'sms', error: 'not_configured' };
  }
  if (!contact.phone) {
    return { sent: false, method: 'sms', error: 'Contact has no phone number' };
  }

  // Contact.phone is stored as the realtor typed it. Telnyx requires E.164;
  // sending "(415) 555-0123" or "14155550123" is a hard provider rejection.
  const toNumber = toE164(contact.phone);
  if (!toNumber) {
    return { sent: false, method: 'sms', error: 'Contact phone is not a valid number' };
  }

  try {
    const res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromNumber,
        to: toNumber,
        text: draft.content,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMsg =
        (body as { errors?: { detail?: string }[] }).errors?.[0]?.detail ??
        `Telnyx error ${res.status}`;
      return { sent: false, method: 'sms', error: errMsg };
    }
    return { sent: true, method: 'sms' };
  } catch (err) {
    return { sent: false, method: 'sms', error: String(err) };
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Attempt to deliver an approved draft to the contact.
 *
 * @param draft    The draft to deliver (channel, subject, content)
 * @param contact  The recipient (name, email, phone)
 * @param fromName Display name to use as the email sender (e.g. space name)
 *                 — only used when falling back to the shared Resend path.
 * @param options  Per-realtor context that enables inbox-connect routing.
 *                 Both spaceId and userId required; if either is missing,
 *                 we skip the inbox lookup and use the shared sender.
 */
export async function sendDraft(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
  options: SendDraftOptions = {},
): Promise<DeliveryResult> {
  switch (draft.channel) {
    case 'email': {
      // Try the realtor's connected inbox first. The point of inbox-connect
      // is "every email looks like it came from the realtor, on their
      // domain, with their reply-to" — that semantic is preserved across
      // their whole book of business once they've connected once.
      if (options.spaceId && options.userId) {
        try {
          const toolkit = await activeInboxToolkit(options.spaceId, options.userId);
          if (toolkit) {
            const primary = await deliverViaInbox(toolkit, draft, contact, options.userId);
            if (primary.sent) return primary;

            // Primary path (the realtor's inbox) failed — threw, returned
            // not-successful, or Composio isn't configured. Rather than drop a
            // human-approved message, fall back to the shared Resend sender.
            // Best-effort: if Resend also fails we surface BOTH errors.
            logger.warn(
              '[delivery] inbox send failed; falling back to shared sender',
              { toolkit, primaryError: primary.error },
            );
            return fallbackToResend(draft, contact, fromName, primary.error);
          }
        } catch (err) {
          // Lookup failure must not block the send — fall back to Resend.
          // We log but don't bail because the realtor still needs to be
          // able to send when the integration-connection table is unhappy.
          logger.warn('[delivery] inbox lookup failed; falling back to shared sender', {
            spaceId: options.spaceId,
          }, err as Error);
        }
      }
      // No connected inbox (or the lookup itself blew up) — shared sender is
      // the first-choice path here, not a fallback, so no fallback metadata.
      return deliverEmail(draft, contact, fromName);
    }
    case 'sms':
      return deliverSms(draft, contact);
    case 'note':
      // Notes are internal — no external delivery; mark as sent immediately
      return { sent: true, method: 'note' };
  }
}
