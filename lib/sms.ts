/**
 * Telnyx SMS integration.
 *
 * Sends SMS messages via the Telnyx API.
 * Requires TELNYX_API_KEY and TELNYX_FROM_NUMBER env vars.
 * Gracefully no-ops when credentials are missing.
 */

import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';
import type { Audience, MessageCategory } from '@/lib/messaging/compliance';

// Log a clear warning at module load time if Telnyx env vars are missing
if (!process.env.TELNYX_API_KEY) {
  logger.warn('[sms] TELNYX_API_KEY is not set — SMS notifications will be skipped');
}
if (!process.env.TELNYX_FROM_NUMBER) {
  logger.warn('[sms] TELNYX_FROM_NUMBER is not set — SMS notifications will be skipped');
} else if (!/^\+\d{10,15}$/.test(process.env.TELNYX_FROM_NUMBER)) {
  logger.warn('[sms] TELNYX_FROM_NUMBER is not a valid E.164 phone number');
}

let telnyxClient: any = null;

async function getClient() {
  if (!process.env.TELNYX_API_KEY) {
    logger.warn('[sms] Cannot create Telnyx client — TELNYX_API_KEY missing');
    return null;
  }
  if (!telnyxClient) {
    try {
      const telnyx = await import('telnyx');
      // The SDK exports both a default and named `Telnyx` constructor
      const TelnyxConstructor = telnyx.Telnyx ?? telnyx.default;
      telnyxClient = new TelnyxConstructor({ apiKey: process.env.TELNYX_API_KEY });
    } catch (err) {
      logger.error('[sms] Failed to initialize Telnyx SDK', undefined, err);
      return null;
    }
  }
  return telnyxClient;
}

export interface SendSMSParams {
  to: string;
  body: string;
  /** Optional public URLs for media attachments — when present Telnyx
   *  upgrades the message to MMS. Carrier-side limits apply (typically
   *  ~600 KB per asset, ~1 MB total). */
  mediaUrls?: string[];
  /**
   * WHO this message is for. REQUIRED — deliberately not optional and never
   * defaulted, because the whole point is that a consumer send cannot be
   * mislabelled by omission. TypeScript refuses to compile a call site that
   * hasn't decided.
   *
   *   'internal' — the realtor's own phone (their notifications, their daily
   *                brief). The customer relationship, not consumer outreach:
   *                skips the compliance gate.
   *   'consumer' — a lead, applicant, or tour guest. Goes through the TCPA
   *                gate in lib/messaging/compliance.ts (opt-out, consent,
   *                quiet hours), which requires spaceId.
   */
  audience: Audience;
  /**
   * Required for consumer sends: 'transactional' (something they asked for —
   * the tour they booked) vs 'marketing' (drip/nurture/promotional, which
   * requires express written consent on record). Defaults to the STRICTER
   * 'marketing' when omitted, so an unclassified consumer send fails closed.
   */
  category?: MessageCategory;
  /** Required for consumer sends — the compliance gate is per-space. */
  spaceId?: string;
  contactId?: string | null;
}

/**
 * Send an SMS via Telnyx. Returns true if sent, false if skipped/failed.
 * Never throws — errors are logged and swallowed.
 *
 * CONSUMER SENDS PASS THROUGH THE COMPLIANCE GATE (lib/messaging/compliance):
 * opted-out recipients, missing marketing consent, and quiet hours all block
 * the send here — inside the chokepoint — so no caller can bypass it.
 */
export async function sendSMS(params: SendSMSParams): Promise<boolean> {
  // ── Compliance gate (consumer audience only) ──────────────────────────
  if (params.audience === 'consumer') {
    if (!params.spaceId) {
      // Fail closed: a consumer send with no space cannot be checked.
      logger.error('[sms] blocked — consumer send without spaceId, cannot run the compliance gate');
      return false;
    }
    const { checkSendAllowed, withOptOutFooter } = await import('@/lib/messaging/compliance');
    const decision = await checkSendAllowed({
      spaceId: params.spaceId,
      channel: 'sms',
      address: params.to,
      audience: 'consumer',
      category: params.category ?? 'marketing',
      contactId: params.contactId ?? null,
    });
    if (!decision.allowed) {
      logger.warn('[sms] blocked by compliance gate', {
        reason: decision.reason,
        detail: decision.detail,
        spaceId: params.spaceId,
      });
      return false;
    }
    // Marketing messages carry the opt-out disclosure, always.
    if ((params.category ?? 'marketing') === 'marketing') {
      params = { ...params, body: withOptOutFooter(params.body) };
    }
  }
  return sendSMSUnchecked(params);
}

