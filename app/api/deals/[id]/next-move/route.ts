/**
 * POST /api/deals/[id]/next-move — on-demand "Next Move" refresh.
 *
 * The quick panel's refresh affordance for a stale (>48h) move. Recomputes
 * and persists the deal's next move synchronously and returns it so the UI
 * can swap the chip in place without a full reload.
 *
 * Auth + scoping mirror the sibling deal routes (activity, checklist):
 * requireAuth → getSpaceForUser → the deal must exist in the caller's space,
 * otherwise 404 (wrong-space ids are indistinguishable from missing ones).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { computeNextMove } from '@/lib/deals/next-move';

export const runtime = 'nodejs';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Each refresh is one LLM completion — cheap, but not free. 20/min absorbs
  // any human tapping pattern while capping a runaway client's spend.
  const { allowed } = await checkRateLimit(`next-move:${userId}`, 20, 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many refreshes. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const { id } = await params;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: dealRows, error } = await supabase
    .from('Deal')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .limit(1);
  if (error) {
    return NextResponse.json({ error: 'Failed to load deal' }, { status: 500 });
  }
  if (!dealRows?.length) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const move = await computeNextMove(space.id, id);
  if (!move) {
    // Deal went closed/missing mid-flight or the write failed — either way
    // there is no fresh move to show. 200 with null keeps the client simple:
    // it clears the chip instead of surfacing a scary error for a non-event.
    return NextResponse.json({ nextMove: null });
  }

  return NextResponse.json({
    nextMove: { text: move.text, kind: move.kind, computedAt: move.computedAt },
  });
}
