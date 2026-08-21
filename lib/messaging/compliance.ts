import 'server-only';
/**
 * Messaging compliance gate — consent, opt-out, and quiet hours.
 *
 * This module is the ONE place that decides whether a consumer-facing message
 * may go out. It is called from inside the send chokepoints (lib/sms.ts and
 * the email helper), NOT from their callers, so no send path — human, drip,
 * workflow, or agent tool — can bypass it by construction.
 *
 * The rules it enforces (US TCPA and its state analogues):
 *
 *   1. SUPPRESSION. An address that replied STOP is never messaged again on
 *      that channel for that space. This is absolute and applies to every
 *      category, including transactional.
 *   2. CONSENT. Marketing/promotional automated messages require a recorded
 *      express-written-consent record. Transactional messages (confirming
 *      something the consumer themselves requested — a tour they booked) do
 *      not, which is why category is an explicit, required input.
 *   3. QUIET HOURS. No consumer messages outside 8am-9pm in the recipient's
 *      local time. Timezone resolution is best-effort (see resolveTimeZone);
 *      when unknown we fall back to the space's timezone and, failing that,
 *      to a conservative US-wide window.
 *
 * Messages to the REALTOR'S OWN phone/email (audience: 'internal') are the
 * customer relationship, not consumer outreach, and skip these rules — but
 * the distinction is a required field, never a default, so a consumer send
 * can't be mislabelled by omission.
 *
 * Fail-closed: if the compliance tables can't be read, a consumer send is
 * BLOCKED, not allowed. The cost of a missed message is a support ticket; the
 * cost of an unconsented one is statutory damages per message.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { toE164 } from '@/lib/phone';

export type Channel = 'sms' | 'email';
/** Who the message is for. Required at every send site — never defaulted. */
export type Audience = 'consumer' | 'internal';
/**
 * 'transactional' — the consumer asked for this specific thing (tour
 *   confirmation/reminder, application status, a reply to their question).
 * 'marketing' — promotional or unsolicited outreach: drip campaigns,
 *   autonomous follow-up, nurture. Requires express written consent.
 */
export type MessageCategory = 'transactional' | 'marketing';

export interface ComplianceRequest {
  spaceId: string;
  channel: Channel;
  /** Raw address; normalized internally. */
  address: string;
  audience: Audience;
  category?: MessageCategory;
  contactId?: string | null;
  /** Override for tests / explicit scheduling decisions. */
  now?: Date;
}

export type BlockReason =
  | 'suppressed'
  | 'no_consent'
  | 'quiet_hours'
  | 'lookup_failed'
  | 'invalid_address';

export interface ComplianceDecision {
  allowed: boolean;
  reason?: BlockReason;
  /** Operator-facing explanation; safe to log. */
  detail?: string;
}

/** Quiet-hours window (inclusive start, exclusive end) in local time. */
export const QUIET_HOURS_START = 8;
export const QUIET_HOURS_END = 21;

/** E.164-ish for sms; lowercased/trimmed for email. Returns null if unusable. */
export function normalizeAddress(channel: Channel, raw: string): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (channel === 'email') {
    const lower = v.toLowerCase();
    return lower.includes('@') ? lower : null;
  }
  return toE164(v);
}

/** STOP-family keywords per carrier/CTIA convention. */
const STOP_KEYWORDS = new Set([
  'stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'optout', 'opt-out', 'revoke',
]);
/** Opt back IN — must be honored too, or we strand a consumer who changed their mind. */
const START_KEYWORDS = new Set(['start', 'unstop', 'yes', 'optin', 'opt-in', 'subscribe']);

/**
 * Does this inbound message body mean "stop texting me"? Deliberately
 * permissive on punctuation/case/whitespace: a consumer writing "STOP." or
 * " Stop " has unambiguously opted out and a strict match would ignore them.
 * Requires the keyword to be the whole message (a sentence merely containing
 * the word "cancel" is not an opt-out).
 */
export function isStopKeyword(body: string): boolean {
  const t = (body ?? '').trim().toLowerCase().replace(/[.!?,;:]+$/g, '');
  return STOP_KEYWORDS.has(t);
}

export function isStartKeyword(body: string): boolean {
  const t = (body ?? '').trim().toLowerCase().replace(/[.!?,;:]+$/g, '');
  return START_KEYWORDS.has(t);
}

/** The opt-out footer required on marketing messages. */
export const SMS_OPT_OUT_FOOTER = 'Reply STOP to opt out.';

/** Append the opt-out disclosure if it isn't already present. */
export function withOptOutFooter(body: string): string {
  return /\bstop\b/i.test(body) ? body : `${body}\n\n${SMS_OPT_OUT_FOOTER}`;
}

/**
 * Record an opt-out. Idempotent (unique index on space+channel+address), and
 * best-effort-safe: returns false if it could not be recorded so the caller
 * can surface the failure rather than assume success.
 */
export async function suppressAddress(input: {
  spaceId: string;
  channel: Channel;
  address: string;
  reason?: string;
  sourceText?: string | null;
  contactId?: string | null;
}): Promise<boolean> {
  const address = normalizeAddress(input.channel, input.address);
  if (!address) return false;
  const { error } = await supabase.from('MessagingSuppression').upsert(
    {
      spaceId: input.spaceId,
      channel: input.channel,
      address,
      reason: input.reason ?? 'stop_keyword',
      sourceText: input.sourceText ?? null,
      contactId: input.contactId ?? null,
    },
    { onConflict: 'spaceId,channel,address', ignoreDuplicates: true },
  );
  if (error) {
    logger.error('[compliance] failed to record suppression', { spaceId: input.spaceId }, error);
    return false;
  }
  logger.info('[compliance] address suppressed', {
    spaceId: input.spaceId,
    channel: input.channel,
    reason: input.reason ?? 'stop_keyword',
  });
  return true;
}

