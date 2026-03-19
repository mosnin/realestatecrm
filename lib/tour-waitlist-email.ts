/** Lightweight email sender reused by the waitlist notify endpoint. */
export async function sendEmail(to: string, subject: string, html: string) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpPort = process.env.SMTP_PORT;
  const fromEmail = process.env.SMTP_FROM || 'noreply@example.com';

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log(`[waitlist-email] (dev) To: ${to} | Subject: ${subject}`);
    return;
  }

  try {
    const nodemailer = (await import('nodemailer' as string)) as any;
    const createTransport = nodemailer.default?.createTransport ?? nodemailer.createTransport;
    const transport = createTransport({
      host: smtpHost,
      port: parseInt(smtpPort || '587', 10),
      secure: smtpPort === '465',
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transport.sendMail({ from: fromEmail, to, subject, html });
  } catch (err) {
    console.error('[waitlist-email] Send failed:', err);
  }
}
