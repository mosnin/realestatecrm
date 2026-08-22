/**
 * DELETE /api/browser-control/link/[id] — Clerk-authed. The realtor's kill
 * switch / unpair action: revokes the link (its bearer token stops
 * authenticating on the next /poll → 401 → extension tears itself down) and
 * ends any of its active sessions so an in-flight control run stops even if
 * the extension is mid-poll-cycle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getCurrentDbUser } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { endSessionsForLink } from '@/lib/browser-control/session';
import { tenantTable } from '@/lib/tenant-db';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const [space, dbUser] = await Promise.all([getSpaceForUser(userId), getCurrentDbUser()]);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Ownership check scoped to (spaceId, userId) BEFORE any mutation — a
  // caller cannot revoke another user's link even within the same space.
  const { data: link, error: findErr } = await tenantTable(supabase, 'BrowserLink', { spaceId: space.id })
    .select('id')
    .eq('id', id)
    .eq('userId', dbUser.id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: 'Failed to load link' }, { status: 500 });
  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: revokeErr } = await tenantTable(supabase, 'BrowserLink', { spaceId: space.id })
    .update({ revokedAt: new Date().toISOString() })
    .eq('id', id);
  if (revokeErr) return NextResponse.json({ error: 'Failed to revoke link' }, { status: 500 });

  await endSessionsForLink(id, { spaceId: space.id });

  return NextResponse.json({ success: true });
}
