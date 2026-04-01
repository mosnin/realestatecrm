import type { ApplicationData } from '@/lib/types';

/** Escape characters that have special meaning in HTML to prevent XSS. */
function esc(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function row(label: string, value: string | number | boolean | null | undefined) {
  if (value == null || value === '') return '';
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : esc(String(value));
  return `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap">${esc(label)}</td><td style="padding:4px 0;font-size:13px;color:#111827">${display}</td></tr>`;
}

export interface NewLeadEmailParams {
  toEmail: string;
  spaceName: string;
  spaceSlug: string;
  contactId: string;
  name: string;
  phone: string;
  email?: string | null;
  leadScore?: number | null;
  scoreLabel?: string | null;
  scoreSummary?: string | null;
  applicationData: ApplicationData;
}

export async function sendNewLeadNotification(params: NewLeadEmailParams): Promise<void> {
  console.log('[EMAIL-DEBUG] 1. sendNewLeadNotification called');
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping email');
    return;
  }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
  console.log('[EMAIL-DEBUG] 2. Resend initialized, API key prefix:', process.env.RESEND_API_KEY?.slice(0, 8));

  const { toEmail, spaceName, spaceSlug, contactId, name, phone, email, leadScore, scoreLabel, scoreSummary, applicationData: app } = params;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const contactUrl = `${appUrl}/s/${spaceSlug}/contacts/${contactId}`;

  const tierColor = scoreLabel === 'hot' ? '#059669' : scoreLabel === 'warm' ? '#d97706' : '#6b7280';
  const scoreHtml = leadScore != null
    ? `<span style="display:inline-block;background:${tierColor}1a;color:${tierColor};font-size:12px;font-weight:600;padding:2px 10px;border-radius:9999px;text-transform:uppercase">${Math.round(leadScore)} ${scoreLabel ?? ''}</span>`
    : '';

  const detailRows = [
    row('Phone', phone),
    row('Email', email),
    row('Property', app.propertyAddress),
    row('Move-in date', app.targetMoveInDate),
    row('Monthly rent', app.monthlyRent != null ? fmt(app.monthlyRent) : null),
    row('Employment', app.employmentStatus),
    row('Gross income', app.monthlyGrossIncome != null ? `${fmt(app.monthlyGrossIncome)}/mo` : null),
    row('Occupants', app.numberOfOccupants),
    row('Pets', app.hasPets === true ? (app.petDetails ?? 'Yes') : app.hasPets === false ? 'No' : null),
    row('Prior evictions', app.priorEvictions),
  ].filter(Boolean).join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <!-- Header -->
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(spaceName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">New lead application</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 28px">
          <!-- Name + score -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><p style="margin:0;font-size:18px;font-weight:700;color:#111827">${esc(name)}</p></td>
              ${scoreHtml ? `<td align="right" style="vertical-align:middle">${scoreHtml}</td>` : ''}
            </tr>
          </table>
          ${scoreSummary ? `<p style="margin:10px 0 0;font-size:13px;color:#4b5563;line-height:1.5">${esc(scoreSummary)}</p>` : ''}
          <!-- Details table -->
          ${detailRows ? `<table cellpadding="0" cellspacing="0" style="margin-top:18px;width:100%">${detailRows}</table>` : ''}
          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${contactUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View full application →</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because notifications are enabled for <strong>${esc(spaceName)}</strong>. Manage your settings in the workspace dashboard.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Strip control characters (newlines, carriage returns) from subject-line values
  // to prevent email header injection
  const safeSubjectName = name.replace(/[\r\n\t]/g, ' ').slice(0, 200);
  const safeScoreLabel = (scoreLabel ?? '').replace(/[\r\n\t]/g, ' ');

  try {
    console.log('[EMAIL-DEBUG] 3. About to call resend.emails.send, to:', toEmail, 'from:', FROM);
    console.log('[email] Sending new lead notification to:', toEmail, 'from:', FROM);
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `New lead: ${safeSubjectName}${leadScore != null ? ` · ${Math.round(leadScore)} ${safeScoreLabel}` : ''}`,
      html,
    });
    console.log('[EMAIL-DEBUG] 4. Send result:', JSON.stringify(result));
    if (result.error) {
      console.error('[email] Resend API error (new lead):', JSON.stringify(result.error));
    } else {
      console.log('[email] Send result:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[email] SEND FAILED:', err);
  }
}

export interface FollowUpDigestParams {
  toEmail: string;
  spaceName: string;
  spaceSlug: string;
  contacts: { name: string; phone: string | null; followUpAt: string | null }[];
}

export async function sendFollowUpDigest(params: FollowUpDigestParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { console.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';

  const { toEmail, spaceName, spaceSlug, contacts } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const leadsUrl = `${appUrl}/s/${spaceSlug}/leads`;

  const contactRows = contacts
    .map((c) => {
      const dateStr = c.followUpAt ? new Date(c.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return `<tr>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#111827;font-weight:500">${esc(c.name)}</td>
        <td style="padding:6px 12px 6px 0;font-size:13px;color:#6b7280">${c.phone ? esc(c.phone) : '—'}</td>
        <td style="padding:6px 0;font-size:13px;color:#d97706;font-weight:500">${dateStr}</td>
      </tr>`;
    })
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(spaceName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">Follow-up reminders</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0 0 16px;font-size:14px;color:#374151">You have <strong>${contacts.length}</strong> follow-up${contacts.length !== 1 ? 's' : ''} due today:</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #f1f5f9">
            <thead>
              <tr>
                <th style="padding:8px 12px 8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Name</th>
                <th style="padding:8px 12px 8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Phone</th>
                <th style="padding:8px 0;text-align:left;font-size:11px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Due</th>
              </tr>
            </thead>
            <tbody>${contactRows}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${leadsUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View leads →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because notifications are enabled for <strong>${esc(spaceName)}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSpaceName = spaceName.replace(/[\r\n\t]/g, ' ').slice(0, 100);
  try {
    console.log('[email] Sending sendFollowUpDigest to:', toEmail, 'from:', FROM);
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `${contacts.length} follow-up${contacts.length !== 1 ? 's' : ''} due today — ${safeSpaceName}`,
      html,
    });
    if (result.error) {
      console.error('[email] Resend API error (follow-up digest):', JSON.stringify(result.error));
    } else {
      console.log('[email] sendFollowUpDigest result:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[email] sendFollowUpDigest FAILED:', err);
  }
}

export interface SendEmailFromCRMParams {
  toEmail: string;
  fromName: string;
  replyTo?: string;
  subject: string;
  body: string;
}

export async function sendEmailFromCRM(params: SendEmailFromCRMParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { console.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';

  const { toEmail, fromName, replyTo, subject, body } = params;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="padding:28px 32px">
          <p style="margin:0;font-size:15px;color:#111827;line-height:1.7;white-space:pre-wrap">${esc(body)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${esc(fromName)} via your property management system.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeSubject = subject.replace(/[\r\n\t]/g, ' ').slice(0, 200);
  try {
    console.log('[email] Sending sendEmailFromCRM to:', toEmail, 'from:', FROM);
    const result = await resend.emails.send({
      from: `${fromName.replace(/[\r\n\t<>"]/g, ' ').slice(0, 100)} <${FROM}>`,
      to: toEmail,
      replyTo: replyTo ?? undefined,
      subject: safeSubject,
      html,
    });
    if (result.error) {
      console.error('[email] Resend API error (CRM email):', JSON.stringify(result.error));
    } else {
      console.log('[email] sendEmailFromCRM result:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[email] sendEmailFromCRM FAILED:', err);
  }
}

export interface NewDealEmailParams {
  toEmail: string;
  spaceName: string;
  spaceSlug: string;
  dealTitle: string;
  dealValue?: number | null;
  dealAddress?: string | null;
  dealPriority?: string | null;
  contactNames?: string[];
}

export async function sendNewDealNotification(params: NewDealEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { console.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';

  const { toEmail, spaceName, spaceSlug, dealTitle, dealValue, dealAddress, dealPriority, contactNames } = params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';
  const dealsUrl = `${appUrl}/s/${spaceSlug}/deals`;

  const detailRows = [
    row('Title', dealTitle),
    row('Value', dealValue != null ? fmt(dealValue) : null),
    row('Address', dealAddress),
    row('Priority', dealPriority),
    row('Contacts', contactNames?.length ? contactNames.join(', ') : null),
  ].filter(Boolean).join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">${esc(spaceName)}</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">New deal created</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0;font-size:18px;font-weight:700;color:#111827">${esc(dealTitle)}</p>
          ${dealValue != null ? `<p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#059669">${fmt(dealValue)}</p>` : ''}
          ${detailRows ? `<table cellpadding="0" cellspacing="0" style="margin-top:18px;width:100%">${detailRows}</table>` : ''}
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${dealsUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">View deals →</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You're receiving this because notifications are enabled for <strong>${esc(spaceName)}</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const safeDealTitle = dealTitle.replace(/[\r\n\t]/g, ' ').slice(0, 200);
  try {
    console.log('[email] Sending sendNewDealNotification to:', toEmail, 'from:', FROM);
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `New deal: ${safeDealTitle}${dealValue != null ? ` · ${fmt(dealValue)}` : ''}`,
      html,
    });
    if (result.error) {
      console.error('[email] Resend API error (new deal):', JSON.stringify(result.error));
    } else {
      console.log('[email] sendNewDealNotification result:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[email] sendNewDealNotification FAILED:', err);
  }
}

export interface BrokerageInvitationEmailParams {
  toEmail: string;
  brokerageName: string;
  inviterName: string;
  roleToAssign: 'broker_admin' | 'realtor_member';
  token: string;
}

export async function sendBrokerageInvitation(params: BrokerageInvitationEmailParams): Promise<void> {
  if (!process.env.RESEND_API_KEY) { console.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com';

  const { toEmail, brokerageName, inviterName, roleToAssign, token } = params;
  const acceptUrl = `${appUrl}/invite/${token}`;
  const roleLabel = roleToAssign === 'broker_admin' ? 'Brokerage Admin' : 'Realtor';
  const safeEmail = toEmail.replace(/[\r\n\t]/g, ' ').slice(0, 200);

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
        <tr><td style="background:#0f172a;padding:20px 28px">
          <p style="margin:0;color:#94a3b8;font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.05em">Brokerage Invitation</p>
          <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700">${esc(brokerageName)}</p>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <p style="margin:0;font-size:15px;color:#111827;line-height:1.6">
            <strong>${esc(inviterName)}</strong> has invited you to join <strong>${esc(brokerageName)}</strong> as a <strong>${esc(roleLabel)}</strong> on Chippi.
          </p>
          <p style="margin:12px 0 0;font-size:13px;color:#6b7280;line-height:1.5">
            You'll keep your own workspace, leads, and pipeline. This just adds you to the brokerage network.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px">
            <tr><td>
              <a href="${acceptUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:10px 22px;border-radius:8px">Accept invitation →</a>
            </td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:11px;color:#9ca3af">
            This invitation expires in 7 days. If you don't have a Chippi account yet, you'll be prompted to create one after clicking the link above.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#9ca3af">You received this because someone invited ${esc(safeEmail)} to a Chippi brokerage. If this was a mistake, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    console.log('[email] Sending sendBrokerageInvitation to:', toEmail, 'from:', FROM);
    const result = await resend.emails.send({
      from: FROM,
      to: toEmail,
      subject: `You're invited to join ${brokerageName.replace(/[\r\n\t]/g, ' ').slice(0, 100)} on Chippi`,
      html,
    });
    if (result.error) {
      console.error('[email] Resend API error (brokerage invitation):', JSON.stringify(result.error));
    } else {
      console.log('[email] sendBrokerageInvitation result:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[email] sendBrokerageInvitation FAILED:', err);
  }
}

// ── Welcome email ────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(params: {
  toEmail: string;
  userName: string | null;
  spaceName?: string | null;
  spaceSlug?: string | null;
}): Promise<void> {
  if (!process.env.RESEND_API_KEY) { console.warn('[email] RESEND_API_KEY not set — skipping'); return; }
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';

  const { toEmail, userName, spaceName, spaceSlug } = params;
  const name = esc(userName) || 'there';
  const domain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'my.usechippi.com';
  const dashboardUrl = spaceSlug ? `https://${domain}/s/${spaceSlug}` : `https://${domain}/setup`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
  <div style="text-align:center;margin-bottom:28px">
    <span style="font-size:28px;font-weight:700;color:#111827">Welcome to Chippi</span>
  </div>
  <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 24px">
    <p style="margin:0 0 16px;font-size:15px;color:#111827;line-height:1.6">
      Hi ${name},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">
      Your Chippi account is ready${spaceName ? ` and your workspace <strong>${esc(spaceName)}</strong> has been created` : ''}. Here's what you can do now:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px">
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#374151;line-height:1.5">
          <strong style="color:#111827">1. Share your intake link</strong><br/>
          Send it to renters so their inquiries flow straight into your pipeline.
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#374151;line-height:1.5">
          <strong style="color:#111827">2. Review AI-scored leads</strong><br/>
          Every submission is automatically scored — hot, warm, or cold.
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;font-size:14px;color:#374151;line-height:1.5">
          <strong style="color:#111827">3. Set up follow-up reminders</strong><br/>
          Never miss a callback. Chippi reminds you when to reach out.
        </td>
      </tr>
    </table>
    <div style="text-align:center;margin:24px 0 8px">
      <a href="${dashboardUrl}" style="display:inline-block;background:#ff964f;color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;padding:10px 28px;border-radius:8px">
        Open your dashboard
      </a>
    </div>
  </div>
  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:20px;line-height:1.5">
    Questions? Just reply to this email. We're here to help.<br/>
    — The Chippi team
  </p>
</div>`;

  try {
    console.log('[email] Sending sendWelcomeEmail to:', toEmail, 'from:', FROM);
    const result = await resend.emails.send({
      from: `Chippi <${FROM}>`,
      to: toEmail,
      subject: `Welcome to Chippi — your workspace is ready`,
      html,
    });
    if (result.error) {
      console.error('[email] Resend API error (welcome email):', JSON.stringify(result.error));
    } else {
      console.log('[email] sendWelcomeEmail result:', JSON.stringify(result.data));
    }
  } catch (err) {
    console.error('[email] sendWelcomeEmail FAILED:', err);
  }
}
