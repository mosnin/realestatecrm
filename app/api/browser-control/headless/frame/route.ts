import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { getLatestHeadlessFrame } from '@/lib/browser-control/session';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const [space, user] = await Promise.all([getSpaceForUser(auth.userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!isResearchWorkspaceEnabledForSpace(space.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { allowed } = await checkRateLimit(`browser-control:headless-frame:${user.id}`, 90, 60);
  if (!allowed) return NextResponse.json({ error: 'Polling too fast' }, { status: 429 });
  const latest = await getLatestHeadlessFrame(space.id, user.id);
  return NextResponse.json(latest ? { sessionId: latest.sessionId, source: 'headless', frame: latest.frame } : { sessionId: null, source: 'headless', frame: null });
}
