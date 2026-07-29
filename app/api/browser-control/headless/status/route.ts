/** Exact cloud-research status. Deliberately separate from the extension
 * status endpoint so a newer paired browser cannot mask a running workspace. */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { getLatestHeadlessSession } from '@/lib/browser-control/session';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const [space, user] = await Promise.all([getSpaceForUser(auth.userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!isResearchWorkspaceEnabledForSpace(space.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { allowed } = await checkRateLimit(`browser-control:headless-status:${user.id}`, 90, 60);
  if (!allowed) return NextResponse.json({ error: 'Polling too fast' }, { status: 429 });
  const session = await getLatestHeadlessSession(space.id, user.id);
  if (!session) return NextResponse.json({ session: null });
  const leaseExpired = session.workerLeaseExpiresAt != null
    && new Date(session.workerLeaseExpiresAt).getTime() < Date.now();
  const state = session.status !== 'active'
    ? (session.workerLastError ? 'error' : 'stopped')
    : leaseExpired ? 'error' : session.lastPolledAt ? 'active' : 'launching';
  return NextResponse.json({
    session: {
      id: session.id,
      source: 'headless',
      state,
      startedAt: session.startedAt,
      lastHeartbeatAt: session.lastPolledAt ?? null,
      leaseExpiresAt: session.workerLeaseExpiresAt ?? null,
      ...(state === 'error' ? { error: (session.workerLastError ?? 'Cloud research worker heartbeat expired.').slice(0, 1_000) } : {}),
    },
  });
}
