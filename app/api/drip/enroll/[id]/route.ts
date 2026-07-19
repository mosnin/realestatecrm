/**
 * DELETE /api/drip/enroll/[id] — manually stop one enrollment.
 *
 * Owner-scoped: Clerk requireAuth → resolve the owner's Space → the update
 * carries both `.eq('id', id)` AND `.eq('spaceId', space.id)`, so an
 * enrollment id from another tenant 404s instead of being stoppable.
 *
 * This does NOT touch lib/drip/engine.ts — it writes directly to
 * "DripEnrollment" the same way the engine's own setEnrollmentStatus does
 * (status='stopped', stopReason set, updatedAt bumped), for the one case the
 * engine itself never triggers: a realtor deciding by hand to pull a contact
 * out of a sequence. Only a currently-'enrolled' row can be stopped this way
 * — an already completed/stopped enrollment is left alone (idempotent no-op
 * surfaced as 409, not silently "succeeding" twice).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Look up first so a cross-tenant/nonexistent id 404s distinctly from an
  // already completed/stopped enrollment (409 — nothing live left to stop).
  const { data: existing, error: lookupErr } = await supabase
    .from('DripEnrollment')
    .select('id, status')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (lookupErr) {
    logger.error('[drip/enroll/id] lookup failed', { spaceId: space.id, id }, lookupErr);
    return NextResponse.json({ error: 'Stop failed' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((existing as { status: string }).status !== 'enrolled') {
    return NextResponse.json({ error: 'This enrollment is no longer active.' }, { status: 409 });
  }

  const { error } = await supabase
    .from('DripEnrollment')
    .update({ status: 'stopped', stopReason: 'unenrolled', updatedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('spaceId', space.id)
    .eq('status', 'enrolled');

  if (error) {
    logger.error('[drip/enroll/id] stop failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Stop failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
