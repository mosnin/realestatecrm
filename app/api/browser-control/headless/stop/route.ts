/**
 * POST /api/browser-control/headless/stop — Clerk-authed. Ends the caller's
 * active HEADLESS browser-control session (the panel's Stop button for cloud
 * sessions, which have no in-page kill switch). No-op-safe: if there's no
 * active headless session, returns { stopped: false } honestly rather than
 * erroring. Scoped to (spaceId, userId) from the authenticated context — a
 * caller can only stop their OWN session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { getHeadlessSessionForUser, endHeadlessSession } from '@/lib/browser-control/session';
import { isResearchWorkspaceEnabledForSpace } from '@/lib/chippi/research-workspace-flag';

const stopBody = z.object({ sessionId: z.string().uuid() });

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const parsed = stopBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  const active = await getHeadlessSessionForUser(parsed.data.sessionId, { spaceId: space.id, userId: dbUser.id });
  if (!active) {
    // Nothing to stop — extension sessions are deliberately irrelevant to
    // this exact cloud-workspace control.
    return NextResponse.json({ stopped: false });
  }

  await endHeadlessSession(active.id, { spaceId: space.id });
  return NextResponse.json({ stopped: true, sessionId: active.id });
}
