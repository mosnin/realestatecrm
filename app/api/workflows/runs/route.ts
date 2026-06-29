/**
 * GET /api/workflows/runs — cross-workflow run history for the space.
 *
 * Returns the most recent 50 runs across all workflows, newest first, with the
 * parent workflow's name embedded for display. This powers the global "History"
 * tab in the workflow manager — the equivalent of Zapier's Zap History page.
 *
 * Scoped by spaceId from the session — no additional ownership check needed
 * because WorkflowRun.spaceId is the authoritative guard at the store layer.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { listAllWorkflowRuns } from '@/lib/workflows/store';

export const runtime = 'nodejs';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const runs = await listAllWorkflowRuns(space.id);
    return NextResponse.json({ runs });
  } catch (error) {
    logger.error('[workflows/runs] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}
