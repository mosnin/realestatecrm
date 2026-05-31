/**
 * SMS through-write helpers — mirrors `lib/communication/connect.ts` for the
 * Telnyx-backed SMS surface. The realtor doesn't "connect" SMS the way they
 * connect Gmail or WhatsApp; SMS rides Telnyx, which is workspace-level
 * environment config, not a per-user OAuth.
 *
 * `findSmsConnection(spaceId)` is therefore a presence check, not a row
 * lookup — if the workspace's environment has `TELNYX_API_KEY` and a valid
 * `TELNYX_FROM_NUMBER`, SMS is available. We keep the function shape parallel
 * to the email/WhatsApp helpers so the call sites read the same way.
 *
 * Send routes through the existing `sendSMS` helper in `lib/sms.ts`. We don't
 * re-implement Telnyx wiring here — that file already handles E.164
 * normalisation, premium-rate blocking, and credential-missing fall-throughs.
 * One transport, one bug surface.
 *
 * No backup table for v1: outbound sends already land on the contact's
 * `ContactActivity` row (logged by callers like `app/api/agent/send/route.ts`
 * and `lib/ai-tools/tools/send-sms.ts`). The list/thread routes read from
 * there. Inbound SMS isn't wired — no Telnyx webhook yet, follow-up work.
 */

import { sendSMS } from '@/lib/sms';

/**
 * One workspace-level SMS "connection" — really just a snapshot of the
 * Telnyx env config. Shape kept symmetric with `MailConnection` /
 * `WhatsAppConnection` so call sites can use `Boolean(conn)` the same way.
 */
export interface SmsConnection {
  /** Toolkit identifier — always 'telnyx' for v1. */
  toolkit: 'telnyx';
  /** The E.164 number the workspace sends from. */
  fromNumber: string;
}

/**
 * Validate the workspace can actually send SMS right now.
 *
 * Telnyx is a workspace-level transport: every space shares the same
 * `TELNYX_API_KEY` + `TELNYX_FROM_NUMBER`. If those aren't set in env, the
 * SMS surface should render the "not set up" prompt instead of a broken
 * compose. The spaceId arg exists for future per-space provisioning
 * (workspace-owned Telnyx subaccounts) — today it's unused.
 */
export async function findSmsConnection(
  _spaceId: string,
): Promise<SmsConnection | null> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;
  if (!apiKey || !fromNumber) return null;
  // Same E.164 gate the send path applies.
  if (!/^\+\d{10,15}$/.test(fromNumber)) return null;
  return { toolkit: 'telnyx', fromNumber };
}

/**
 * Pure boolean variant for places that don't need the connection object.
 * Cheaper than `findSmsConnection` because it skips returning the number.
 */
export function smsConfigured(): boolean {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;
  if (!apiKey || !fromNumber) return false;
  return /^\+\d{10,15}$/.test(fromNumber);
}

export interface SendSmsInput {
  /** E.164 phone — the recipient. */
  to: string;
  body: string;
  /** Sender E.164 — must match the workspace's Telnyx number. Optional;
   *  defaults to `TELNYX_FROM_NUMBER` via the underlying helper. */
  fromNumber?: string;
}

export interface SmsSendResult {
  ok: boolean;
  /** Telnyx doesn't return a stable message id from our wrapper, so we
   *  surface ok only. Kept as a named result for future expansion. */
  error?: string;
}

/**
 * Send an SMS through the workspace's Telnyx number. Thin wrapper over
 * `sendSMS` so the call sites read like the email/WhatsApp through-writes.
 *
 * The wrapper does NOT mutate the activity log — that's a caller decision
 * (the agent send and the SMS API route both write `ContactActivity` rows
 * with their own auditing context).
 */
export async function sendSmsThrough(
  input: SendSmsInput,
): Promise<SmsSendResult> {
  if (!smsConfigured()) {
    return { ok: false, error: 'telnyx_not_configured' };
  }
  const ok = await sendSMS({ to: input.to, body: input.body });
  return ok ? { ok: true } : { ok: false, error: 'send_failed' };
}
