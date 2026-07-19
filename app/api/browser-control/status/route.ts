/**
 * GET /api/browser-control/status — Clerk-authed. Powers the settings UI:
 * is an extension paired, which device, and is a control session currently
 * active — and, now, which RUNTIME that active session is (`source`:
 * 'extension' | 'headless'), so the UI can honestly show "driving your
 * browser" vs. "using a cloud research browser" rather than implying every
 * active session is the paired extension. Honest UI (CLAUDE.md #5): never
 * reports "connected" when the link is revoked or there's simply no link at
 * all.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getActiveSession, getLatestFrame } from '@/lib/browser-control/session';

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: links, error } = await supabase
    .from('BrowserLink')
    .select('id, tokenPrefix, deviceLabel, createdAt, lastUsedAt, revokedAt')
    .eq('spaceId', space.id)
    .eq('userId', dbUser.id)
    .is('revokedAt', null)
    .order('createdAt', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load browser links' }, { status: 500 });

  const activeSession = await getActiveSession(space.id, dbUser.id);
  // Cheap to fold in: getActiveSession already resolved (and staleness-
  // checked) the session; this just checks whether it has a frame yet.
  const latestFrame = activeSession ? await getLatestFrame(space.id, dbUser.id) : null;

  return NextResponse.json({
    links: links ?? [],
    connected: (links ?? []).length > 0,
    session: activeSession
      ? {
          id: activeSession.id,
          status: activeSession.status,
          source: activeSession.source,
          startedAt: activeSession.startedAt,
          hasFrame: latestFrame !== null,
        }
      : null,
  });
}
