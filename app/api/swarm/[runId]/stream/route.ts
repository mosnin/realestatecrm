/**
 * GET /api/swarm/[runId]/stream
 *
 * Server-Sent Events stream for real-time swarm progress.
 *
 * Polls SwarmEvent rows for the given run every 400 ms and emits each event
 * as an SSE message. The stream closes when a terminal event is seen
 * (swarm_completed / swarm_failed / swarm_cancelled) or after 10 minutes
 * (1500 polls × 400 ms).
 *
 * The client must be authenticated and the run must belong to the caller's
 * space — otherwise 403/404 is returned before the stream opens.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const TERMINAL_EVENT_TYPES = new Set(['swarm_completed', 'swarm_failed', 'swarm_cancelled']);
const POLL_INTERVAL_MS = 400;
const MAX_POLLS = 1500; // ~10 minutes

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  // Verify the run belongs to the caller's space.
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: run } = await supabase
    .from('SwarmRun')
    .select('id, spaceId, status')
    .eq('id', runId)
    .maybeSingle();

  if (!run || run.spaceId !== space.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let done = TERMINAL_RUN_STATUSES.has(run.status as string);
  let lastCreatedAt = new Date(0).toISOString();
  let pollCount = 0;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventType: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      // Send an immediate heartbeat so the client knows the stream is alive.
      send('connected', { runId, status: run.status });

      // Two honesty guards the old loop lacked:
      //  - consecutive poll errors used to be silently dropped (the `error`
      //    was never destructured), so a dying DB meant a 10-minute spinner;
      //  - a run whose dispatch never landed sat 'queued' with zero events
      //    for the full 10 minutes while the card said "working".
      let consecutiveErrors = 0;
      let sawAnyEvent = false;

      try {
        while (!done && pollCount < MAX_POLLS) {
          await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
          pollCount++;

          const { data: events, error: pollError } = await supabase
            .from('SwarmEvent')
            .select('id, type, data, memberId, createdAt')
            .eq('swarmRunId', runId)
            .gt('createdAt', lastCreatedAt)
            .order('createdAt', { ascending: true })
            .limit(50);

          if (pollError) {
            consecutiveErrors++;
            if (consecutiveErrors >= 12) {
              // ~5s of straight DB failures — stop pretending.
              send('swarm_failed', { error: 'Lost the run mid-stream. Refresh to check its status.' });
              done = true;
            }
            continue;
          }
          consecutiveErrors = 0;

          for (const event of events ?? []) {
            sawAnyEvent = true;
            send(event.type as string, {
              ...(event.data as Record<string, unknown>),
              memberId: event.memberId,
              eventId: event.id,
            });
            lastCreatedAt = event.createdAt as string;
            if (TERMINAL_EVENT_TYPES.has(event.type as string)) {
              done = true;
            }
          }

          // Dead-on-arrival check: ~30s in with zero events means the
          // dispatch never reached the runner. Confirm against the run row
          // and end honestly instead of spinning out the full 10 minutes.
          if (!sawAnyEvent && pollCount === 75) {
            const { data: current } = await supabase
              .from('SwarmRun')
              .select('status')
              .eq('id', runId)
              .maybeSingle();
            if (current?.status === 'queued') {
              send('swarm_failed', { error: 'The run never started — the backend did not pick it up.' });
              done = true;
            }
          }
        }

        send('stream_end', { reason: done ? 'swarm_done' : 'timeout' });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Client disconnected — stop polling on the next iteration.
      done = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
