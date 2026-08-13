/**
 * POST /api/browser-control/headless/start — Clerk-authed. Starts (or
 * reuses) a HEADLESS browser-control session for the caller: a cloud
 * browser with no realtor login, for public-web research when no extension
 * is connected (see resolveBrowserRuntime in lib/browser-control/index.ts,
 * which is the normal caller — the chat agent doesn't need to hit this
 * route directly, but it's exposed for the settings UI / manual testing).
 *
 * After obtaining the single active DB session, this route starts (or reuses)
 * its bounded Modal worker. The feature remains unavailable until the lease
 * migration and dedicated worker configuration are deployed and the tenant is
 * explicitly entitled.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { endHeadlessSession, startHeadlessSession } from '@/lib/browser-control/session';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';
import { ensureHeadlessResearchWorker } from '@/lib/browser-control/headless-worker';

export async function POST(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!isResearchWorkspaceEnabledForSpace(space.id)) {
    return NextResponse.json({ error: 'Cloud research workspace is unavailable.' }, { status: 404 });
  }

  // Generous enough for normal use (routing auto-starts one per task/action
  // when needed) while bounding a runaway loop of session churn.
  const { allowed } = await checkRateLimit(`browser-control:headless-start:${dbUser.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many headless session starts. Try again shortly.' }, { status: 429 });
  }

  const session = await startHeadlessSession({ spaceId: space.id, userId: dbUser.id });
  const launch = await ensureHeadlessResearchWorker(session.id);
  if (!launch.ok) {
    await endHeadlessSession(session.id, { spaceId: space.id }).catch(() => {});
    return NextResponse.json(
      { error: 'Cloud research browser is unavailable. No work was queued.' },
      { status: 503 },
    );
  }

  return NextResponse.json({
    sessionId: session.id,
    source: session.source,
    // A row exists before the Modal worker has proved it is alive. Do not
    // present that as an active browser: `/status` becomes active only after
    // the first fenced worker heartbeat is observed.
    state: 'launching',
    status: 'launching',
    startedAt: session.startedAt,
    workerStarted: launch.started,
  });
}
