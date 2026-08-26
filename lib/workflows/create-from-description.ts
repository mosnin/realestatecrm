/** Build and persist a real enabled workflow from a plain-English request. */

import {
  getLLMClient,
  resolveChatModel,
  usageAccountingParams,
} from '@/lib/llm';
import {
  parseWorkflowDefinition,
  WorkflowDefinitionError,
  type WorkflowDefinition,
} from '@/lib/workflows/schema';
import {
  createWorkflow,
  countWorkflows,
  MAX_WORKFLOWS_PER_SPACE,
  type WorkflowRecord,
} from '@/lib/workflows/store';
import { validateIntegrationTrigger } from '@/lib/integrations/trigger-catalog';

export const MAX_AUTOMATION_DESCRIPTION = 400;

export type WorkflowCreationErrorCode = 'limit' | 'generation' | 'invalid';

export class WorkflowCreationError extends Error {
  override readonly name = 'WorkflowCreationError';
  readonly code: WorkflowCreationErrorCode;

  constructor(code: WorkflowCreationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface CreatedWorkflowFromDescription {
  workflow: WorkflowRecord;
  definition: WorkflowDefinition;
}

export const WORKFLOW_CREATION_SYSTEM_PROMPT = `You are a workflow automation builder for a real estate CRM. Given a plain-English description, return ONLY a JSON object:

{
  "name": "Short descriptive name (max 60 chars)",
  "description": "One sentence describing what this automates (max 120 chars)",
  "definition": {
    "trigger": { "type": "<type>", "config": { ... } },
    "conditions": { "op": "and", "rules": [] },
    "actions": [ { "type": "<type>", "config": { ... } } ],
    "autonomy": "auto"
  }
}

TRIGGERS (type to config):
- lead_created to {}
- lead_score_threshold to { "min": <number 1-100> }
- inbound_message to { "channel": "sms" | "email" | "any" }
- tour_completed to {}
- deal_stage_changed to { "toStage": "<stage name>" } (toStage optional)
- deal_created to {}
- contact_updated to {}
- schedule to { "cadence": "daily" | "weekdays" | "hourly", "hour": <0-23, optional> }

ACTIONS (1-5, in order; type to config):
- schedule_message to { "channel": "sms" | "email", "instruction": "<what to say>", "delayMinutes": <number, use 0 for immediate> }
- draft_message to { "channel": "sms" | "email", "instruction": "<what to draft>" }
- create_task to { "title": "<task title>", "dueInDays": <number, optional> }
- run_chippi to { "instruction": "<what the AI should do>" }
- filter to { "field": "<context path like lead.score>", "operator": "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"exists"|"not_exists", "value": <string or number, omit for exists/not_exists> }
- update_lead to { "field": "score_label"|"follow_up_in_days"|"tag_add"|"tag_remove", "value": "<value>" }
- notify_agent to { "title": "<max 60 chars>", "body": "<max 120 chars, optional>" }

Rules:
- The saved workflow autonomy is ALWAYS "auto" so executable actions actually run.
- When the description says send, email, text, SMS, message, reply, follow up, nurture, or otherwise communicate automatically, use schedule_message. Use delayMinutes 0 when it says immediately or gives no delay. NEVER substitute draft_message for an explicit send. NEVER emit a "delay" action — those halt and do not wait. Put the wait on schedule_message.delayMinutes (2 days = 2880, 1 hour = 60).
- Use draft_message ONLY when the description explicitly asks to draft, compose, or prepare a message without sending it.
- Config objects contain ONLY the keys shown. Message instructions are conversational and real-estate focused. Never invent an unsupported trigger or action.`;

const EXPLICIT_DRAFT =
  /\b(draft|compose|prepare|write(?:\s+me)?)\b[\s\S]{0,80}\b(email|text|sms|message|reply)\b/i;
const EXPLICIT_SEND =
  /\b(send|email(?:s|ed|ing)?|text(?:s|ed|ing)?|sms|reply|forward)\b|\bmessage(?:s|d|ing)?\s+(?:a|the|this|that|my|our|all|every|each|new|lead|client|contact|buyer|seller|prospect|them|him|her)\b|\b(?:autonomous(?:ly)?|automatic(?:ally)?)\s+follow[\s-]?ups?\b|\bfollow[\s-]?up\s+(?:with|after|automatically|autonomously)\b|\b(?:automatically|autonomously)\b[\s\S]{0,40}\bfollow[\s-]?up\b/i;

/** Exported for tests. "in 2 days" → 2880. Immediate words win. */
export function requestedDelayMinutes(description: string): number {
  if (/\b(immediately|right\s+away|at\s+once|instantly)\b/i.test(description)) return 0;
  const match = description.match(
    /\b(?:within|after|in)\s+(\d{1,5})\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/i,
  );
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('week')) return amount * 10_080;
  if (unit.startsWith('day')) return amount * 1_440;
  if (unit.startsWith('hour') || unit.startsWith('hr')) return amount * 60;
  return amount;
}

function foldHaltedDelayActions(
  actions: unknown[],
  fallbackDelay: number,
  convertDraftToSend: boolean,
): unknown[] {
  const out: unknown[] = [];
  let pendingDelay: number | null = null;
  for (const candidate of actions) {
    if (!candidate || typeof candidate !== 'object') {
      out.push(candidate);
      continue;
    }
    const action = candidate as Record<string, unknown>;
    if (action.type === 'delay') {
      const config =
        action.config && typeof action.config === 'object'
          ? (action.config as Record<string, unknown>)
          : {};
      const n = Number(config.delayMinutes);
      pendingDelay = Number.isFinite(n) && n > 0 ? n : fallbackDelay || null;
      continue;
    }
    if (
      pendingDelay != null &&
      (action.type === 'schedule_message' || (convertDraftToSend && action.type === 'draft_message'))
    ) {
      const config =
        action.config && typeof action.config === 'object'
          ? (action.config as Record<string, unknown>)
          : {};
      out.push({
        ...action,
        type: 'schedule_message',
        config: {
          channel: config.channel,
          instruction: config.instruction,
          delayMinutes: pendingDelay,
        },
      });
      pendingDelay = null;
      continue;
    }
    out.push(action);
  }
  return out;
}

/**
 * Enforce the requested send semantics after generation. Prompt instructions
 * improve the candidate, but this normalization is the actual policy boundary:
 * an explicit send cannot silently degrade into a draft action.
 */
function forceExecutionSemantics(
  description: string,
  definition: unknown,
): unknown {
  if (!definition || typeof definition !== 'object') return definition;
  const raw = definition as Record<string, unknown>;
  const explicitDraft = EXPLICIT_DRAFT.test(description);
  const explicitSend = !explicitDraft && EXPLICIT_SEND.test(description);
  const parsedDelay = requestedDelayMinutes(description);
  const mapped = Array.isArray(raw.actions)
    ? raw.actions.map((candidate) => {
        if (!candidate || typeof candidate !== 'object') return candidate;
        const action = candidate as Record<string, unknown>;
        if (explicitSend && action.type === 'draft_message') {
          const config =
            action.config && typeof action.config === 'object'
              ? (action.config as Record<string, unknown>)
              : {};
          return {
            ...action,
            type: 'schedule_message',
            config: {
              channel: config.channel,
              instruction: config.instruction,
              delayMinutes: parsedDelay,
            },
          };
        }
        if (action.type === 'schedule_message' && parsedDelay > 0) {
          const config =
            action.config && typeof action.config === 'object'
              ? (action.config as Record<string, unknown>)
              : {};
          const existing = Number(config.delayMinutes);
          if (!Number.isFinite(existing) || existing <= 0) {
            return {
              ...action,
              config: { ...config, delayMinutes: parsedDelay },
            };
          }
        }
        return action;
      })
    : raw.actions;
  const actions = Array.isArray(mapped)
    ? foldHaltedDelayActions(mapped, parsedDelay, explicitSend)
    : mapped;
  return { ...raw, actions, autonomy: 'auto' };
}

export async function createWorkflowFromDescription(input: {
  spaceId: string;
  description: string;
  signal?: AbortSignal;
}): Promise<CreatedWorkflowFromDescription> {
  const description = input.description.trim();
  if (!description) {
    throw new WorkflowCreationError('invalid', 'Describe what the automation should do.');
  }
  if (description.length > MAX_AUTOMATION_DESCRIPTION) {
    throw new WorkflowCreationError(
      'invalid',
      `Automation descriptions must be ${MAX_AUTOMATION_DESCRIPTION} characters or fewer.`,
    );
  }

  const count = await countWorkflows(input.spaceId);
  if (count >= MAX_WORKFLOWS_PER_SPACE) {
    throw new WorkflowCreationError(
      'limit',
      `This workspace already has ${MAX_WORKFLOWS_PER_SPACE} workflows. Remove one first.`,
    );
  }

  let raw = '';
  try {
    const completion = await getLLMClient().chat.completions.create(
      {
        model: resolveChatModel(),
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 1000,
        ...(usageAccountingParams() as Record<string, never>),
        messages: [
          { role: 'system', content: WORKFLOW_CREATION_SYSTEM_PROMPT },
          { role: 'user', content: `Build and enable this workflow: "${description}"` },
        ],
      },
      { signal: input.signal },
    );
    raw = completion.choices[0]?.message?.content ?? '';
  } catch (error) {
    throw new WorkflowCreationError(
      'generation',
      `Automation generation failed: ${error instanceof Error ? error.message : 'provider error'}`,
    );
  }

  let generated: { name?: unknown; description?: unknown; definition?: unknown };
  try {
    generated = JSON.parse(raw) as typeof generated;
  } catch {
    throw new WorkflowCreationError('generation', 'Automation generation returned invalid JSON.');
  }

  const name =
    typeof generated.name === 'string' && generated.name.trim()
      ? generated.name.trim().slice(0, 120)
      : 'New automation';
  const summary =
    typeof generated.description === 'string'
      ? generated.description.trim().slice(0, 200)
      : undefined;

  let definition: WorkflowDefinition;
  try {
    definition = parseWorkflowDefinition(
      forceExecutionSemantics(description, generated.definition),
    );
  } catch (error) {
    if (error instanceof WorkflowDefinitionError) {
      throw new WorkflowCreationError(
        'invalid',
        'Chippi could not build a valid automation from that description. Try describing the trigger and action more specifically.',
      );
    }
    throw error;
  }

  if (definition.actions.length === 0) {
    throw new WorkflowCreationError(
      'invalid',
      'The generated automation had no executable actions. Describe what it should do after the trigger.',
    );
  }
  const explicitDraft = EXPLICIT_DRAFT.test(description);
  const explicitSend = !explicitDraft && EXPLICIT_SEND.test(description);
  if (
    explicitSend &&
    !definition.actions.some((action) => action.type === 'schedule_message')
  ) {
    throw new WorkflowCreationError(
      'invalid',
      'The generated automation did not contain the requested send action. Rephrase the recipient, channel, and timing.',
    );
  }

  const triggerError = validateIntegrationTrigger(definition);
  if (triggerError) throw new WorkflowCreationError('invalid', triggerError);

  const workflow = await createWorkflow(input.spaceId, {
    name,
    description: summary,
    definition,
    enabled: true,
    notifyOnError: true,
  });

  return { workflow, definition };
}
