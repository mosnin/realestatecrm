import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

// ── POST /api/swarm/[runId]/cancel ────────────────────────────────────────────
// Cancel a swarm run that is currently queued, planning, running, or auditing.

const CANCELLABLE_STATUSES = new Set(['queued', 'planning', 'running', 'auditing']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { runId } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the run and verify it belongs to the calling user's space.
  const { data: run, error: runError } = await supabase
    .from('SwarmRun')
    .select('id, spaceId, status')
    .eq('id', runId)
    .eq('spaceId', space.id)
    .maybeSingle();

  if (runError) {
    console.error('[swarm/[runId]/cancel/POST] run fetch error:', runError);
    return NextResponse.json({ error: 'Failed to fetch run' }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!CANCELLABLE_STATUSES.has(run.status as string)) {
    if (TERMINAL_STATUSES.has(run.status as string)) {
      return NextResponse.json(
        {
          error: 'Run already finished before cancellation could be applied',
          status: run.status,
          rehydrate: true,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: 'Run cannot be cancelled in its current state' },
      { status: 400 },
    );
  }

  // Mark the run as cancelled only if it is still cancellable. The status
  // predicate closes the fetch/update race with a terminal worker write.
  const { data: cancelledRun, error: updateError } = await supabase
    .from('SwarmRun')
    .update({ status: 'cancelled', completedAt: new Date().toISOString() })
    .eq('id', runId)
    .eq('spaceId', space.id)
    .in('status', Array.from(CANCELLABLE_STATUSES))
    .select('id')
    .maybeSingle();

  if (updateError) {
    console.error('[swarm/[runId]/cancel/POST] update error:', updateError);
    return NextResponse.json({ error: 'Failed to cancel run' }, { status: 500 });
  }
  if (!cancelledRun) {
    return NextResponse.json(
      { error: 'Run finished before cancellation could be applied' },
      { status: 409 },
    );
  }

  // Append a cancellation event to the event log.
  const { error: eventError } = await supabase
    .from('SwarmEvent')
    .insert({ swarmRunId: runId, type: 'swarm_cancelled', data: { reason: 'user_cancelled' } });

  if (eventError) {
    console.error('[swarm/[runId]/cancel/POST] event insert error:', eventError);
    // Run is already cancelled — don't fail the request over a missing event row.
  }

  return NextResponse.json({
    success: true,
    status: 'cancelled',
    message:
      'Cancellation recorded. A specialist already inside a model call may finish that call, but its result will not replace the cancelled run.',
  });
}
