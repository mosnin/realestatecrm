/**
 * POST /api/internal/automations/create — Chippi builds a workflow silently.
 *
 * The Focus Update's "Chippi does, never links": when a realtor tells Chippi
 * "do that every time a Zillow lead comes in," the agent calls this instead of
 * sending them to the builder. Authed by AGENT_INTERNAL_SECRET (Modal/Python
 * runtime) — same contract as /api/internal/studio/*.
 *
 * The LLM emits the persistence-shaped WorkflowDefinition directly (not the
 * builder's form-state), then the definition goes through the exact same
 * gates as a human save: parseWorkflowDefinition, the integration-trigger
 * validity check, and the per-space cap. Autonomy is FORCED to 'draft' — a
 * silently-built automation must never silently send; the realtor promotes it
 * from the builder when they've seen it work.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { getLLMClient } from '@/lib/llm';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  parseWorkflowDefinition,
  WorkflowDefinitionError,
} from '@/lib/workflows/schema';
import {
  createWorkflow,
  countWorkflows,
  MAX_WORKFLOWS_PER_SPACE,
} from '@/lib/workflows/store';
import { validateIntegrationTrigger } from '@/lib/integrations/trigger-catalog';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_DESCRIPTION = 400;

// Definition-shaped prompt — a deliberate subset of the builder's vocabulary.
// The silent path skips power-user plumbing (webhooks, integrations,
// formatters, variables): anything that needs those deserves the builder UI
// with a human looking at it.
const SYSTEM_PROMPT = `You are a workflow automation builder for a real estate CRM. Given a plain-English description, return ONLY a JSON object:

{
  "name": "Short descriptive name (max 60 chars)",
  "description": "One sentence describing what this automates (max 120 chars)",
  "definition": {
    "trigger": { "type": "<type>", "config": { ... } },
    "conditions": { "op": "and", "rules": [] },
    "actions": [ { "type": "<type>", "config": { ... } } ],
    "autonomy": "draft"
  }
}

TRIGGERS (type → config):
- lead_created → {}
- lead_score_threshold → { "min": <number 1-100> }
- inbound_message → { "channel": "sms" | "email" | "any" }
- tour_completed → {}
- deal_stage_changed → { "toStage": "<stage name>" } (toStage optional)
- deal_created → {}
- contact_updated → {}
- schedule → { "cadence": "daily" | "weekdays" | "hourly", "hour": <0-23, optional> }

ACTIONS (1-5, in order; type → config):
- draft_message → { "channel": "sms" | "email", "instruction": "<what to say, written like a skilled realtor>" }
- schedule_message → { "channel": "sms" | "email", "instruction": "<what to say>", "delayMinutes": <number> }
- create_task → { "title": "<task title>", "dueInDays": <number, optional> }
- run_chippi → { "instruction": "<what the AI should do>" }
- delay → { "delayMinutes": <number> }
- filter → { "field": "<context path like lead.score>", "operator": "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"exists"|"not_exists", "value": <string or number, omit for exists/not_exists> }
- update_lead → { "field": "score_label"|"follow_up_in_days"|"tag_add"|"tag_remove", "value": "<value>" }
- notify_agent → { "title": "<max 60 chars>", "body": "<max 120 chars, optional>" }

Rules: autonomy is ALWAYS "draft". Config objects must contain ONLY the keys shown. Message instructions are conversational and real-estate focused.`;

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
    typeof body.description === 'string' ? body.description.trim().slice(0, MAX_DESCRIPTION) : '';
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

  // Same cap as the human path — Chippi doesn't get to exceed it.
  const count = await countWorkflows(spaceId);
  if (count >= MAX_WORKFLOWS_PER_SPACE) {
    return NextResponse.json(
      { error: `This workspace already has ${MAX_WORKFLOWS_PER_SPACE} workflows — remove one first.` },
      { status: 409 },
    );
  }

  let raw = '';
  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      // Same model as the human-path builder (/api/workflows/generate) so
      // silent and assisted builds produce the same quality of definition.
      model: 'qwen/qwen3.7-plus',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Build a workflow for: "${description}"` },
      ],
    });
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (err) {
    logger.error('[internal/automations] LLM error', { spaceId }, err);
    return NextResponse.json({ error: 'Generation failed — try again shortly.' }, { status: 502 });
  }

  let generated: { name?: unknown; description?: unknown; definition?: unknown };
  try {
    generated = JSON.parse(raw);
  } catch {
    logger.error('[internal/automations] LLM returned non-JSON', { spaceId });
    return NextResponse.json({ error: 'Generation failed — try rephrasing.' }, { status: 502 });
  }

  const name =
    typeof generated.name === 'string' && generated.name.trim()
      ? generated.name.trim().slice(0, 120)
      : 'New automation';
  const summary =
    typeof generated.description === 'string' ? generated.description.trim().slice(0, 200) : undefined;

  // The same gates a human save goes through — plus autonomy forced to draft
  // BEFORE validation, so even a disobedient generation can't slip 'auto' in.
  let definition;
  try {
    const rawDef =
      generated.definition && typeof generated.definition === 'object'
        ? { ...(generated.definition as Record<string, unknown>), autonomy: 'draft' }
        : generated.definition;
    definition = parseWorkflowDefinition(rawDef);
  } catch (err) {
    if (err instanceof WorkflowDefinitionError) {
      logger.warn('[internal/automations] invalid generated definition', {
        spaceId,
        issues: err.issues,
      });
      return NextResponse.json(
        { error: 'Chippi could not build a valid automation from that — try describing it differently.' },
        { status: 422 },
      );
    }
    throw err;
  }

  const triggerErr = validateIntegrationTrigger(definition);
  if (triggerErr) {
    return NextResponse.json({ error: triggerErr }, { status: 422 });
  }

  const workflow = await createWorkflow(spaceId, {
    name,
    description: summary,
    definition,
    enabled: true,
    notifyOnError: true,
  });

  return NextResponse.json(
    {
      ok: true,
      workflow: {
        id: workflow.id,
        name: workflow.name,
        description: summary ?? null,
        trigger: definition.trigger.type,
        actionCount: definition.actions.length,
        autonomy: 'draft',
        enabled: true,
      },
    },
    { status: 201 },
  );
}
