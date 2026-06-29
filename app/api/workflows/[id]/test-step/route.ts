/**
 * POST /api/workflows/[id]/test-step — test a single action step in isolation.
 *
 * Zapier-style "Test this step": after configuring one action in the builder the
 * realtor can fire just that step against synthetic context to see what it does
 * before saving the whole workflow. The result shows up inline in the step card.
 *
 * The workflow id is used solely for auth scoping (must belong to the caller's
 * space) and to resolve the trigger type (needed to build the sample context).
 * The action itself is supplied in the request body — it may differ from the
 * stored workflow (the builder is testing the CURRENT unsaved config).
 *
 * SAFETY: always draft-mode. No real sends, no real integrations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { executeAction } from '@/lib/workflows/actions';
import { getWorkflow } from '@/lib/workflows/store';
import { workflowActionSchema, WorkflowDefinitionError } from '@/lib/workflows/schema';
import { sampleContextFor } from '../test-run/context';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const stored = await getWorkflow(space.id, id).catch(() => null);
  if (!stored) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const actionRaw = body.action;
  if (!actionRaw || typeof actionRaw !== 'object') {
    return NextResponse.json({ error: 'action is required.' }, { status: 400 });
  }

  // Validate just the single action through the Zod schema.
  const parseResult = workflowActionSchema.safeParse(actionRaw);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Step configuration is incomplete — fill in all required fields first.', issues: parseResult.error.issues.map((i) => i.message) },
      { status: 422 },
    );
  }

  const action = parseResult.data;
  const context = sampleContextFor(stored.trigger);

  const start = Date.now();
  try {
    const result = await executeAction(action, context, {
      spaceId: space.id,
      autonomy: 'draft',
    });
    return NextResponse.json({
      status: result.status,
      detail: result.detail ?? null,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    logger.error('[workflows/test-step] executeAction threw', { spaceId: space.id, id }, err);
    return NextResponse.json({ error: 'Step execution failed.' }, { status: 500 });
  }
}
