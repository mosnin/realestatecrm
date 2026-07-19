/**
 * POST /api/browser-control/headless/start — Clerk-authed. Starts (or
 * reuses) a HEADLESS browser-control session for the caller: a cloud
 * browser with no realtor login, for public-web research when no extension
 * is connected (see resolveBrowserRuntime in lib/browser-control/index.ts,
 * which is the normal caller — the chat agent doesn't need to hit this
 * route directly, but it's exposed for the settings UI / manual testing).
 *
 * This route only creates the DB session row + queue target; it does NOT
 * itself launch a Modal headless worker. See this track's deploy flags —
 * nothing yet triggers the worker to start polling POST /headless/poll for
 * this session; that's a separate (agent/**, Modal deploy) piece of work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { startHeadlessSession } from '@/lib/browser-control/session';

export async function POST(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Generous enough for normal use (routing auto-starts one per task/action
  // when needed) while bounding a runaway loop of session churn.
  const { allowed } = await checkRateLimit(`browser-control:headless-start:${dbUser.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many headless session starts. Try again shortly.' }, { status: 429 });
  }

  const session = await startHeadlessSession({ spaceId: space.id, userId: dbUser.id });

  return NextResponse.json({
    sessionId: session.id,
    source: session.source,
    status: session.status,
    startedAt: session.startedAt,
  });
}
