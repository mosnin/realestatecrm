/**
 * Tour email notifications.
 *
 * Uses a pluggable transport: set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
 * env vars to send real emails, otherwise logs to console (dev mode).
 *
 * Three email types:
 *   1. Confirmation — sent immediately when a tour is booked
 *   2. Reminder — sent ~24h before the tour starts (call via cron / Vercel cron)
 *   3. Follow-up — sent after a tour is completed
 */

export interface TourEmailData {
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  propertyAddress: string | null;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  businessName: string;
  tourId: string;
  slug: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function sendEmail(to: string, subject: string, html: string) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.SMTP_FROM || 'noreply@example.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[tour-email] (dev) To: ${to} | Subject: ${subject}`);
    console.log(`[tour-email] (dev) HTML preview:\n${html.replace(/<[^>]+>/g, '').slice(0, 300)}...`);
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = (await import('nodemailer' as string)) as any;
    const createTransport = nodemailer.default?.createTransport ?? nodemailer.createTransport;
    const transport = createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587', 10),
      secure: smtpPort === '465',
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transport.sendMail({ from: fromEmail, to, subject, html });
    console.log(`[tour-email] Sent "${subject}" to ${to}`);
  } catch (err) {
    console.error('[tour-email] Send failed:', err);
  }
}

export async function sendTourConfirmation(data: TourEmailData) {
  const { guestName, guestEmail, businessName, startsAt, endsAt, propertyAddress } = data;
  const subject = `Tour Confirmed — ${formatDate(startsAt)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">Your tour is booked!</h2>
      <p>Hi ${guestName},</p>
      <p>Your tour with <strong>${businessName}</strong> has been confirmed:</p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Date:</strong> ${formatDate(startsAt)}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${formatTime(startsAt)} – ${formatTime(endsAt)}</p>
        ${propertyAddress ? `<p style="margin: 4px 0;"><strong>Property:</strong> ${propertyAddress}</p>` : ''}
      </div>
      <p>If you need to reschedule or cancel, please reply to this email.</p>
      <p style="color: #888; font-size: 12px; margin-top: 24px;">— ${businessName}</p>
    </div>
  `;
  await sendEmail(guestEmail, subject, html);
}

export async function sendTourReminder(data: TourEmailData) {
  const { guestName, guestEmail, businessName, startsAt, endsAt, propertyAddress } = data;
  const subject = `Reminder: Tour Tomorrow — ${formatTime(startsAt)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">Tour Reminder</h2>
      <p>Hi ${guestName},</p>
      <p>Just a friendly reminder — you have a tour scheduled tomorrow with <strong>${businessName}</strong>:</p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Date:</strong> ${formatDate(startsAt)}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${formatTime(startsAt)} – ${formatTime(endsAt)}</p>
        ${propertyAddress ? `<p style="margin: 4px 0;"><strong>Property:</strong> ${propertyAddress}</p>` : ''}
      </div>
      <p>We look forward to seeing you!</p>
      <p style="color: #888; font-size: 12px; margin-top: 24px;">— ${businessName}</p>
    </div>
  `;
  await sendEmail(guestEmail, subject, html);
}

export async function sendTourFollowUp(data: TourEmailData) {
  const { guestName, guestEmail, businessName, propertyAddress } = data;
  const subject = `Thanks for touring with ${businessName}!`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">Thanks for visiting!</h2>
      <p>Hi ${guestName},</p>
      <p>Thank you for touring${propertyAddress ? ` <strong>${propertyAddress}</strong>` : ''} with us. We hope you enjoyed the visit.</p>
      <p>If you have any questions or would like to move forward, simply reply to this email and we'll get back to you right away.</p>
      <p>Best regards,<br/><strong>${businessName}</strong></p>
    </div>
  `;
  await sendEmail(guestEmail, subject, html);
}

export async function sendAgentNotification(agentEmail: string, data: TourEmailData) {
  const { guestName, guestEmail, guestPhone = null, startsAt, propertyAddress } = data;
  const subject = `New Tour Booked — ${guestName} on ${formatDate(startsAt)}`;
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #111;">New Tour Booking</h2>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Guest:</strong> ${guestName}</p>
        <p style="margin: 4px 0;"><strong>Email:</strong> ${guestEmail}</p>
        ${guestPhone ? `<p style="margin: 4px 0;"><strong>Phone:</strong> ${guestPhone}</p>` : ''}
        <p style="margin: 4px 0;"><strong>Date:</strong> ${formatDate(startsAt)} at ${formatTime(startsAt)}</p>
        ${propertyAddress ? `<p style="margin: 4px 0;"><strong>Property:</strong> ${propertyAddress}</p>` : ''}
      </div>
    </div>
  `;
  await sendEmail(agentEmail, subject, html);
}
