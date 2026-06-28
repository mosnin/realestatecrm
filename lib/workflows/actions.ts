/**
 * Workflow ACTION ENGINE — the runtime that turns one validated WorkflowAction
 * (the THEN of a workflow) into a recorded effect.
 *
 * This is the per-action half of the executor pass. `executeAction` takes a
 * single action plus the trigger context and produces an `ActionStepResult` the
 * executor persists as one WorkflowRunStep. It NEVER throws — every failure is
 * caught and returned as `{ status: 'failed', detail: { error } }` so one bad
 * action can't take down the run.
 *
 * SAFETY — drafts-only posture. This is unattended background work; there is no
 * human to tap "Send". So everything here either DRAFTS (draft_message,
 * run_chippi route through runAutonomousInstruction, whose draft tools only ever
 * write AgentDraft rows) or writes an INTERNAL row (create_task) or records an
 * INTENT (schedule_message). The lone exception that can mutate the outside
 * world is `call_integration`, and it is GATED behind `autonomy === 'auto'`:
 * under 'draft'/'notify' it is skipped, never executed.
 */

import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { runAutonomousInstruction, buildHeadlessToolContext } from '@/lib/agent/run-instruction';
import { executeToolForEntity } from '@/lib/integrations/composio';
import type { WorkflowAction, WorkflowAutonomy } from './schema';

/**
 * The trigger context an action runs against — the same object shape passed to
 * `evaluateConditions`. The trigger event plus whatever entity rows the
 * trigger-wiring pass resolved. All fields are optional; an action reads
 * defensively (a draft_message with no contact still drafts, addressed by id).
 */
