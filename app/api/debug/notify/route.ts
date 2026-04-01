import { NextRequest, NextResponse } from 'next/server';

/**
 * Bare-bones diagnostic endpoint. No imports from lib/ — no Redis, no Supabase,
 * no rate limiting. Just raw Resend + Telnyx calls to prove they work.
 *
 * GET /api/debug/notify?email=you@example.com&phone=+15551234567
 */
export async function GET(req: NextRequest) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      RESEND_API_KEY: process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.slice(0, 8)}...` : 'MISSING',
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? 'MISSING (will use default)',
      TELNYX_API_KEY: process.env.TELNYX_API_KEY ? `${process.env.TELNYX_API_KEY.slice(0, 8)}...` : 'MISSING',
      TELNYX_FROM_NUMBER: process.env.TELNYX_FROM_NUMBER ?? 'MISSING',
    },
  };

  const email = req.nextUrl.searchParams.get('email');
  const phone = req.nextUrl.searchParams.get('phone');

  // ── Test Resend ──
  if (email && process.env.RESEND_API_KEY) {
    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const rawFrom = process.env.RESEND_FROM_EMAIL ?? 'notifications@alerts.usechippi.com';
      const from = rawFrom.includes('@') ? rawFrom : `notifications@${rawFrom}`;
      console.log('[debug/notify] Sending test email to:', email, 'from:', from);
      const result = await resend.emails.send({
        from,
        to: email,
        subject: 'Chippi notification test',
        html: '<p>If you see this, Resend is working.</p>',
      });
      console.log('[debug/notify] Resend result:', JSON.stringify(result));
      results.resend = result;
    } catch (err: any) {
      console.error('[debug/notify] Resend error:', err);
      results.resend = { error: err.message, stack: err.stack?.slice(0, 300) };
    }
  } else {
    results.resend = email ? 'RESEND_API_KEY missing' : 'No email param provided';
  }

  // ── Test Telnyx ──
  if (phone && process.env.TELNYX_API_KEY && process.env.TELNYX_FROM_NUMBER) {
    try {
      const telnyx = await import('telnyx');
      const TelnyxConstructor = (telnyx as any).Telnyx ?? (telnyx as any).default;
      const client = new TelnyxConstructor({ apiKey: process.env.TELNYX_API_KEY });
      const fromNumber = process.env.TELNYX_FROM_NUMBER;
      console.log('[debug/notify] Sending test SMS to:', phone, 'from:', fromNumber);
      const result = await client.messages.send({
        from: fromNumber,
        to: phone,
        text: 'Chippi notification test — if you see this, Telnyx is working.',
      });
      console.log('[debug/notify] Telnyx result:', JSON.stringify(result?.data));
      results.telnyx = { success: true, messageId: result?.data?.id };
    } catch (err: any) {
      console.error('[debug/notify] Telnyx error:', err);
      results.telnyx = { error: err.message, status: err.statusCode, errors: err.errors };
    }
  } else {
    results.telnyx = !phone ? 'No phone param' : !process.env.TELNYX_API_KEY ? 'TELNYX_API_KEY missing' : 'TELNYX_FROM_NUMBER missing';
  }

  return NextResponse.json(results);
}
