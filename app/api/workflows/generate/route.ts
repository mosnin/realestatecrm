/**
 * POST /api/workflows/generate — AI-powered workflow generation.
 *
 * Takes a plain-English description of what the user wants to automate and
 * returns a WorkflowFormState-compatible JSON the builder can use to pre-fill
 * the composer. Mirrors what Zapier's AI Zap builder does: type a sentence,
 * get a ready-to-edit workflow.
 *
 * The LLM returns a minimal form-state schema (no React-specific id fields or
 * numeric-string coercions — those are added client-side). The client maps the
 * response into a WorkflowFormState and opens the builder pre-filled.
 *
 * Safety: authenticated, rate-limited by OpenRouter (no extra guard needed here
 * beyond requireAuth), and capped at 200 chars prompt to prevent abuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { logger } from '@/lib/logger';
import { getLLMClient } from '@/lib/llm';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_PROMPT = 400;

const SYSTEM_PROMPT = `You are a workflow automation assistant for a real estate CRM. Given a plain-English description, generate a workflow automation in JSON format.

AVAILABLE TRIGGERS (pick one):
- lead_created — a new lead is created
- lead_score_threshold — a lead's score crosses a minimum (config: { min: number 1-100 })
- inbound_message — an inbound SMS or email arrives (config: { channel: "sms"|"email"|"any" })
- tour_completed — a property tour is completed
- deal_stage_changed — a deal changes pipeline stage (config: { toStage?: string })
- schedule — runs on a schedule (config: { cadence: "daily"|"weekdays"|"hourly", hour?: 0-23 })
- webhook — external HTTP POST triggers this
- integration_event — a connected app fires an event

AVAILABLE ACTIONS (ordered list, 1-5 actions):
- draft_message: draft a personalized message (config: { channel: "sms"|"email", instruction: string })
- schedule_message: schedule a message to send later (config: { channel: "sms"|"email", instruction: string, delayMinutes: number })
- create_task: create a follow-up task (config: { title: string, dueInDays?: number })
- run_chippi: run an AI agent with instructions (config: { instruction: string })
- delay: wait before the next step (config: { delayMinutes: number })
- filter: stop workflow if condition not met (config: { field: string, operator: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"exists"|"not_exists", value?: string|number })
- formatter: transform a value — text/number/date (config: { input: string (field path like "lead.name" or literal), operation: "uppercase"|"lowercase"|"capitalize"|"trim"|"replace"|"number_format"|"date_format"|"extract_number"|"extract_email"|"extract_phone", find?: string, replacement?: string, format?: "MM/DD/YYYY"|"YYYY-MM-DD"|"Month D, YYYY"|"relative", toFixed?: number })
- call_integration: call a connected app (config: { toolkit: string, action: string })
- webhook_post: HTTP POST to an external HTTPS URL (config: { url: string (must start with https://), bodyJson?: string (JSON template with {{lead.*}} tokens), headersJson?: string (JSON object of extra headers) })
- update_lead: write a field back to this lead's CRM record (config: { field: "score_label"|"follow_up_in_days"|"tag_add"|"tag_remove", value: string ("hot"/"warm"/"cold" for score_label, integer days for follow_up_in_days, tag string for tag_add/tag_remove) })
- notify_agent: send a push notification to the realtor's phone/browser (config: { title: string (max 60 chars, {{tokens}} ok), body?: string (optional, max 120 chars, {{tokens}} ok) })

AUTONOMY (how much AI acts without human review):
- draft: always draft for human approval (safest)
- notify: auto-send but notify the agent
- auto: fully autonomous (use only if asked for full automation)

Return ONLY a JSON object with these exact fields:
{
  "name": "Short descriptive name (max 60 chars)",
  "description": "One sentence describing what this automates (max 120 chars)",
  "trigger": {
    "type": "<trigger_type>",
    "min": "<number as string, only for lead_score_threshold>",
    "channel": "<sms|email|any, only for inbound_message>",
    "toStage": "<stage name, only for deal_stage_changed>",
    "cadence": "<daily|weekdays|hourly, only for schedule>",
    "hour": "<0-23 as string, only for schedule with specific hour>"
  },
  "conditionOp": "and",
  "conditions": [],
  "actions": [
    {
      "type": "<action_type>",
      "channel": "<sms|email, for message actions>",
      "instruction": "<AI instruction text, for draft_message/schedule_message/run_chippi>",
      "delayMinutes": "<number as string, for schedule_message/delay>",
      "title": "<task title, for create_task>",
      "dueInDays": "<number as string, for create_task>",
      "toolkit": "<app name, for call_integration>",
      "action": "<action slug, for call_integration>",
      "input": "<field path or literal, for formatter>",
      "operation": "<formatter operation, for formatter>",
      "format": "<date format string, for formatter date_format>",
      "webhookUrl": "<https:// URL, for webhook_post>",
      "webhookBody": "<JSON body template string, for webhook_post>",
      "webhookHeaders": "<JSON headers object string, for webhook_post>",
      "updateField": "<score_label|follow_up_in_days|tag_add|tag_remove, for update_lead>",
      "updateValue": "<value to set, for update_lead>",
      "notifyTitle": "<notification title (max 60 chars), for notify_agent>",
      "notifyBody": "<notification body (optional, max 120 chars), for notify_agent>"
    }
  ],
  "autonomy": "draft"
}

Keep instructions conversational and real-estate focused. Draft messages as if written by a skilled realtor. For run_chippi instructions, describe what the AI should do.`;

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (!prompt) {
    return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json(
      { error: `Prompt must be ${MAX_PROMPT} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    const llm = getLLMClient();
    const completion = await llm.chat.completions.create({
      model: 'qwen/qwen3.7-plus',
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Generate a workflow for: "${prompt}"`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.error('[workflows/generate] LLM returned non-JSON', { raw });
      return NextResponse.json({ error: 'AI generation failed — try rephrasing.' }, { status: 500 });
    }

    return NextResponse.json({ workflow: parsed });
  } catch (err) {
    logger.error('[workflows/generate] LLM error', { spaceId: space.id }, err);
    return NextResponse.json(
      { error: 'AI generation failed — try again in a moment.' },
      { status: 500 },
    );
  }
}