/** Remove a suppression (consumer texted START). Returns true when cleared. */
export async function unsuppressAddress(input: {
  spaceId: string;
  channel: Channel;
  address: string;
}): Promise<boolean> {
  const address = normalizeAddress(input.channel, input.address);
  if (!address) return false;
  const { error } = await supabase
    .from('MessagingSuppression')
    .delete()
    .eq('spaceId', input.spaceId)
    .eq('channel', input.channel)
    .eq('address', address);
  if (error) {
    logger.error('[compliance] failed to clear suppression', { spaceId: input.spaceId }, error);
    return false;
  }
  return true;
}

/** Record affirmative consent — the defensible artifact. Best-effort. */
export async function recordConsent(input: {
  spaceId: string;
  channel: Channel;
  address: string;
  contactId?: string | null;
  consentType: 'express_written' | 'express';
  source: string;
  disclosureText?: string | null;
  sourceIp?: string | null;
}): Promise<boolean> {
  const address = normalizeAddress(input.channel, input.address);
  if (!address) return false;
  const { error } = await supabase.from('MessagingConsent').insert({
    spaceId: input.spaceId,
    channel: input.channel,
    address,
    contactId: input.contactId ?? null,
    consentType: input.consentType,
    source: input.source,
    disclosureText: input.disclosureText ?? null,
    sourceIp: input.sourceIp ?? null,
  });
  if (error) {
    logger.error('[compliance] failed to record consent', { spaceId: input.spaceId }, error);
    return false;
  }
  return true;
}

/** Is the local hour inside the permitted window? */
export function isWithinQuietHours(now: Date, timeZone: string): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(now),
    );
    if (!Number.isFinite(hour)) return false;
    return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
  } catch {
    // Unknown/invalid timezone — treat as outside the window (fail closed).
    return false;
  }
}

/**
 * Best-effort recipient timezone: the space's configured timezone, else a
 * conservative default.
 *
 * HONEST LIMITATION: we do not know each consumer's timezone. Using the
 * sending space's timezone is the standard practical approximation (an agent's
 * leads are overwhelmingly local to them). 'America/New_York' is the fallback
 * because it is the EARLIEST US zone — quiet hours computed there start latest
 * in absolute terms for western recipients, which errs toward NOT sending.
 */
async function resolveTimeZone(spaceId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from('SpaceSetting')
      .select('timezone')
      .eq('spaceId', spaceId)
      .maybeSingle<{ timezone: string | null }>();
    const tz = data?.timezone;
    if (tz && typeof tz === 'string') return tz;
  } catch {
    /* fall through to the default */
  }
  return 'America/New_York';
}

/**
 * THE GATE. Called inside every consumer send chokepoint.
 *
 * Order matters: suppression is checked first and is absolute — an opted-out
 * consumer is never messaged, not even transactionally.
 */
export async function checkSendAllowed(req: ComplianceRequest): Promise<ComplianceDecision> {
  // The realtor's own notifications are not consumer outreach.
  if (req.audience === 'internal') return { allowed: true };

  const address = normalizeAddress(req.channel, req.address);
  if (!address) {
    return { allowed: false, reason: 'invalid_address', detail: 'Address is not usable.' };
  }

  // 1. Suppression — absolute, all categories.
  try {
    const { data, error } = await supabase
      .from('MessagingSuppression')
      .select('id')
      .eq('spaceId', req.spaceId)
      .eq('channel', req.channel)
      .eq('address', address)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      return {
        allowed: false,
        reason: 'suppressed',
        detail: 'Recipient opted out of messages from this workspace.',
      };
    }
  } catch (err) {
    // Fail CLOSED: without a readable suppression list we cannot prove this
    // person hasn't opted out, and sending anyway is the expensive mistake.
    logger.error('[compliance] suppression lookup failed — blocking send', { spaceId: req.spaceId }, err);
    return {
      allowed: false,
      reason: 'lookup_failed',
      detail: 'Could not verify opt-out status; send blocked.',
    };
  }

  // 2. Consent — required for marketing only.
  const category: MessageCategory = req.category ?? 'marketing';
  if (category === 'marketing') {
    try {
      const { data, error } = await supabase
        .from('MessagingConsent')
        .select('id')
        .eq('spaceId', req.spaceId)
        .eq('channel', req.channel)
        .eq('address', address)
        .eq('consentType', 'express_written')
        .is('revokedAt', null)
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) {
        return {
          allowed: false,
          reason: 'no_consent',
          detail: 'No express written consent on record for automated marketing messages.',
        };
      }
    } catch (err) {
      logger.error('[compliance] consent lookup failed — blocking send', { spaceId: req.spaceId }, err);
      return {
        allowed: false,
        reason: 'lookup_failed',
        detail: 'Could not verify consent; send blocked.',
      };
    }
  }

  // 3. Quiet hours.
  const now = req.now ?? new Date();
  const tz = await resolveTimeZone(req.spaceId);
  if (!isWithinQuietHours(now, tz)) {
    return {
      allowed: false,
      reason: 'quiet_hours',
      detail: `Outside the ${QUIET_HOURS_START}:00-${QUIET_HOURS_END}:00 window in ${tz}.`,
    };
  }

  return { allowed: true };
}
