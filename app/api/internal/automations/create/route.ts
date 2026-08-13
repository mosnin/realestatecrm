/**
 * POST /api/internal/automations/create — Chippi builds a workflow silently.
 *
 * The Focus Update's "Chippi does, never links": when a realtor tells Chippi
 * "do that every time a Zillow lead comes in," the agent calls this instead of
 * sending them to the builder. Authed by AGENT_INTERNAL_SECRET (Modal/Python
 * runtime) — same contract as /api/internal/studio/*.
 *
 * This route shares the exact native creation helper used by Work mode, so a
 * request to send creates an enabled auto workflow rather than a draft-only
 * placeholder. The helper still validates the schema, trigger, tenant cap,
 * and explicit send-versus-draft semantics before persistence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  createWorkflowFromDescription,
  MAX_AUTOMATION_DESCRIPTION,
  WorkflowCreationError,
} from '@/lib/workflows/create-from-description';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const secret = process.env.AGENT_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { spaceId?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId : '';
  const description =
    typeof body.description === 'string'
      ? body.description.trim().slice(0, MAX_AUTOMATION_DESCRIPTION)
      : '';
  if (!spaceId || !description) {
    return NextResponse.json({ error: 'spaceId and description are required' }, { status: 400 });
  }

  const rl = await checkRateLimit(`automations:internal:create:${spaceId}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many automations built this hour.' }, { status: 429 });
  }

  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('id', spaceId)
    .maybeSingle();
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  try {
    const { workflow, definition } = await createWorkflowFromDescription({
      spaceId,
      description,
      signal: req.signal,
    });
    return NextResponse.json(
      {
        ok: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          trigger: definition.trigger.type,
          actionCount: definition.actions.length,
          autonomy: definition.autonomy,
          enabled: workflow.enabled,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof WorkflowCreationError) {
      const status = error.code === 'limit' ? 409 : error.code === 'generation' ? 502 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    logger.error('[internal/automations] workflow creation failed', { spaceId }, error);
    return NextResponse.json({ error: 'Automation creation failed.' }, { status: 500 });
  }
}
