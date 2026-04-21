/**
 * Draft delivery — routes approved agent drafts to the right channel.
 *
 * Email  → Resend (RESEND_API_KEY + FROM_EMAIL required)
 * SMS    → Twilio REST API (TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER)
 * Note   → no external delivery; treated as immediately "sent" (internal log only)
 *
 * Returns a DeliveryResult so the caller can decide the final draft status:
 *   sent=true  → mark draft "sent"
 *   sent=false → mark draft "approved" (human reviewed; delivery failed or unconfigured)
 */

import { Resend } from 'resend';

export interface DeliveryResult {
  sent: boolean;
  method: 'email' | 'sms' | 'note';
  error?: string;
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

// ─── Email via Resend ─────────────────────────────────────────────────────────

async function deliverEmail(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;

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
      subject: draft.subject ?? `A message for you`,
      text: draft.content,
    });

    if (error) {
      return { sent: false, method: 'email', error: error.message };
    }
    return { sent: true, method: 'email' };
  } catch (err) {
    return { sent: false, method: 'email', error: String(err) };
  }
}

// ─── SMS via Twilio REST API ──────────────────────────────────────────────────

async function deliverSms(
  draft: DraftPayload,
  contact: ContactPayload,
): Promise<DeliveryResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return { sent: false, method: 'sms', error: 'not_configured' };
  }
  if (!contact.phone) {
    return { sent: false, method: 'sms', error: 'Contact has no phone number' };
  }

  try {
    const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: contact.phone,
          Body: draft.content,
        }).toString(),
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        sent: false,
        method: 'sms',
        error: (body as { message?: string }).message ?? `Twilio error ${res.status}`,
      };
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
 */
export async function sendDraft(
  draft: DraftPayload,
  contact: ContactPayload,
  fromName: string,
): Promise<DeliveryResult> {
  switch (draft.channel) {
    case 'email':
      return deliverEmail(draft, contact, fromName);
    case 'sms':
      return deliverSms(draft, contact);
    case 'note':
      // Notes are internal — no external delivery needed; mark as sent immediately
      return { sent: true, method: 'note' };
  }
}
