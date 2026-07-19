/**
 * GET    /api/drip/sequences/[id] — one sequence, if it belongs to the caller.
 * PATCH  /api/drip/sequences/[id] — partial update { name?, steps?, active? }.
 * DELETE /api/drip/sequences/[id] — remove a sequence.
 *
 * Owner-scoped exactly like the parent /api/drip/sequences route (Clerk
 * requireAuth → resolve the owner's Space → every query carries
 * `.eq('id', id).eq('spaceId', space.id)`), so a sequence id from another
 * tenant 404s instead of leaking existence or being editable/deletable.
 *
 * DELETE is guarded: a sequence with a live ('enrolled') contact on it
 * cannot be hard-deleted — "DripSequence" cascades to "DripEnrollment" on
 * delete (supabase/migrations/20260830000000_drip_sequences.sql), which
 * would silently vanish someone's in-flight nurture with no stopReason on
 * record. Archiving (PATCH { active: false }) is the safe way to retire a
 * sequence that still has contacts on it; DELETE is for sequences nobody is
 * actively walking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { parseDripSteps, DripSequenceValidationError } from '@/lib/drip/schema';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const SELECT = 'id, name, steps, active, createdAt, updatedAt';
const MAX_NAME = 120;

export async function GET(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  const { data, error } = await supabase
    .from('DripSequence')
    .select(SELECT)
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (error) {
    logger.error('[drip/sequences/id] load failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Give the sequence a name.' }, { status: 400 });
    }
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer.` }, { status: 400 });
    }
    patch.name = name;
  }

  if (body.steps !== undefined) {
    try {
      patch.steps = parseDripSteps(body.steps);
    } catch (err) {
      if (err instanceof DripSequenceValidationError) {
        return NextResponse.json({ error: 'Invalid drip steps.', issues: err.issues }, { status: 400 });
      }
      throw err;
    }
  }

  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ error: 'active must be a boolean.' }, { status: 400 });
    }
    patch.active = body.active;
  }

  if (Object.keys(patch).length === 1) {
    // Only updatedAt — nothing real to change.
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('DripSequence')
    .update(patch)
    .eq('id', id)
    .eq('spaceId', space.id)
    .select(SELECT)
    .maybeSingle();

  if (error) {
    logger.error('[drip/sequences/id] update failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // Confirm the sequence belongs to this space before anything else — a
  // cross-tenant id must 404, never leak into the live-enrollment check below.
  const { data: sequence, error: seqErr } = await supabase
    .from('DripSequence')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (seqErr) {
    logger.error('[drip/sequences/id] lookup failed', { spaceId: space.id, id }, seqErr);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
  if (!sequence) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { count, error: liveErr } = await supabase
    .from('DripEnrollment')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', space.id)
    .eq('sequenceId', id)
    .eq('status', 'enrolled');
  if (liveErr) {
    logger.error('[drip/sequences/id] live-enrollment check failed', { spaceId: space.id, id }, liveErr);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This sequence still has contacts enrolled. Archive it instead, or stop those enrollments first.' },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from('DripSequence')
    .delete()
    .eq('id', id)
    .eq('spaceId', space.id);
  if (error) {
    logger.error('[drip/sequences/id] delete failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
