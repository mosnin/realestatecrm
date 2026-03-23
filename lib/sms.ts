/**
 * Telnyx SMS integration.
 *
 * Sends SMS messages via the Telnyx API.
 * Requires TELNYX_API_KEY and TELNYX_FROM_NUMBER env vars.
 * Gracefully no-ops when credentials are missing.
 */

import { Telnyx } from 'telnyx';

let telnyxClient: InstanceType<typeof Telnyx> | null = null;

function getClient() {
  if (!process.env.TELNYX_API_KEY) return null;
  if (!telnyxClient) {
    telnyxClient = new Telnyx({ apiKey: process.env.TELNYX_API_KEY });
  }
  return telnyxClient;
}

export interface SendSMSParams {
  to: string;
  body: string;
}

/**
 * Send an SMS via Telnyx. Returns true if sent, false if skipped/failed.
 * Never throws — errors are logged and swallowed.
 */
export async function sendSMS(params: SendSMSParams): Promise<boolean> {
  const client = getClient();
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!client || !fromNumber) {
    console.log(`[sms] (skipped) No Telnyx credentials. To: ${params.to}`);
    return false;
  }

  // Basic phone validation — must look like a phone number
  const cleaned = params.to.replace(/[^\d+]/g, '');
  if (cleaned.length < 10) {
    console.warn(`[sms] Invalid phone number: ${params.to}`);
    return false;
  }

  // Ensure E.164 format
  const toNumber = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;

  try {
    await client.messages.send({
      from: fromNumber,
      to: toNumber,
      text: params.body,
    });
    console.log(`[sms] Sent to ${toNumber}`);
    return true;
  } catch (err) {
    console.error('[sms] Send failed:', err);
    return false;
  }
}

// ── Pre-built SMS templates ──────────────────────────────────────────────

export function newLeadSMS(p: { spaceName: string; leadName: string; leadPhone?: string | null; phone: string; scoreLabel?: string | null }): SendSMSParams {
  const score = p.scoreLabel ? ` (${p.scoreLabel})` : '';
  const leadContact = p.leadPhone ? ` Phone: ${p.leadPhone}.` : '';
  return {
    to: p.phone,
    body: `[${p.spaceName}] New lead: ${p.leadName}${score}.${leadContact} Open your dashboard to review.`,
  };
}

export function newTourSMS(p: { spaceName: string; guestName: string; date: string; time: string; property?: string | null; phone: string }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    to: p.phone,
    body: `[${p.spaceName}] New tour booked: ${p.guestName}${prop} on ${p.date} at ${p.time}. Check your dashboard for details.`,
  };
}

export function tourConfirmationSMS(p: { guestName: string; guestPhone: string; businessName: string; date: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    to: p.guestPhone,
    body: `Hi ${p.guestName}! Your tour with ${p.businessName}${prop} is confirmed for ${p.date} at ${p.time}. Reply to this message if you need to reschedule.`,
  };
}

export function tourReminderSMS(p: { guestName: string; guestPhone: string; businessName: string; time: string; property?: string | null }): SendSMSParams {
  const prop = p.property ? ` at ${p.property}` : '';
  return {
    to: p.guestPhone,
    body: `Hi ${p.guestName}, reminder: your tour with ${p.businessName}${prop} is tomorrow at ${p.time}. See you there!`,
  };
}

export function newDealSMS(p: { spaceName: string; dealTitle: string; value?: string | null; phone: string }): SendSMSParams {
  const val = p.value ? ` (${p.value})` : '';
  return {
    to: p.phone,
    body: `[${p.spaceName}] New deal created: ${p.dealTitle}${val}. Open your dashboard to manage it.`,
  };
}

export function followUpReminderSMS(p: { spaceName: string; contactName: string; phone: string }): SendSMSParams {
  return {
    to: p.phone,
    body: `[${p.spaceName}] Reminder: Follow up with ${p.contactName} today. Open your dashboard to review.`,
  };
}
