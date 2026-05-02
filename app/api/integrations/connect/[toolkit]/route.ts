/**
 * POST /api/integrations/connect/[toolkit]
 *
 * Initiate an OAuth connection for the calling realtor + the given
 * toolkit (e.g. `gmail`, `slack`, `notion`). Returns the URL the
 * realtor's browser should redirect to so Composio can run the auth
 * flow. After the realtor approves, Composio sends them back to our
 * /api/integrations/callback route with the connected-account id.
 *
 * Body: optional { spaceSlug?: string } — defaults to the user's
 * resolved space. We also persist a *pending* row so the callback can
 * tie the returned id back to (space, user, toolkit). Pending rows
 * appear as `status='active'` because Composio's OAuth flow is the
 * source of truth: when the user completes auth, the connection IS
 * active. If they bail, we sweep stale pending rows in a follow-up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { findIntegration } from '@/lib/integrations/catalog';
import { initiateConnection } from '@/lib/integrations/composio';
import { findActive, revoke } from '@/lib/integrations/connections';
import { logger } from '@/lib/logger';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ toolkit: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { toolkit } = await params;
  const app = findIntegration(toolkit);
  if (!app) {
    return NextResponse.json(
      { error: `Unknown integration: ${toolkit}` },
      { status: 404 },
    );
  }

  // Follow-up Boss is in our catalog but Composio doesn't have a toolkit
  // for it today. Surface a clear "not yet" rather than a Composio 404
  // when the realtor taps Connect.
  if (toolkit === 'follow_up_boss') {
    return NextResponse.json(
      { error: 'Follow-up Boss support is in progress. We will let you know when it lands.' },
      { status: 501 },
    );
  }

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // If there's already an active connection for this combo, revoke it
  // first — reconnect is the realtor explicitly choosing a fresh auth.
  const existing = await findActive({ spaceId: space.id, userId, toolkit });
  if (existing) {
    await revoke(existing);
  }

  const callbackUrl = composioCallbackUrl();

  try {
    const request = await initiateConnection({
      entityId: userId,
      toolkit,
      callbackUrl,
    });

    return NextResponse.json({
      redirectUrl: request.redirectUrl,
      connectionId: request.id,
      toolkit,
    });
  } catch (err) {
    logger.error(
      '[integrations.connect] initiate failed',
      { userId, toolkit, err: err instanceof Error ? err.message : String(err) },
    );
    return NextResponse.json(
      { error: `Could not start ${app.name} connect. Try again in a moment.` },
      { status: 502 },
    );
  }
}

/** The URL Composio sends the realtor to after OAuth completes. */
function composioCallbackUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}/integrations/callback`;
}
