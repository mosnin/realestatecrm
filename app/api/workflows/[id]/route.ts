/**
 * GET    /api/workflows/[id] — one workflow (404 if not owned/found).
 * PATCH  /api/workflows/[id] — edit name / enabled / definition.
 * DELETE /api/workflows/[id] — remove a workflow.
 *
 * Every query is scoped by spaceId as well as id, so a workflow that isn't the
 * caller's simply doesn't match — ownership check and 404 in one. When PATCH
 * carries a `definition`, we validate it via parseWorkflowDefinition (400 with
 * issues on a bad shape) before the store replaces the shape columns + bumps
 * version. Mirrors /api/routines/[id].
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import {
  parseWorkflowDefinition,
  WorkflowDefinitionError,
} from '@/lib/workflows/schema';
import {
  getWorkflow,
  updateWorkflow,
  deleteWorkflow,
  type UpdateWorkflowPatch,
} from '@/lib/workflows/store';
import { validateIntegrationTrigger } from '@/lib/integrations/trigger-catalog';
import { reconcileWorkflowTriggers } from '@/lib/integrations/reconcile-workflow-triggers';

export const runtime = 'nodejs';

const MAX_NAME = 120;

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
    const workflow = await getWorkflow(space.id, id);
    if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(workflow);
  } catch (error) {
    logger.error('[workflows] get failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: UpdateWorkflowPatch = {};

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Give the workflow a name.' }, { status: 400 });
    }
    if (trimmed.length > MAX_NAME) {
      return NextResponse.json(
        { error: `Name must be ${MAX_NAME} characters or fewer.` },
        { status: 400 },
      );
    }
    patch.name = trimmed;
  }

  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (typeof body.notifyOnError === 'boolean') patch.notifyOnError = body.notifyOnError;

  if ('description' in body) {
    patch.description =
      typeof body.description === 'string' ? body.description.trim() || null : null;
  }

  if ('description' in body) {
    patch.description =
      typeof body.description === 'string' ? body.description.trim() || null : null;
  }

  // A new definition replaces trigger/conditions/actions/autonomy together and
  // bumps version. Validate the raw shape first; 400 with issues on bad input.
  if (body.definition !== undefined) {
    try {
      patch.definition = parseWorkflowDefinition(body.definition);
    } catch (err) {
      if (err instanceof WorkflowDefinitionError) {
        return NextResponse.json(
          { error: 'Invalid workflow definition.', issues: err.issues },
          { status: 400 },
        );
      }
      throw err;
    }
    // Same guard as create: an integration_event trigger must reference an
    // app/event we actually subscribe, or the workflow could never fire.
    const triggerErr = validateIntegrationTrigger(patch.definition);
    if (triggerErr) {
      return NextResponse.json({ error: triggerErr }, { status: 400 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  try {
    const workflow = await updateWorkflow(space.id, id, patch);
    if (!workflow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Best-effort: heal any missing Composio subscription the space's
    // integration_event workflows depend on. Runs AFTER the response via after()
    // so it never adds latency or breaks the save. after() throws outside a
    // request scope (script/test) — guarded. Two triggers:
    //   - a saved integration_event definition (the slug may be newly curated);
    //   - RE-ENABLING a workflow (enabled:true) — a previously-disabled
    //     integration_event workflow whose subscription drifted while off would
    //     otherwise silently never fire, and an enable toggle carries no
    //     definition, so gating on definition alone misses the most common path.
    if (patch.definition?.trigger.type === 'integration_event' || patch.enabled === true) {
      try {
        after(() => reconcileWorkflowTriggers(space.id));
      } catch {
        /* no request context — skip background reconcile */
      }
    }

    return NextResponse.json(workflow);
  } catch (error) {
    logger.error('[workflows] update failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const existed = await deleteWorkflow(space.id, id);
    if (!existed) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('[workflows] delete failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
