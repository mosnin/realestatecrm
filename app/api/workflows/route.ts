/**
 * GET  /api/workflows — the caller's space workflows, newest first.
 * POST /api/workflows — create a workflow from { name, definition }.
 *
 * Owner-scoped, mirroring /api/routines: Clerk requireAuth → resolve the
 * owner's Space → scope every query by spaceId. The definition is the raw
 * trigger/conditions/actions/autonomy object; we run parseWorkflowDefinition
 * (throws WorkflowDefinitionError with field-level issues) and surface a 400
 * with those issues on a bad shape. A per-space count cap keeps the list sane.
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
  listWorkflows,
  createWorkflow,
  countWorkflows,
  MAX_WORKFLOWS_PER_SPACE,
} from '@/lib/workflows/store';
import { validateIntegrationTrigger } from '@/lib/integrations/trigger-catalog';
import { reconcileWorkflowTriggers } from '@/lib/integrations/reconcile-workflow-triggers';

export const runtime = 'nodejs';

const MAX_NAME = 120;

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const workflows = await listWorkflows(space.id);
    return NextResponse.json({ workflows });
  } catch (error) {
    logger.error('[workflows] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Give the workflow a name.' }, { status: 400 });
  }
  if (name.length > MAX_NAME) {
    return NextResponse.json(
      { error: `Name must be ${MAX_NAME} characters or fewer.` },
      { status: 400 },
    );
  }

  // Validate the raw definition before any write. A bad shape returns 400 with
  // the field-level issues so the UI can point at the offending field.
  let definition;
  try {
    definition = parseWorkflowDefinition(body.definition);
  } catch (err) {
    if (err instanceof WorkflowDefinitionError) {
      return NextResponse.json(
        { error: 'Invalid workflow definition.', issues: err.issues },
        { status: 400 },
      );
    }
    throw err;
  }

  // Reject a workflow whose integration_event trigger references an app/event we
  // don't actually subscribe — it could never fire (the engine matches the live
  // delivery slug with an exact ===). Stops a silently-dead workflow at the door.
  const triggerErr = validateIntegrationTrigger(definition);
  if (triggerErr) {
    return NextResponse.json({ error: triggerErr }, { status: 400 });
  }

  // Cap workflows per space — a wall of standing automations is its own mess.
  try {
    const count = await countWorkflows(space.id);
    if (count >= MAX_WORKFLOWS_PER_SPACE) {
      return NextResponse.json(
        { error: `You've reached the limit of ${MAX_WORKFLOWS_PER_SPACE} workflows.` },
        { status: 409 },
      );
    }

    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const workflow = await createWorkflow(space.id, { name, definition, enabled });

    // Best-effort: heal any missing Composio subscription this workflow's
    // integration_event trigger depends on (drift if the slug was curated after
    // connect, or a connect-time subscribe failed). Runs AFTER the response via
    // after() so it never adds latency or breaks the save. after() throws if
    // called outside a request scope (script/test) — guarded.
    if (definition.trigger.type === 'integration_event') {
      try {
        after(() => reconcileWorkflowTriggers(space.id));
      } catch {
        /* no request context — skip background reconcile */
      }
    }

    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    logger.error('[workflows] create failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }
}
