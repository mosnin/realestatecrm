/**
 * Telnyx SMS integration.
 *
 * Sends SMS messages via the Telnyx API.
 * Requires TELNYX_API_KEY and TELNYX_FROM_NUMBER env vars.
 * Gracefully no-ops when credentials are missing.
 */

// Log a clear warning at module load time if Telnyx env vars are missing
if (!process.env.TELNYX_API_KEY) {
  console.warn('[sms] WARNING: TELNYX_API_KEY is not set — all SMS notifications will be skipped');
}
if (!process.env.TELNYX_FROM_NUMBER) {
  console.warn('[sms] WARNING: TELNYX_FROM_NUMBER is not set — all SMS notifications will be skipped');
} else if (!/^\+\d{10,15}$/.test(process.env.TELNYX_FROM_NUMBER)) {
  console.warn(`[sms] WARNING: TELNYX_FROM_NUMBER "${process.env.TELNYX_FROM_NUMBER}" does not look like a valid E.164 phone number (expected +XXXXXXXXXXX)`);
}

let telnyxClient: any = null;

async function getClient() {
  if (!process.env.TELNYX_API_KEY) {
    console.warn('[sms] Cannot create Telnyx client — TELNYX_API_KEY is not set');
    return null;
  }
  if (!telnyxClient) {
    try {
      const telnyx = await import('telnyx');
      // The SDK exports both a default and named `Telnyx` constructor
      const TelnyxConstructor = telnyx.Telnyx ?? telnyx.default;
      telnyxClient = new TelnyxConstructor({ apiKey: process.env.TELNYX_API_KEY });
    } catch (err) {
      console.error('[sms] Failed to initialize Telnyx SDK:', err);
      return null;
    }
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
  const client = await getClient();
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!client || !fromNumber) {
    console.log(
      `[sms] (skipped) Missing Telnyx credentials — TELNYX_API_KEY: ${process.env.TELNYX_API_KEY ? 'set' : 'MISSING'}, TELNYX_FROM_NUMBER: ${fromNumber ? 'set' : 'MISSING'}. To: ${params.to}`,
    );
    return false;
  }

  // Basic phone validation — must look like a phone number
  const cleaned = params.to.replace(/[^\d+]/g, '');
  if (cleaned.length < 10) {
    console.warn(`[sms] Invalid phone number (too short after cleaning): "${params.to}" -> "${cleaned}"`);
    return false;
  }

  // Ensure E.164 format
  const toNumber = cleaned.startsWith('+') ? cleaned : `+1${cleaned}`;

  // Validate E.164 format: + followed by 10-15 digits
  if (!/^\+\d{10,15}$/.test(toNumber)) {
    console.warn(`[sms] Phone number not valid E.164 format: "${toNumber}" (original: "${params.to}")`);
    return false;
  }

  try {
    console.log(`[sms] Sending to ${toNumber} from ${fromNumber} (body length: ${params.body.length})`);
    const response = await client.messages.send({
      from: fromNumber,
      to: toNumber,
      text: params.body,
    });
    console.log(`[sms] Sent to ${toNumber} (message id: ${response?.data?.id ?? 'unknown'})`);
    return true;
  } catch (err: any) {
    console.error(`[sms] Send failed to ${toNumber}:`, {
      message: err?.message,
      status: err?.statusCode ?? err?.status,
      code: err?.code,
      errors: err?.errors ?? err?.rawErrors,
      // Include the full error for debugging in non-production
      ...(process.env.NODE_ENV !== 'production' && { fullError: err }),
    });
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
    body: `Hi ${p.guestName}! Your tour with ${p.businessName}${prop} is confirmed for ${p.date} at ${p.time}. Contact your agent if you need to reschedule.`,
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
