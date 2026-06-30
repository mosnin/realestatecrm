/**
 * POST /api/workflows/[id]/test-step — test a single action step in isolation.
 *
 * Zapier-style "Test this step": after configuring one action in the builder the
 * realtor can fire just that step against synthetic context to see what it does
 * before saving the whole workflow. The result shows up inline in the step card.
 *
 * Body: { action: WorkflowAction }
 * Response: { status: 'ok'|'failed'|'skipped', detail: unknown, durationMs: number }
 *
 * SAFETY: always draft-mode. No real sends, no real integrations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { executeAction, type WorkflowContext } from '@/lib/workflows/actions';
import { getWorkflow } from '@/lib/workflows/store';
import { workflowActionSchema } from '@/lib/workflows/schema';
import type { WorkflowTrigger } from '@/lib/workflows/schema';

export const runtime = 'nodejs';
export const maxDuration = 120;

function sampleContextFor(trigger: WorkflowTrigger): WorkflowContext {
  const sampleLead = { id: 'sample', name: 'Sample Lead', score: 85, source: 'zillow' };
  const sampleContact = { id: 'sample', name: 'Sample Lead' };
  switch (trigger.type) {
    case 'lead_created':
    case 'lead_score_threshold':
    case 'contact_updated':
      return { event: { type: trigger.type }, lead: sampleLead, contact: sampleContact };
    case 'inbound_message':
      return {
        event: { type: 'inbound_message', channel: 'sms', body: 'Hi, is the listing still available?' },
        contact: sampleContact, lead: sampleLead,
      };
    case 'tour_completed':
      return {
        event: { type: 'tour_completed' },
        contact: sampleContact, lead: sampleLead,
        deal: { id: 'sample', stage: 'touring' },
      };
    case 'deal_stage_changed':
      return {
        event: { type: 'deal_stage_changed', toStage: 'offer' },
        contact: sampleContact, deal: { id: 'sample', stage: 'offer' },
      };
    case 'integration_event':
      return {
        event: { type: 'integration_event', toolkit: trigger.config.toolkit, event: trigger.config.event },
        contact: sampleContact,
      };
    case 'deal_created':
      return {
        event: { type: 'deal_created' },
        deal: { id: 'sample', stage: 'prospect', amount: 650000 },
        lead: sampleLead, contact: sampleContact,
      };
    case 'schedule':
      return { event: { type: 'schedule' } };
    case 'webhook':
      return { event: { type: 'webhook', payload: { sample: true } } };
    default: {
      const _never: never = trigger;
      return { event: { type: String((_never as { type: string }).type) } };
    }
  }
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

  const stored = await getWorkflow(space.id, id).catch(() => null);
  if (!stored) return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const actionRaw = body.action;
  if (!actionRaw || typeof actionRaw !== 'object') {
    return NextResponse.json({ error: 'action is required.' }, { status: 400 });
  }

  const parseResult = workflowActionSchema.safeParse(actionRaw);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Step configuration is incomplete — fill in all required fields first.' },
      { status: 422 },
    );
  }

  const action = parseResult.data;

  // run_workflow would synchronously execute the target workflow for real
  // (sending messages, creating tasks, etc.). A "test this step" must never
  // have those side effects, so we short-circuit with a descriptive result
  // instead of dispatching it.
  if (action.type === 'run_workflow') {
    return NextResponse.json({
      status: 'ok',
      detail: {
        skipped: true,
        reason: 'Sub-workflow steps are not executed during a single-step test to avoid real side effects.',
        workflowId: action.config.workflowId,
      },
      durationMs: 0,
    });
  }

  const context = sampleContextFor(stored.trigger);

  const start = Date.now();
  try {
    const result = await executeAction(action, context, { spaceId: space.id, autonomy: 'draft', runId: 'test' });
    return NextResponse.json({ status: result.status, detail: result.detail ?? null, durationMs: Date.now() - start });
  } catch (err) {
    logger.error('[workflows/test-step] executeAction threw', { spaceId: space.id, id }, err);
    return NextResponse.json({ error: 'Step execution failed.' }, { status: 500 });
  }
}
