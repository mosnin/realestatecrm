/**
 * POST /api/workflows/[id]/webhook — public webhook endpoint.
 *
 * Any external service can POST any JSON payload to this URL and the workflow
 * fires immediately. The workflow id is the secret — it's a UUID (128 bits of
 * randomness), giving the same security posture as Zapier webhook catch hooks.
 *
 * The incoming JSON body becomes `event.payload` in the WorkflowContext so the
 * realtor's actions/instructions can reference it. No auth header is required;
 * the UUID alone is the credential.
 *
 * Safety gates:
 *  - The workflow must exist and be ENABLED. Disabled webhooks return 404 (not
 *    403 — don't leak existence to scanners).
 *  - The workflow's trigger.type must be 'webhook'. If a UUID is discovered by
 *    brute-force and points to a non-webhook workflow, the route rejects it.
 *  - Body is capped at 256 KB; larger payloads are rejected to prevent memory DoS.
 *  - The run is enqueued fire-and-forget via `after()` so the webhook caller
 *    gets a fast 200 instead of waiting for the full workflow execution.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { logger } from '@/lib/logger';
import { getWorkflow } from '@/lib/workflows/store';
import { runWorkflow, type WorkflowRow } from '@/lib/workflows/executor';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BODY_BYTES = 256 * 1024; // 256 KB

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Validate body size before parsing.
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  // Parse body — undefined is fine (empty POST).
  let payload: unknown = {};
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    if (text.trim()) {
      payload = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Load the workflow by id alone. We don't have a session here, so we query
  // without spaceId gating — the UUID itself is the credential. We gate on
  // enabled + trigger.type below.
  const { data: row, error: dbErr } = await supabase
    .from('Workflow')
    .select('id, "spaceId", trigger, conditions, actions, autonomy, graph, enabled')
    .eq('id', id)
    .maybeSingle();

  if (dbErr) {
    logger.error('[webhook] db error', { id }, dbErr);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // Return 404 for missing OR disabled workflows so scanners can't enumerate.
  if (!row || !row.enabled) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Must be a webhook-triggered workflow.
  const trigger = row.trigger as { type: string };
  if (trigger.type !== 'webhook') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const workflow: WorkflowRow = {
    id: row.id,
    spaceId: row.spaceId,
    trigger: row.trigger as WorkflowRow['trigger'],
    conditions: row.conditions as WorkflowRow['conditions'],
    actions: row.actions as WorkflowRow['actions'],
    autonomy: row.autonomy as WorkflowRow['autonomy'],
    graph: (row.graph as WorkflowRow['graph']) ?? null,
  };

  const context = {
    event: { type: 'webhook', payload },
  };

  // Fire-and-forget: the webhook caller gets a fast 200 without waiting for the
  // full execution (which may call the AI agent). `after()` is the Next.js
  // mechanism for post-response work that doesn't extend the response time.
  after(async () => {
    try {
      await runWorkflow({ workflow, context, triggerEvent: { type: 'webhook', payload } });
    } catch (err) {
      logger.error('[webhook] run failed', { workflowId: id }, err);
    }
  });

  return NextResponse.json({ ok: true, workflowId: id }, { status: 200 });
}