export interface WorkflowContext {
  event?: Record<string, unknown>;
  lead?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  deal?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * The outcome of one action, persisted verbatim into a WorkflowRunStep.
 *   - ok      — the effect ran (or was recorded) successfully.
 *   - failed  — the effect was attempted and errored.
 *   - skipped — the effect was deliberately NOT run (e.g. autonomy gate).
 * `detail` is a free-form record surfaced in the run ledger / UI.
 */
export interface ActionStepResult {
  status: 'ok' | 'failed' | 'skipped';
  detail: Record<string, unknown>;
}

/** Per-action options threaded from the executor. */
export interface ExecuteActionOptions {
  spaceId: string;
  autonomy: WorkflowAutonomy;
  /** The WorkflowRun id, threaded for audit correlation on scheduled rows. */
  runId?: string;
}

/**
 * Best-effort display name for the contact/lead an action addresses, for
 * building the model instruction. Prefers a human name, falls back to an id, so
 * the agent always has SOMETHING to resolve the recipient from.
 */
function describeRecipient(context: WorkflowContext): string {
  const entity = context.contact ?? context.lead ?? context.deal;
  if (entity && typeof entity === 'object') {
    const name = (entity as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
    const id = (entity as Record<string, unknown>).id;
    if (typeof id === 'string' && id.trim()) return `contact ${id.trim()}`;
  }
  return 'the relevant contact';
}

/** The Contact.id an internal action (create_task) should attach to, if any. */
function resolveContactId(context: WorkflowContext): string | null {
  for (const entity of [context.contact, context.lead]) {
    if (entity && typeof entity === 'object') {
      const id = (entity as Record<string, unknown>).id;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  return null;
}

/**
 * draft_message — hand the channel + instruction to the headless agent, which
 * drafts (never sends). ALWAYS allowed regardless of autonomy: a draft leaves
 * nothing unattended. status ok iff the run reports ok.
 */
async function runDraftMessage(
  action: Extract<WorkflowAction, { type: 'draft_message' }>,
  context: WorkflowContext,
  spaceId: string,
): Promise<ActionStepResult> {
  const { channel, instruction } = action.config;
  const recipient = describeRecipient(context);
  const composed = `Draft a ${channel} to ${recipient}: ${instruction}`;
  const result = await runAutonomousInstruction({ spaceId, instruction: composed });
  return {
    status: result.ok ? 'ok' : 'failed',
    detail: {
      channel,
      recipient,
      ran: result.ran,
      summary: result.summary,
      ...(result.error ? { error: result.error } : {}),
    },
  };
}

/**
 * run_chippi — run the instruction through the headless agent verbatim. Same
 * drafts-only guarantee as draft_message; always allowed.
 */
async function runChippi(
  action: Extract<WorkflowAction, { type: 'run_chippi' }>,
  spaceId: string,
): Promise<ActionStepResult> {
  const result = await runAutonomousInstruction({
    spaceId,
    instruction: action.config.instruction,
  });
  return {
    status: result.ok ? 'ok' : 'failed',
    detail: {
      ran: result.ran,
      summary: result.summary,
      ...(result.error ? { error: result.error } : {}),
    },
  };
}

/**
 * create_task — record an internal follow-up on the relevant contact. There is
 * no standalone "Task" table in this CRM: a task IS a follow-up date on a
 * Contact (Contact.followUpAt) plus a ContactActivity row of type 'follow_up'
 * (the same shape the set_followup tool writes). We set followUpAt from
 * `dueInDays` (default today) and log the title as the activity line. Internal
 * only — never a send, so always allowed.
 *
 * When the context carries no resolvable Contact.id we can't attach the task;
 * we return 'skipped' with a reason rather than inventing a row.
 */
async function runCreateTask(
  action: Extract<WorkflowAction, { type: 'create_task' }>,
  context: WorkflowContext,
  spaceId: string,
): Promise<ActionStepResult> {
  const contactId = resolveContactId(context);
  if (!contactId) {
    return {
      status: 'skipped',
      detail: { reason: 'create_task: no contact resolved in context', title: action.config.title },
    };
  }

  // Compute the follow-up date: midnight UTC, `dueInDays` days out (default 0).
  const due = new Date();
  due.setUTCHours(0, 0, 0, 0);
  due.setUTCDate(due.getUTCDate() + (action.config.dueInDays ?? 0));
  const followUpAt = due.toISOString();

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from('Contact')
    .update({ followUpAt, updatedAt: nowIso })
    .eq('id', contactId)
    .eq('spaceId', spaceId);
  if (updateErr) {
    return { status: 'failed', detail: { error: updateErr.message, contactId } };
  }

  // The activity line mirrors set_followup's write so the task shows up in the
  // contact's timeline. Best-effort: the followUpAt above is the real task.
  const { error: activityErr } = await supabase.from('ContactActivity').insert({
    id: crypto.randomUUID(),
    contactId,
    spaceId,
    type: 'follow_up',
    content: action.config.title,
    metadata: { followUpAt, via: 'workflow' },
  });
  if (activityErr) {
    logger.warn('[workflows.actions] create_task activity insert failed', { contactId }, activityErr);
  }

  return { status: 'ok', detail: { contactId, followUpAt, title: action.config.title } };
}

/**
 * schedule_message — persist a deferred outbound INTENT into "ScheduledMessage".
 * Still no send at action time: we only write the row with a future `sendAt`
 * (now + delayMinutes) and the workflow's autonomy. The scheduled-message cron
 * (lib/workflows/scheduled-dispatch.ts) consumes due rows later and enforces the
 * autonomy posture there — draft/notify never send; only 'auto' may send.
 *
 * The recipient is the contact (preferred) or lead id from context, captured as
 * a plain text pointer the dispatcher resolves at send time. A row with no
 * recipient is still scheduled — the dispatcher will draft/skip rather than
 * mis-send.
 */
async function runScheduleMessage(
  action: Extract<WorkflowAction, { type: 'schedule_message' }>,
  context: WorkflowContext,
  opts: ExecuteActionOptions,
): Promise<ActionStepResult> {
  const { channel, instruction, delayMinutes } = action.config;
  const sendAt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const recipientContactId = resolveContactId(context);
  const scheduledMessageId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('ScheduledMessage').insert({
    id: scheduledMessageId,
    spaceId: opts.spaceId,
    workflowId: null,
    runId: opts.runId ?? null,
    channel,
    recipientContactId,
    instruction,
    sendAt,
    autonomy: opts.autonomy,
    status: 'pending',
    detail: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  if (error) {
    return { status: 'failed', detail: { error: error.message, channel, sendAt } };
  }

  return {
    status: 'ok',
    detail: { scheduledMessageId, sendAt, channel, autonomy: opts.autonomy, recipientContactId },
  };
}

/**
 * call_integration — the ONLY action that can SEND/mutate an external system.
 * GATED: executes only under autonomy === 'auto'. Under 'draft'/'notify' it is
 * skipped with a reason. When auto, we resolve the space owner's Composio entity
 * (via the headless context) and dispatch best-effort; an error returns failed.
 */
async function runCallIntegration(
  action: Extract<WorkflowAction, { type: 'call_integration' }>,
  spaceId: string,
  autonomy: WorkflowAutonomy,
): Promise<ActionStepResult> {
  if (autonomy !== 'auto') {
    return {
      status: 'skipped',
      detail: { reason: 'call_integration requires autonomy=auto' },
    };
  }

  const { toolkit, action: integrationAction, params } = action.config;

  // The Composio entity is the space owner's identity — resolve it the same way
  // the headless agent runner does. No owner → can't dispatch.
  const ctx = await buildHeadlessToolContext(spaceId, new AbortController().signal);
  if (!ctx) {
    return {
      status: 'failed',
      detail: { error: 'could not resolve space owner for integration call', toolkit, action: integrationAction },
    };
  }

  try {
    const result = await executeToolForEntity({
      entityId: ctx.userId,
      slug: integrationAction,
      arguments: params ?? {},
    });
    const successful = (result as { successful?: boolean })?.successful ?? true;
    if (!successful) {
      return {
        status: 'failed',
        detail: {
          toolkit,
          action: integrationAction,
          error: (result as { error?: string })?.error ?? 'integration call failed',
        },
      };
    }
    return { status: 'ok', detail: { toolkit, action: integrationAction } };
  } catch (err) {
    return {
      status: 'failed',
      detail: {
        toolkit,
        action: integrationAction,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/**
 * Execute one workflow action and return its step result. Never throws — any
 * unexpected error is caught and surfaced as `{ status: 'failed' }`.
 */
export async function executeAction(
  action: WorkflowAction,
  context: WorkflowContext,
  opts: ExecuteActionOptions,
): Promise<ActionStepResult> {
  try {
    switch (action.type) {
      case 'draft_message':
        return await runDraftMessage(action, context, opts.spaceId);
      case 'run_chippi':
        return await runChippi(action, opts.spaceId);
      case 'create_task':
        return await runCreateTask(action, context, opts.spaceId);
      case 'schedule_message':
        return await runScheduleMessage(action, context, opts);
      case 'call_integration':
        return await runCallIntegration(action, opts.spaceId, opts.autonomy);
      default: {
        // Exhaustiveness guard — an unknown action type fails closed.
        const _never: never = action;
        return { status: 'failed', detail: { error: 'unknown action type', action: _never } };
      }
    }
  } catch (err) {
    logger.error(
      '[workflows.actions] action threw',
      { spaceId: opts.spaceId, actionType: (action as WorkflowAction).type },
      err,
    );
    return {
      status: 'failed',
      detail: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}
