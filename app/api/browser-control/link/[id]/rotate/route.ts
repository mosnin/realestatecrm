/**
 * POST /api/browser-control/link/[id]/rotate — Clerk-authed. Revokes the
 * link's current bearer token and mints a fresh one in its place (same link
 * id — any active session / queued actions tied to it are unaffected), for a
 * realtor who suspects their extension token leaked without wanting to
 * re-pair the extension from scratch. The new raw token is returned exactly
 * once, mirroring pair/redeem — only its hash is ever persisted.
 *
 * The extension currently holding the OLD token will 401 on its next /poll
 * (the token hash no longer matches) and tear itself down exactly like a
 * fully revoked link — the realtor must re-enter the new token in the
 * extension to reconnect.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { rotateToken } from '@/lib/browser-control/auth';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Ownership check scoped to (spaceId, userId) BEFORE any mutation — a
  // caller cannot rotate another user's link even within the same space.
  const { data: link, error: findErr } = await supabase
    .from('BrowserLink')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .eq('userId', dbUser.id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: 'Failed to load link' }, { status: 500 });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await rotateToken(id, { spaceId: space.id });
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ token: result.token, tokenPrefix: result.tokenPrefix });
}
