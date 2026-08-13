import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

// ── POST /api/swarm/[runId]/cancel ────────────────────────────────────────────
// Cancel a swarm run that is currently queued, planning, running, or auditing.

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

  const { data, error } = await supabase.rpc('cancel_swarm_run', {
    p_run_id: runId,
    p_space_id: space.id,
  });
  if (error) {
    console.error('[swarm/[runId]/cancel/POST] atomic cancellation error:', error);
    return NextResponse.json({ error: 'Failed to cancel run' }, { status: 500 });
  }
  const result = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { outcome?: unknown; status?: unknown }
    : null;
  if (!result || typeof result.outcome !== 'string') {
    return NextResponse.json({ error: 'Failed to cancel run' }, { status: 500 });
  }
  if (result.outcome === 'not_found') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (result.outcome === 'already_terminal') {
    return NextResponse.json(
      {
        error: 'Run already finished before cancellation could be applied',
        status: typeof result.status === 'string' ? result.status : undefined,
        rehydrate: true,
      },
      { status: 409 },
    );
  }
  if (result.outcome === 'inactive') {
    return NextResponse.json(
      { error: 'Run cannot be cancelled in its current state' },
      { status: 400 },
    );
  }
  if (result.outcome !== 'cancelled') {
    return NextResponse.json({ error: 'Failed to cancel run' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    status: 'cancelled',
    message:
      'Cancellation recorded. A specialist already inside a model call may finish that call, but its result will not replace the cancelled run.',
  });
}
