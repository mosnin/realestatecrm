/**
 * GET /api/workflows/[id]/runs — the per-workflow RUN HISTORY (audit trail).
 *
 * Surfaces the WorkflowRun + WorkflowRunStep rows the executor writes on every
 * run, so a realtor can see what fired, when, and what each step did. Read-only —
 * no engine/schema writes. Returns the most recent runs (capped at 20) with each
 * run's steps inlined, which is all the timeline UI needs.
 *
 * Owner-scoped like the other workflow routes: requireAuth → getSpaceForUser →
 * the store reads are scoped by space.id (a workflow/run that isn't the caller's
 * simply doesn't match). listWorkflowRuns returns [] for a workflow that isn't
 * owned, so a missing/foreign workflow yields an empty history rather than a leak.
 *
 * Mirrors /api/workflows/[id] and /api/workflows/[id]/test-run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import {
  listWorkflowRuns,
  getWorkflowRunSteps,
  MAX_WORKFLOW_RUNS,
} from '@/lib/workflows/store';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const runs = await listWorkflowRuns(space.id, id, MAX_WORKFLOW_RUNS);
    // Inline each run's steps — the timeline expands a run to its steps, and N is
    // capped at 20, so this is a small, bounded fan-out the UI can render at once.
    const withSteps = await Promise.all(
      runs.map(async (run) => ({
        ...run,
        steps: await getWorkflowRunSteps(space.id, run.id),
      })),
    );
    return NextResponse.json({ runs: withSteps });
  } catch (error) {
    logger.error('[workflows] runs load failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}
