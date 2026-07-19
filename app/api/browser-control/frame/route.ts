/**
 * GET /api/browser-control/frame — Clerk-authed. Powers the chat/settings
 * screencast panel: returns the caller's active control session's latest
 * pushed viewport frame, or null when there is no active session or the
 * extension hasn't pushed one yet — honest UI (CLAUDE.md #5), never
 * fabricates a frame. Scoped to (userId, spaceId) derived from the
 * authenticated context, same pattern as /status.
 *
 * Rate-limited generously rather than tightly: the panel polls this route
 * roughly once a second for the duration of a live session, which is
 * expected traffic, not abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { getLatestFrame } from '@/lib/browser-control/session';

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // 90/min (~1.5/s) — comfortably above the panel's ~1/s poll cadence while
  // still bounding a runaway/misbehaving client.
  const { allowed } = await checkRateLimit(`browser-control:frame:${dbUser.id}`, 90, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Polling too fast' }, { status: 429 });
  }

  const frame = await getLatestFrame(space.id, dbUser.id);
  return NextResponse.json({ frame });
}
