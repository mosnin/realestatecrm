/**
 * POST /api/browser-control/headless/stop — Clerk-authed. Ends the caller's
 * active HEADLESS browser-control session (the panel's Stop button for cloud
 * sessions, which have no in-page kill switch). No-op-safe: if there's no
 * active headless session, returns { stopped: false } honestly rather than
 * erroring. Scoped to (spaceId, userId) from the authenticated context — a
 * caller can only stop their OWN session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { getActiveSession, endHeadlessSession } from '@/lib/browser-control/session';

export async function POST(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const active = await getActiveSession(space.id, dbUser.id);
  if (!active || active.source !== 'headless') {
    // Nothing to stop (or the active session is an extension one, which the
    // in-page kill switch / link revoke owns) — honest, not an error.
    return NextResponse.json({ stopped: false });
  }

  await endHeadlessSession(active.id, { spaceId: space.id });
  return NextResponse.json({ stopped: true, sessionId: active.id });
}