/** The raw transport. Private — everything goes through sendSMS's gate. */
async function sendSMSUnchecked(params: SendSMSParams): Promise<boolean> {
  const client = await getClient();
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!client || !fromNumber) {
    logger.warn('[sms] skipped — Telnyx credentials missing', {
      apiKeySet: Boolean(process.env.TELNYX_API_KEY),
      fromNumberSet: Boolean(fromNumber),
      to: params.to,
    });
    return false;
  }

  const toNumber = toE164(params.to);
  if (!toNumber) {
    logger.warn('[sms] invalid phone number', { to: params.to });
    return false;
  }

  // Block premium-rate numbers to prevent toll fraud
  const premiumPrefixes = ['+1900', '+1976', '+44870', '+44871', '+44872', '+44090', '+44091'];
  if (premiumPrefixes.some((prefix) => toNumber.startsWith(prefix))) {
    logger.warn('[sms] blocked premium-rate number', { to: toNumber });
    return false;
  }

  try {
    const hasMedia = Array.isArray(params.mediaUrls) && params.mediaUrls.length > 0;
    const response = await client.messages.send(
      {
        from: fromNumber,
        to: toNumber,
        text: params.body,
        // Including media_urls promotes the send from SMS to MMS server-side.
        // Telnyx expects an array of publicly fetchable URLs — caller is
        // responsible for making sure the URLs resolve without auth.
        ...(hasMedia ? { media_urls: params.mediaUrls } : {}),
      },
      // 10s per-attempt timeout, no retries. SMS here is best-effort — this
      // function never throws and the caller treats a `false` return as
      // "notification skipped". A hung Telnyx call must not pin a serverless
      // invocation open. The SDK retries timeouts by default (which would make
      // the real wall-clock bound ~3x), so maxRetries:0 keeps it a hard 10s;
      // on timeout the SDK rejects and we fall into the catch below.
      { timeout: 10_000, maxRetries: 0 },
    );
    logger.info('[sms] sent', {
      to: toNumber,
      messageId: response?.data?.id ?? 'unknown',
      bodyLength: params.body.length,
      mediaCount: hasMedia ? params.mediaUrls!.length : 0,
    });
    return true;
  } catch (err: any) {
    logger.error('[sms] send failed', {
      to: toNumber,
      status: err?.statusCode ?? err?.status,
      code: err?.code,
    }, err);
    return false;
  }
}

// ── Pre-built SMS templates ──────────────────────────────────────────────

export function newLeadSMS(p: { spaceName: string; leadName: string; leadPhone?: string | null; phone: string; scoreLabel?: string | null }): SendSMSParams {
  const score = p.scoreLabel ? ` (${p.scoreLabel})` : '';
  const leadContact = p.leadPhone ? ` Phone: ${p.leadPhone}.` : '';
  return {
    audience: 'internal',
    to: p.phone,
    body: `[${p.spaceName}] New lead: ${p.leadName}${score}.${leadContact} Open your dashboard to review.`,
  };
}

export function newTourSMS(p: { spaceName: string; guestName: string; date: string; time: string; property?: string | null; phone: string }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    audience: 'internal',
    to: p.phone,
    body: `[${p.spaceName}] New tour booked: ${p.guestName}${prop} on ${p.date} at ${p.time}. Check your dashboard for details.`,
  };
}

export function tourConfirmationSMS(p: { guestName: string; guestPhone: string; spaceId: string; businessName: string; date: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    // The guest asked for this tour — transactional, not marketing.
    audience: 'consumer',
    category: 'transactional',
    spaceId: p.spaceId,
    to: p.guestPhone,
    body: `Hi ${p.guestName}! Your tour with ${p.businessName}${prop} is confirmed for ${p.date} at ${p.time}. Contact your agent if you need to reschedule.`,
  };
}

export function tourReminderSMS(p: { guestName: string; guestPhone: string; spaceId: string; businessName: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    // The guest asked for this tour — transactional, not marketing.
    audience: 'consumer',
    category: 'transactional',
    spaceId: p.spaceId,
    to: p.guestPhone,
    body: `Hi ${p.guestName}, reminder: your tour with ${p.businessName}${prop} is tomorrow at ${p.time}. See you there!`,
  };
}

export function tourRescheduledSMS(p: { guestName: string; guestPhone: string; spaceId: string; businessName: string; date: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    // The guest asked for this tour — transactional, not marketing.
    audience: 'consumer',
    category: 'transactional',
    spaceId: p.spaceId,
    to: p.guestPhone,
    body: `Hi ${p.guestName}, your tour with ${p.businessName}${prop} has been moved to ${p.date} at ${p.time}. Reply if that doesn't work.`,
  };
}

export function tourCancelledSMS(p: { guestName: string; guestPhone: string; spaceId: string; businessName: string; date: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    // The guest asked for this tour — transactional, not marketing.
    audience: 'consumer',
    category: 'transactional',
    spaceId: p.spaceId,
    to: p.guestPhone,
    body: `Hi ${p.guestName}, your tour with ${p.businessName}${prop} on ${p.date} has been cancelled. Reply to rebook.`,
  };
}

export function newDealSMS(p: { spaceName: string; dealTitle: string; value?: string | null; phone: string }): SendSMSParams {
  const val = p.value ? ` (${p.value})` : '';
  return {
    audience: 'internal',
    to: p.phone,
    body: `[${p.spaceName}] New deal created: ${p.dealTitle}${val}. Open your dashboard to manage it.`,
  };
}

export function followUpReminderSMS(p: { spaceName: string; contactName: string; phone: string }): SendSMSParams {
  return {
    audience: 'internal',
    to: p.phone,
    body: `[${p.spaceName}] Reminder: Follow up with ${p.contactName} today. Open your dashboard to review.`,
  };
}
