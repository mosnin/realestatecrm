/**
 * GET /api/agent/briefing
 *
 * Read today's brief for the authenticated realtor's space. The cron at
 * /api/cron/daily-briefing pre-generates the row at 7am UTC; this route
 * is the read path the workspace surface calls.
 *
 * Behavior when no brief exists yet (cron hasn't run, or this realtor's
 * row was missed by the last tick): compose on demand and persist. The
 * realtor opening Chippi at 8am before the cron caught up still sees
 * their brief; they just paid the latency.
 *
 * PATCH is the seen / acted lifecycle — the workspace marks the brief
 * 'seen' on first render and 'acted' when a card's button is tapped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { composeBrief } from '@/lib/briefing/compose';
import type { Brief } from '@/lib/briefing/types';

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const forDate = todayUtcDate();

  const { data: existing } = await supabase
    .from('Brief')
    .select('id, status, payload, createdAt, seenAt, actedAt')
    .eq('spaceId', space.id)
    .eq('forDate', forDate)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      brief: existing.payload as Brief,
      createdAt: existing.createdAt,
      seenAt: existing.seenAt,
      actedAt: existing.actedAt,
    });
  }

  // No row yet — compose on demand and persist. The realtor sees their
  // brief; tomorrow's cron tick fills the gap for everyone systematically.
  const brief = await composeBrief(space.id);
  const { data: created, error } = await supabase
    .from('Brief')
    .insert({
      spaceId: space.id,
      forDate,
      status: 'pending',
      payload: brief,
    })
    .select('id, status, payload, createdAt, seenAt, actedAt')
    .single();

  if (error || !created) {
    // Persist failed but the brief itself is fine — return it anyway
    // so the surface doesn't get stuck on a transient DB hiccup.
    return NextResponse.json({
      id: null,
      status: 'pending',
      brief,
      createdAt: new Date().toISOString(),
      seenAt: null,
      actedAt: null,
    });
  }

  return NextResponse.json({
    id: created.id,
    status: created.status,
    brief: created.payload as Brief,
    createdAt: created.createdAt,
    seenAt: created.seenAt,
    actedAt: created.actedAt,
  });
}

/**
 * PATCH /api/agent/briefing
 *
 * Body: { event: 'seen' | 'acted' }
 *
 * 'seen'  → set seenAt + flip status from 'pending' to 'seen' (once).
 * 'acted' → set actedAt + flip status to 'acted' (once). 'acted' implies seen.
 *
 * Both are idempotent and additive — re-firing doesn't overwrite the
 * earlier timestamp, so the brief's true first-seen moment is preserved
 * for the momentum line that Phase B reads from.
 */
export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { event } = (await req.json()) as { event?: 'seen' | 'acted' };
  if (event !== 'seen' && event !== 'acted') {
    return NextResponse.json({ error: 'event must be "seen" or "acted"' }, { status: 400 });
  }

  const forDate = todayUtcDate();
  const { data: existing } = await supabase
    .from('Brief')
    .select('id, seenAt, actedAt, status')
    .eq('spaceId', space.id)
    .eq('forDate', forDate)
    .maybeSingle();

  if (!existing) return NextResponse.json({ ok: true });

  const update: Record<string, string> = {};
  const nowIso = new Date().toISOString();

  if (event === 'seen' && !existing.seenAt) {
    update.seenAt = nowIso;
    if (existing.status === 'pending') update.status = 'seen';
  }
  if (event === 'acted') {
    if (!existing.seenAt) update.seenAt = nowIso;
    if (!existing.actedAt) update.actedAt = nowIso;
    update.status = 'acted';
  }

  if (Object.keys(update).length > 0) {
    await supabase.from('Brief').update(update).eq('id', existing.id);
  }

  return NextResponse.json({ ok: true });
}
