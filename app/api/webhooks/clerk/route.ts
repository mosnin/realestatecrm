/**
 * Clerk webhook handler — captures:
 *   - session.created / session.ended  → login/logout rows in AuditLog
 *   - user.created                     → sync the new signup into Mailchimp
 *
 * Setup in Clerk Dashboard → Webhooks:
 *   Endpoint URL: https://<your-domain>/api/webhooks/clerk
 *   Events to subscribe: session.created, session.ended, user.created
 *   Set CLERK_WEBHOOK_SECRET in environment variables.
 *
 * Security: All incoming requests are verified via Svix signature.
 * Unverified or tampered requests are rejected with 400.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { supabase } from '@/lib/supabase';
import { audit } from '@/lib/audit';
import { getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { syncUserToMailchimp } from '@/lib/mailchimp';

// Svix header names used for webhook signature verification
const SVIX_ID_HEADER = 'svix-id';
const SVIX_TIMESTAMP_HEADER = 'svix-timestamp';
const SVIX_SIGNATURE_HEADER = 'svix-signature';

// Session events (session.created / ended / removed / revoked) carry a user_id.
// User events (user.created) carry the user object directly, with emails + name.
interface ClerkPayload {
  data: {
    id: string;
    // session fields
    user_id?: string;
    client_id?: string;
    last_active_at?: number;
    created_at?: number;
    status?: string;
    // user.created fields
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
  type: string;
  object: string;
}

/** Pull the primary (or first) email from a Clerk user.created payload. */
function primaryEmail(data: ClerkPayload['data']): string | null {
  const list = data.email_addresses ?? [];
  if (!list.length) return null;
  const primary = list.find((e) => e.id === data.primary_email_address_id);
  return (primary ?? list[0]).email_address ?? null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    logger.error('[clerk-webhook] CLERK_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  // Read raw body for signature verification
  const rawBody = await req.text();

  // Extract Svix signature headers
  const svixId = req.headers.get(SVIX_ID_HEADER);
  const svixTimestamp = req.headers.get(SVIX_TIMESTAMP_HEADER);
  const svixSignature = req.headers.get(SVIX_SIGNATURE_HEADER);

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'Missing Svix signature headers' },
      { status: 400 },
    );
  }

  // Verify the webhook signature — rejects replays and tampered payloads
  let payload: ClerkPayload;
  try {
    const wh = new Webhook(secret);
    payload = wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkPayload;
  } catch (err) {
    logger.error('[clerk-webhook] signature verification failed', undefined, err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const { type, data } = payload;
  const clerkUserId = data.user_id ?? '';
  const ip = getClientIp(req);

  try {
    if (type === 'user.created') {
      // A brand-new signup — mirror them into the Mailchimp audience. Best
      // effort: a Mailchimp hiccup must never make Clerk retry the webhook.
      const email = primaryEmail(data);
      if (email) {
        const name =
          [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || null;
        const result = await syncUserToMailchimp({ email, name });
        if (result.ok) {
          logger.info('[clerk-webhook] mailchimp synced new user', {
            clerkUserId: data.id,
            memberStatus: result.memberStatus,
          });
        } else if (result.error !== 'not_configured' && result.error !== 'no_audience') {
          logger.warn('[clerk-webhook] mailchimp sync failed', {
            clerkUserId: data.id,
            error: result.error,
          });
        }
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (type === 'session.created') {
      // Look up internal user ID for context
      const { data: userRow } = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', clerkUserId)
        .maybeSingle();

      await audit({
        actorClerkId: clerkUserId,
        action: 'LOGIN',
        resource: 'Session',
        resourceId: data.id,
        metadata: {
          sessionId: data.id,
          userId: userRow?.id ?? null,
          clientId: data.client_id ?? null,
          loginAt: new Date().toISOString(),
          ip,
        },
      });

      logger.info('[clerk-webhook] login recorded', {
        clerkUserId,
        sessionId: data.id,
      });
    } else if (type === 'session.ended' || type === 'session.removed' || type === 'session.revoked') {
      const { data: userRow } = await supabase
        .from('User')
        .select('id')
        .eq('clerkId', clerkUserId)
        .maybeSingle();

      await audit({
        actorClerkId: clerkUserId,
        action: 'LOGOUT',
        resource: 'Session',
        resourceId: data.id,
        metadata: {
          sessionId: data.id,
          userId: userRow?.id ?? null,
          eventType: type,
          logoutAt: new Date().toISOString(),
          ip,
        },
      });

      logger.info('[clerk-webhook] logout recorded', {
        clerkUserId,
        sessionId: data.id,
        eventType: type,
      });
    } else {
      // Acknowledge but ignore other event types
      logger.debug('[clerk-webhook] unhandled event type', { type });
    }
  } catch (err) {
    // Log error but return 200 so Clerk doesn't retry — the audit utility
    // already handles its own errors gracefully.
    logger.error('[clerk-webhook] processing failed', { type, clerkUserId }, err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
