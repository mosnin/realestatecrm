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
import { evaluateConditions, resolveField } from './conditions';
import type { WorkflowAction, WorkflowAutonomy } from './schema';
import { UPDATE_LEAD_FIELDS } from './schema';

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
  /**
   * When true the executor stops running remaining actions (used by the
   * 'filter' action type when its condition is not met).
   */
  stop?: boolean;
}

/** Per-action options threaded from the executor. */
export interface ExecuteActionOptions {
  spaceId: string;
  autonomy: WorkflowAutonomy;
  /** The WorkflowRun id, threaded for audit correlation on scheduled rows. */
  runId?: string;
}

/**
 * Sanitize entity-derived display text before it's interpolated into the agent
 * instruction. The recipient name comes from attacker-controlled input (the
 * public apply form / inbound payloads), so we strip newlines + control chars
 * (which could smuggle a second "instruction"), collapse whitespace, and cap the
 * length — defusing prompt injection while leaving clean names untouched.
 */
function sanitizeRecipientText(name: string): string {
  return name
    // eslint-disable-next-line no-control-regex -- intentionally stripping control chars (incl. newlines)
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Resolve `{{token}}` placeholders in an instruction string against the
 * workflow context. Supports lead.*, trigger.*, and step#.* tokens written
 * by the builder's TokenPicker. Unknown tokens are left as-is so the LLM
 * sees them (rather than a blank) and can handle them gracefully.
 *
 * All resolved values are sanitized through sanitizeRecipientText to prevent
 * prompt injection via untrusted lead data.
 */
function resolveTokens(template: string, context: WorkflowContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const parts = path.trim().split('.');
    if (parts.length < 2) return _match;

    const ns = parts[0];
    const rest = parts.slice(1).join('.');

    let value: unknown = undefined;

    if (ns === 'lead') {
      value = resolveField(context.lead ?? context.contact ?? {}, rest);
    } else if (ns === 'trigger') {
      value = resolveField(context.event ?? {}, rest);
    } else if (/^step\d+$/.test(ns)) {
      const stepData = context[ns];
      if (stepData && typeof stepData === 'object') {
        value = resolveField(stepData as Record<string, unknown>, rest);
      }
    } else if (ns === 'formatter') {
      const fmtData = context.formatter;
      if (fmtData && typeof fmtData === 'object') {
        value = resolveField(fmtData as Record<string, unknown>, rest);
      }
    }

    if (value === undefined || value === null) return _match;
    const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return sanitizeRecipientText(str);
  });
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
    if (typeof name === 'string' && name.trim()) {
      // Untrusted text → sanitize before it reaches the composed instruction.
      const safe = sanitizeRecipientText(name);
      if (safe) return safe;
    }
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
  const resolved = resolveTokens(instruction, context);
  const composed = `Draft a ${channel} to ${recipient}: ${resolved}`;
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
  context: WorkflowContext,
  spaceId: string,
): Promise<ActionStepResult> {
  const result = await runAutonomousInstruction({
    spaceId,
    instruction: resolveTokens(action.config.instruction, context),
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

  // FOLLOW-UP: gate toolkit/integrationAction against an allowlist so an 'auto'
  // workflow can only dispatch vetted (toolkit, action) pairs, not any Composio slug.

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
 * delay — records the intended pause in the run ledger. In serverless execution
 * the delay cannot actually block; the run note makes the intent observable in
 * the audit trail. A future scheduler (DelayedResume table + cron) can honour
 * long delays by replaying remaining actions after the specified interval.
 */
function runDelay(
  action: Extract<WorkflowAction, { type: 'delay' }>,
): ActionStepResult {
  return {
    status: 'ok',
    detail: {
      delayMinutes: action.config.delayMinutes,
      note: 'Delay recorded. Async resumption is not yet active — subsequent steps ran immediately.',
    },
  };
}

/**
 * filter — evaluates a single field condition. When the condition is not met
 * the run is halted (stop = true) with status 'skipped'; subsequent actions are
 * not executed. This mirrors Zapier's "Filter by Zapier" step.
 */
function runFilter(
  action: Extract<WorkflowAction, { type: 'filter' }>,
  context: WorkflowContext,
): ActionStepResult {
  const { field, operator, value } = action.config;
  const passed = evaluateConditions(
    { op: 'and', rules: [{ field, operator, value }] },
    context as Record<string, unknown>,
  );
  if (!passed) {
    return {
      status: 'skipped',
      stop: true,
      detail: { filtered: true, field, operator, value, reason: 'filter condition not met' },
    };
  }
  return { status: 'ok', detail: { filtered: false, field, operator, passed: true } };
}

/**
 * Simple date formatter. Supports common patterns used in real estate: US date,
 * ISO date, long-form, and relative. Falls back to locale default for unknowns.
 */
function formatDateValue(date: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  switch (format) {
    case 'MM/DD/YYYY': return `${m}/${d}/${y}`;
    case 'DD/MM/YYYY': return `${d}/${m}/${y}`;
    case 'YYYY-MM-DD': return `${y}-${m}-${d}`;
    case 'Month D, YYYY': return `${monthNames[date.getMonth()]} ${date.getDate()}, ${y}`;
    case 'Mon D, YYYY': return `${monthNames[date.getMonth()].slice(0, 3)} ${date.getDate()}, ${y}`;
    case 'relative': {
      const diffMs = Date.now() - date.getTime();
      const diffDays = Math.round(diffMs / 86400000);
      if (Math.abs(diffDays) === 0) return 'today';
      if (diffDays === 1) return 'yesterday';
      if (diffDays === -1) return 'tomorrow';
      if (diffDays > 0) return `${diffDays} days ago`;
      return `in ${Math.abs(diffDays)} days`;
    }
    default: return date.toLocaleDateString();
  }
}

/**
 * formatter — transform a context value (text/number/date) and store the result
 * in context.formatter.output so subsequent steps can reference it. Always
 * returns 'ok' — a failed parse returns the original value rather than halting.
 */
function runFormatter(
  action: Extract<WorkflowAction, { type: 'formatter' }>,
  context: WorkflowContext,
): ActionStepResult {
  const { input, operation, find, replacement, format, toFixed } = action.config;
  const resolved = resolveField(context as Record<string, unknown>, input);
  const strValue = String(resolved !== undefined && resolved !== null ? resolved : input);

  let output: unknown = strValue;
  switch (operation) {
    case 'uppercase': output = strValue.toUpperCase(); break;
    case 'lowercase': output = strValue.toLowerCase(); break;
    case 'capitalize': output = strValue.charAt(0).toUpperCase() + strValue.slice(1).toLowerCase(); break;
    case 'trim': output = strValue.trim(); break;
    case 'replace': {
      const needle = find ?? '';
      if (!needle) { output = strValue; break; }
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      output = strValue.replace(new RegExp(escaped, 'g'), replacement ?? '');
      break;
    }
    case 'number_format': {
      const num = parseFloat(strValue);
      if (Number.isNaN(num)) { output = strValue; break; }
      output = toFixed !== undefined ? num.toFixed(toFixed) : num.toLocaleString();
      break;
    }
    case 'date_format': {
      const date = new Date(strValue);
      if (Number.isNaN(date.getTime())) { output = strValue; break; }
      output = format ? formatDateValue(date, format) : date.toLocaleDateString();
      break;
    }
    case 'extract_number': {
      const m = strValue.match(/-?\d+(?:\.\d+)?/);
      output = m ? m[0] : '';
      break;
    }
    case 'extract_email': {
      const m = strValue.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      output = m ? m[0] : '';
      break;
    }
    case 'extract_phone': {
      const m = strValue.match(/[+]?[(]?\d{3}[)]?[-\s.]?\d{3}[-\s.]\d{4,6}/);
      output = m ? m[0] : '';
      break;
    }
    default: output = strValue;
  }

  // Stash result in context so later steps can read 'formatter.output'.
  (context as Record<string, unknown>).formatter = { output, input, operation };

  return { status: 'ok', detail: { input, operation, output, inputResolved: resolved } };
}

/**
 * update_lead — write a whitelisted field back to the Contact row referenced in
 * context.lead.id. The allowed field names come from UPDATE_LEAD_FIELDS; the
 * executor rejects anything not in that list so a tampered definition can't touch
 * arbitrary columns.
 *
 * - score_label: sets scoreLabel (must be hot/warm/cold) + scoringStatus='scored'.
 * - follow_up_in_days: sets followUpAt to now + N days (value is a positive integer).
 * - tag_add: appends value to the tags array (idempotent — no-op if already there).
 * - tag_remove: removes value from the tags array.
 */
async function runUpdateLead(
  action: Extract<WorkflowAction, { type: 'update_lead' }>,
  context: WorkflowContext,
  spaceId: string,
): Promise<ActionStepResult> {
  const { field, value: rawValue } = action.config;
  const resolvedValue = resolveTokens(rawValue, context);

  const contactId = context.lead?.id as string | undefined;
  if (!contactId) {
    return { status: 'failed', detail: { error: 'No contact id in workflow context — cannot update lead.', field } };
  }

  if (!(UPDATE_LEAD_FIELDS as readonly string[]).includes(field)) {
    return { status: 'failed', detail: { error: `Unknown update_lead field: ${field}` } };
  }

  const now = new Date().toISOString();

  if (field === 'score_label') {
    const allowed = ['hot', 'warm', 'cold'];
    if (!allowed.includes(resolvedValue)) {
      return { status: 'failed', detail: { error: `score_label must be hot/warm/cold, got: ${resolvedValue}`, field } };
    }
    const { error } = await supabase
      .from('Contact')
      .update({ scoreLabel: resolvedValue, scoringStatus: 'scored', updatedAt: now })
      .eq('id', contactId)
      .eq('spaceId', spaceId);
    if (error) return { status: 'failed', detail: { error: error.message, field } };
    return { status: 'ok', detail: { field, value: resolvedValue, contactId } };
  }

  if (field === 'follow_up_in_days') {
    const days = parseInt(resolvedValue, 10);
    if (!Number.isFinite(days) || days < 0) {
      return { status: 'failed', detail: { error: `follow_up_in_days must be a non-negative integer, got: ${resolvedValue}` } };
    }
    const followUpAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const { error } = await supabase
      .from('Contact')
      .update({ followUpAt, updatedAt: now })
      .eq('id', contactId)
      .eq('spaceId', spaceId);
    if (error) return { status: 'failed', detail: { error: error.message, field } };
    return { status: 'ok', detail: { field, days, followUpAt, contactId } };
  }

  if (field === 'tag_add' || field === 'tag_remove') {
    const tag = resolvedValue.trim();
    if (!tag) return { status: 'failed', detail: { error: 'Tag value must not be empty', field } };

    const { data: row, error: fetchErr } = await supabase
      .from('Contact')
      .select('tags')
      .eq('id', contactId)
      .eq('spaceId', spaceId)
      .single();
    if (fetchErr) return { status: 'failed', detail: { error: fetchErr.message, field } };

    const currentTags: string[] = Array.isArray((row as { tags?: string[] } | null)?.tags)
      ? ((row as { tags: string[] }).tags)
      : [];

    const nextTags =
      field === 'tag_add'
        ? currentTags.includes(tag) ? currentTags : [...currentTags, tag]
        : currentTags.filter((t) => t !== tag);

    const { error: updateErr } = await supabase
      .from('Contact')
      .update({ tags: nextTags, updatedAt: now })
      .eq('id', contactId)
      .eq('spaceId', spaceId);
    if (updateErr) return { status: 'failed', detail: { error: updateErr.message, field } };
    return { status: 'ok', detail: { field, tag, contactId, tags: nextTags } };
  }

  return { status: 'failed', detail: { error: `Unhandled field: ${field}` } };
}

/**
 * SSRF guard — returns true if the hostname appears to be a private/internal
 * address that should never be the target of an outbound webhook. Only applied
 * in the executor; the Zod schema already enforces HTTPS.
 */
function isPrivateHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h === '0.0.0.0') return true;
    // IPv4 private ranges
    const ipv4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4) {
      const [, a, b] = ipv4.map(Number);
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true; // link-local (AWS metadata etc.)
    }
    // IPv6 loopback / link-local
    if (h === '::1' || h.startsWith('fe80:') || h.startsWith('[::1]') || h.startsWith('[fe80:')) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * webhook_post — POST JSON to an external HTTPS URL. The body and URL are
 * interpolated ({{token}} replaced). SSRF is guarded by blocking private IPs.
 * Response body is read up to 10 KB and returned in the detail for audit.
 */
async function runWebhookPost(
  action: Extract<WorkflowAction, { type: 'webhook_post' }>,
  context: WorkflowContext,
): Promise<ActionStepResult> {
  const { url: rawUrl, bodyJson, headersJson } = action.config;
  const url = resolveTokens(rawUrl, context);
  if (isPrivateHost(url)) {
    return { status: 'failed', detail: { error: 'Webhook URL targets a private or loopback address.', url } };
  }

  let body: string | undefined;
  if (bodyJson) {
    body = resolveTokens(bodyJson, context);
    try { JSON.parse(body); } catch {
      return { status: 'failed', detail: { error: 'Webhook body is not valid JSON.', body } };
    }
  }

  let headers: Record<string, string> = { 'Content-Type': 'application/json', 'User-Agent': 'chippi-workflows/1.0' };
  if (headersJson) {
    try {
      const parsed = JSON.parse(headersJson) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') headers[k] = v;
      }
    } catch {
      return { status: 'failed', detail: { error: 'Headers JSON is invalid.', headersJson } };
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body ?? '{}',
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text().then((t) => t.slice(0, 10_000));
    return {
      status: res.ok ? 'ok' : 'failed',
      detail: {
        url,
        statusCode: res.status,
        ok: res.ok,
        responseSnippet: text.slice(0, 500),
        ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
      },
    };
  } catch (err) {
    return { status: 'failed', detail: { url, error: err instanceof Error ? err.message : String(err) } };
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
        return await runChippi(action, context, opts.spaceId);
      case 'create_task':
        return await runCreateTask(action, context, opts.spaceId);
      case 'schedule_message':
        return await runScheduleMessage(action, context, opts);
      case 'call_integration':
        return await runCallIntegration(action, opts.spaceId, opts.autonomy);
      case 'delay':
        return runDelay(action);
      case 'filter':
        return runFilter(action, context);
      case 'formatter':
        return runFormatter(action, context);
      case 'webhook_post':
        return await runWebhookPost(action, context);
      case 'update_lead':
        return await runUpdateLead(action, context, opts.spaceId);
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
