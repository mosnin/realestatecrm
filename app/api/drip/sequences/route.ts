/**
 * GET  /api/drip/sequences — the caller's space drip sequences, newest first.
 * POST /api/drip/sequences — create a sequence from { name, steps }.
 *
 * Owner-scoped, mirroring /api/workflows and /api/routines: Clerk
 * requireAuth → resolve the owner's Space → scope every query by spaceId.
 * `steps` is validated with parseDripSteps (lib/drip/schema.ts) before any
 * write — a bad shape returns 400 with field-level issues.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { parseDripSteps, DripSequenceValidationError } from '@/lib/drip/schema';

export const runtime = 'nodejs';

const SELECT = 'id, name, steps, active, createdAt, updatedAt';
const MAX_NAME = 120;
const MAX_SEQUENCES_PER_SPACE = 50;

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('DripSequence')
    .select(SELECT)
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false });

  if (error) {
    logger.error('[drip/sequences] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }

  return NextResponse.json({ sequences: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Give the sequence a name.' }, { status: 400 });
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer.` }, { status: 400 });
  }

  let steps;
  try {
    steps = parseDripSteps(body.steps);
  } catch (err) {
    if (err instanceof DripSequenceValidationError) {
      return NextResponse.json({ error: 'Invalid drip steps.', issues: err.issues }, { status: 400 });
    }
    throw err;
  }

  const { count, error: countErr } = await supabase
    .from('DripSequence')
    .select('id', { count: 'exact', head: true })
    .eq('spaceId', space.id);
  if (countErr) {
    logger.error('[drip/sequences] count failed', { spaceId: space.id }, countErr);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_SEQUENCES_PER_SPACE) {
    return NextResponse.json(
      { error: `You've reached the limit of ${MAX_SEQUENCES_PER_SPACE} drip sequences.` },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();
  const active = typeof body.active === 'boolean' ? body.active : true;
  const { data, error } = await supabase
    .from('DripSequence')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      name,
      steps,
      active,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .select(SELECT)
    .single();

  if (error) {
    logger.error('[drip/sequences] create failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
