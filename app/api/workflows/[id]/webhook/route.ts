/**
 * POST /api/workflows/[id]/webhook — public webhook endpoint.
 *
 * Any external service can POST any JSON payload to this URL and the workflow
 * fires immediately. The workflow id is the secret — it's a UUID (128 bits of
 * randomness), giving the same security posture as Zapier webhook catch hooks.
 *
 * Optional HMAC-SHA256 signature validation: when the workflow's trigger config
 * includes a `webhookSecret`, every incoming request must carry an
 * `X-Webhook-Signature` header with value `sha256=<hex-digest>`. Requests
 * whose signature doesn't match are rejected 401. Mirrors GitHub/Zapier
 * webhook signing conventions exactly.
 *
 * The incoming JSON body becomes `event.payload` in the WorkflowContext so the
 * realtor's actions/instructions can reference it. No auth header is required
 * when no webhookSecret is set; the UUID alone is the credential.
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

import crypto from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import { logger } from '@/lib/logger';
import { runWorkflow, type WorkflowRow } from '@/lib/workflows/executor';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_BODY_BYTES = 256 * 1024; // 256 KB

/** Verify HMAC-SHA256 signature in constant time. Header format: `sha256=<hex>` */
function verifySignature(rawBody: string, secret: string, header: string | null): boolean {
  if (!header) return false;
  const prefix = 'sha256=';
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

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

  // Read raw body text — needed for HMAC validation before JSON parsing.
  let rawBody = '';
  let payload: unknown = {};
  try {
    rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }
    if (rawBody.trim()) {
      payload = JSON.parse(rawBody);
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
  const trigger = row.trigger as { type: string; config?: { webhookSecret?: string } };
  if (trigger.type !== 'webhook') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // HMAC signature validation — required when the workflow has a webhookSecret.
  const webhookSecret = trigger.config?.webhookSecret;
  if (webhookSecret) {
    const sigHeader = req.headers.get('x-webhook-signature');
    if (!verifySignature(rawBody, webhookSecret, sigHeader)) {
      logger.warn('[webhook] signature mismatch', { id });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  // Autonomy guard: an UNSIGNED webhook is triggerable by anyone who learns the
  // UUID, with a fully attacker-controlled payload. If such a workflow ran at
  // 'notify'/'auto' autonomy it would let a stranger fire real outbound sends,
  // webhook_post (SSRF surface), and inject the payload into the AI agent's
  // instructions. So when there's no secret we force 'draft' — every action is
  // staged for human review, nothing goes out on an unauthenticated trigger.
  // Signed webhooks keep their configured autonomy. (Save-time validation also
  // blocks creating a non-draft webhook workflow without a secret; this is the
  // runtime backstop for rows created before that rule.)
  const configuredAutonomy = row.autonomy as WorkflowRow['autonomy'];
  const effectiveAutonomy: WorkflowRow['autonomy'] =
    !webhookSecret && configuredAutonomy !== 'draft' ? 'draft' : configuredAutonomy;
  if (effectiveAutonomy !== configuredAutonomy) {
    logger.warn('[webhook] unsigned webhook forced to draft autonomy', {
      id,
      configuredAutonomy,
    });
  }

  const workflow: WorkflowRow = {
    id: row.id,
    spaceId: row.spaceId,
    trigger: row.trigger as WorkflowRow['trigger'],
    conditions: row.conditions as WorkflowRow['conditions'],
    actions: row.actions as WorkflowRow['actions'],
    autonomy: effectiveAutonomy,
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
