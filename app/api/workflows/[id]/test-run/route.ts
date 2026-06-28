/**
 * POST /api/workflows/[id]/test-run — fire one workflow against a synthetic
 * context and return the run + its steps, so a realtor can PROVE the workflow
 * works (e.g. watch the draft get created) before wiring a live trigger.
 *
 * The route builds a representative WorkflowContext for the workflow's trigger
 * type (or accepts an optional { sampleContext } override in the body), runs the
 * executor, then reads back the WorkflowRunStep rows for that run so the caller
 * sees what each action did.
 *
 * SAFETY — a test-run is ALWAYS drafts-only regardless of the stored autonomy.
 * call_integration is the one action that can mutate the outside world, and the
 * action engine gates it behind autonomy === 'auto'. So we override the
 * workflow's autonomy to 'draft' for the duration of the test: a test-run can
 * never trigger a real send/integration call, even on an 'auto' workflow.
 *
 * runtime/maxDuration mirror /api/ai/task — the test executes the headless agent
 * (draft_message / run_chippi), which needs the long function budget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { runWorkflow, type WorkflowRow } from '@/lib/workflows/executor';
import { getWorkflow } from '@/lib/workflows/store';
import type { WorkflowContext } from '@/lib/workflows/actions';
import type { WorkflowTrigger } from '@/lib/workflows/schema';

export const runtime = 'nodejs';
// The test executes the headless agent for draft_message / run_chippi actions,
// which blocks until the run finishes (~120s+). Raise the budget — mirrors
// /api/ai/task and /api/routines/[id].
export const maxDuration = 300;

/**
 * A representative synthetic context per trigger type, so a test-run has
 * something realistic for the conditions to evaluate and the actions to address.
 * The shape matches lib/workflows/actions.ts WorkflowContext (event + entity
 * rows). All synthetic entities use the 'sample' id sentinel.
 */
function sampleContextFor(trigger: WorkflowTrigger): WorkflowContext {
  const sampleLead = {
    id: 'sample',
    name: 'Sample Lead',
    score: 85,
    source: 'zillow',
  };
  const sampleContact = { id: 'sample', name: 'Sample Lead' };

  switch (trigger.type) {
    case 'lead_created':
    case 'lead_score_threshold':
      return {
        event: { type: trigger.type },
        lead: sampleLead,
        contact: sampleContact,
      };
    case 'inbound_message':
      return {
        event: {
          type: 'inbound_message',
          channel: 'sms',
          body: 'Hi, is the listing on Maple St still available?',
        },
        contact: sampleContact,
        lead: sampleLead,
      };
    case 'tour_completed':
      return {
        event: { type: 'tour_completed' },
        contact: sampleContact,
        lead: sampleLead,
        deal: { id: 'sample', stage: 'touring' },
      };
    case 'deal_stage_changed':
      return {
        event: { type: 'deal_stage_changed', toStage: 'offer' },
        contact: sampleContact,
        deal: { id: 'sample', stage: 'offer' },
      };
    case 'integration_event':
      // Mirror a real Composio delivery: the engine narrows on
      // event.toolkit + event.event (the slug), so the synthetic context must
      // carry the workflow's OWN configured toolkit/event — not a placeholder
      // `name`, which no condition or matcher ever reads.
      return {
        event: {
          type: 'integration_event',
          toolkit: trigger.config.toolkit,
          event: trigger.config.event,
        },
        contact: sampleContact,
      };
    case 'schedule':
      return { event: { type: 'schedule' } };
    case 'webhook':
      return { event: { type: 'webhook', payload: { sample: true } } };
    default: {
      // Exhaustiveness guard — an unknown trigger still gets a minimal context.
      const _never: never = trigger;
      return { event: { type: String((_never as { type: string }).type) } };
    }
  }
}

/**
 * Scrub an untrusted sampleContext override against the synthetic context. Only
 * a plain object override is accepted (anything else falls back to the synthetic
 * context). The caller's values are layered ON TOP of the synthetic context, but
 * the entity ids (contact/lead/deal `.id`) are ALWAYS forced back to the
 * synthetic 'sample' ids — a caller can shape the run's data but can never point
 * it at an id it doesn't own.
 */
export function scrubSampleContext(override: unknown, synthetic: WorkflowContext): WorkflowContext {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return synthetic;
  }
  const merged: WorkflowContext = { ...synthetic, ...(override as Record<string, unknown>) };

  // Re-pin entity ids to the synthetic sample id (or drop the id if the synthetic
  // context had no such entity), so a caller-supplied id never reaches a write.
  for (const key of ['contact', 'lead', 'deal'] as const) {
    const overrideEntity = (override as Record<string, unknown>)[key];
    if (overrideEntity && typeof overrideEntity === 'object' && !Array.isArray(overrideEntity)) {
      const syntheticEntity = synthetic[key] as Record<string, unknown> | undefined;
      merged[key] = { ...(overrideEntity as Record<string, unknown>), id: syntheticEntity?.id };
    }
  }
  return merged;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let stored;
  try {
    stored = await getWorkflow(space.id, id);
  } catch (error) {
    logger.error('[workflows] test-run load failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Load failed' }, { status: 500 });
  }
  if (!stored) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // The caller may hand a full context to exercise specific condition branches;
  // otherwise we synthesise one from the trigger type. SECURITY: a sampleContext
  // override is untrusted request JSON, so we scrub it — the caller may override
  // non-id fields, but the entity ids ALWAYS come from the synthetic 'sample'
  // context, never from the request. This prevents a caller from pointing a run
  // at a contact/lead/deal id they don't own (defense-in-depth: the run is also
  // forced to autonomy='draft' below).
  const synthetic = sampleContextFor(stored.trigger);
  const context = scrubSampleContext(body.sampleContext, synthetic);

  // SAFETY: force drafts-only for the test regardless of the stored autonomy, so
  // a test-run never fires a real call_integration send (the action engine only
  // executes call_integration under autonomy === 'auto'). See the file header.
  const workflow: WorkflowRow = {
    id: stored.id,
    spaceId: stored.spaceId,
    trigger: stored.trigger,
    conditions: stored.conditions,
    actions: stored.actions,
    autonomy: 'draft',
    // Forward the branching graph so an ADVANCED workflow's test-run actually
    // walks its conditions/actions (without it, runWorkflow fell through to the
    // empty linear path and "proved" nothing). autonomy:'draft' above still
    // reaches each graph action, so the test stays drafts-only — no real send.
    graph: stored.graph ?? null,
  };

  let result;
  try {
    result = await runWorkflow({
      workflow,
      context,
      triggerEvent: { test: true },
    });
  } catch (error) {
    // runWorkflow never throws by contract, but guard anyway so the route
    // surfaces a clean 500 rather than an unhandled rejection.
    logger.error('[workflows] test-run failed', { spaceId: space.id, id }, error);
    return NextResponse.json({ error: 'Test run failed' }, { status: 500 });
  }

  // Read back the run's steps so the caller sees what each action did — the
  // "prove it works" surface (the draft created, the task set, etc.).
  const { data: steps, error: stepsErr } = await supabase
    .from('WorkflowRunStep')
    .select('stepIndex, kind, actionType, status, detail')
    .eq('runId', result.runId)
    .order('stepIndex', { ascending: true });
  if (stepsErr) {
    logger.warn('[workflows] test-run step read failed', { runId: result.runId }, stepsErr);
  }

  return NextResponse.json({
    runId: result.runId,
    status: result.status,
    steps: steps ?? [],
  });
}
