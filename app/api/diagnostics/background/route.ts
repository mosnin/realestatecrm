/**
 * GET /api/diagnostics/background — the background-readiness report for the
 * caller's workspace.
 *
 * Owner-scoped (NOT platform-admin): mirrors app/api/routines/route.ts — Clerk
 * auth via requireAuth, then resolve the caller's own space with
 * getSpaceForUser. The report names env prerequisites (presence only, never
 * secret values) plus a per-space "recent activity" check, so it's scoped to
 * the space the realtor owns.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { getBackgroundReadiness } from '@/lib/diagnostics/background-readiness';

export const runtime = 'nodejs';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const report = await getBackgroundReadiness(space.id);
  return NextResponse.json(report);
}
