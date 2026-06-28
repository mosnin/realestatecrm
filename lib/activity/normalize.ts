/**
 * Per-source normalizers — pure functions, no I/O.
 *
 * Each `normalize*` takes one raw DB row from its source table and returns a
 * UnifiedActivityItem (or null, when the row should be EXCLUDED from the feed —
 * see normalizeContactActivity, which drops manual notes). The query layer calls
 * these after fetching each source's rows; nothing here touches the network or
 * the clock (no timeAgo — the UI formats timestamps, the data layer stays raw).
 *
 * SAFETY: a normalizer only ever copies CURATED TEXT columns into title/summary
 * (reasoning, summary, instruction, snippet, the source's own title…). It never
 * reads the raw `payload`/`metadata`/`triggerEvent` jsonb into user-facing text,
 * so no secret or raw delivery body can leak into the feed. The one exception is
 * normalizeContactActivity, which INSPECTS metadata.source/.via solely to decide
 * inclusion — it does not surface those values.
 *
 * STATUS MAPPING (each source's vocabulary → unified status/tone):
 *   success / green : completed, confirmed, sent, ok, dispatched*
 *   pending / amber : pending, in_flight, dispatched*, queued_for_approval,
 *                     drafted, sending, running, captured*
 *   failed  / rose  : failed, error
 *   skipped / muted : skipped, canceled, dismissed
 *   info    / muted : suggested, captured*  (informational, nothing acted on)
 *
 *   * The literal word "dispatched" means SUCCESS for the run ledger (the run is
 *     live) but PENDING for an integration event (a draft was kicked off, not
 *     yet acted on). "captured" is INFO for an integration event. These are
 *     resolved per-source, not by a shared string table, because the same word
 *     carries different meaning across sources.
 */

import type {
  ActivityStatus,
  ActivityTone,
  UnifiedActivityItem,
} from './types';

// ── shared helpers ───────────────────────────────────────────────────────────

/** The tone every status maps to (info and skipped both read as muted). */
function toneFor(status: ActivityStatus): ActivityTone {
  switch (status) {
    case 'success':
      return 'green';
    case 'pending':
      return 'amber';
    case 'failed':
      return 'rose';
    case 'skipped':
    case 'info':
      return 'muted';
  }
}

/** Build a status+tone pair from a unified status. */
function statusTone(status: ActivityStatus): Pick<UnifiedActivityItem, 'status' | 'tone'> {
  return { status, tone: toneFor(status) };
}

/** Coerce a possibly-null timestamp to ISO; falls back to epoch when absent so a
 *  row never sorts ahead of real entries on a missing sort value. */
function iso(value: unknown): string {
  if (typeof value === 'string' && value) return value;
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
}

/** Trim + cap a curated text column for use as a one-line title/summary. Returns
 *  undefined for empty/absent text so optional fields stay absent. */
function text(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Title-case a snake_case action/event type into a readable phrase. */
function humanize(value: unknown): string {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return 'Did something';
  return s
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** A readable channel noun for "a {channel}" titles. */
function channelNoun(channel: unknown): string {
  switch (channel) {
    case 'sms':
      return 'text';
    case 'email':
      return 'email';
    case 'note':
      return 'note';
    default:
      return 'message';
  }
}

// ── 1. AgentActivityLog → agent_action ───────────────────────────────────────

export interface AgentActivityRow {
  id: string;
  actionType?: string | null;
  outcome?: string | null;
  reasoning?: string | null;
  relatedContactId?: string | null;
  relatedDealId?: string | null;
  reversible?: boolean | null;
  reversedAt?: string | null;
  createdAt?: string | null;
}

export function normalizeAgentAction(row: AgentActivityRow): UnifiedActivityItem {
  let status: ActivityStatus;
  switch (row.outcome) {
    case 'completed':
      status = 'success';
      break;
    case 'queued_for_approval':
      status = 'pending';
      break;
    case 'failed':
      status = 'failed';
      break;
    case 'suggested':
    default:
      status = 'info';
      break;
  }

  const link: UnifiedActivityItem['link'] = row.relatedDealId
    ? { kind: 'deal', id: row.relatedDealId }
    : row.relatedContactId
      ? { kind: 'contact', id: row.relatedContactId }
      : undefined;

  return {
    id: `agent_action:${row.id}`,
    source: 'agentActivityLog',
    kind: 'agent_action',
    title: humanize(row.actionType),
    summary: text(row.reasoning),
    ...statusTone(status),
    occurredAt: iso(row.createdAt),
    relatedContactId: row.relatedContactId ?? undefined,
    relatedDealId: row.relatedDealId ?? undefined,
    link,
  };
}

// ── 2. AgentRunLedger → agent_dispatch ───────────────────────────────────────

export interface AgentRunLedgerRow {
  id: string;
  trigger?: string | null;
  status?: string | null;
  failureReason?: string | null;
  dispatchedAt?: string | null;
}

export function normalizeAgentDispatch(row: AgentRunLedgerRow): UnifiedActivityItem {
  let status: ActivityStatus;
  switch (row.status) {
    case 'confirmed':
      status = 'success';
      break;
    case 'dispatched':
    case 'in_flight':
      status = 'pending';
      break;
    case 'failed':
      status = 'failed';
      break;
    default:
      status = 'info';
      break;
  }

  return {
    id: `agent_dispatch:${row.id}`,
    source: 'agentRunLedger',
    kind: 'agent_dispatch',
    title: `Started a run (${humanize(row.trigger).toLowerCase()})`,
    summary: status === 'failed' ? text(row.failureReason) : undefined,
    ...statusTone(status),
    occurredAt: iso(row.dispatchedAt),
  };
}

// ── 3. AgentDraft → draft ────────────────────────────────────────────────────

export interface AgentDraftRow {
  id: string;
  channel?: string | null;
  status?: string | null;
  subject?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  createdAt?: string | null;
}

export function normalizeDraft(row: AgentDraftRow): UnifiedActivityItem {
  let status: ActivityStatus;
  switch (row.status) {
    case 'sent':
    case 'approved':
      status = 'success';
      break;
    case 'pending':
      status = 'pending';
      break;
    case 'dismissed':
      status = 'skipped';
      break;
    default:
      status = 'info';
      break;
  }

  const link: UnifiedActivityItem['link'] = row.contactId
    ? { kind: 'contact', id: row.contactId }
    : { kind: 'inbox' };

  return {
    id: `draft:${row.id}`,
    source: 'agentDraft',
    kind: 'draft',
    title: `Drafted a ${channelNoun(row.channel)}`,
    summary: text(row.subject),
    ...statusTone(status),
    occurredAt: iso(row.createdAt),
    channel: row.channel ?? undefined,
    relatedContactId: row.contactId ?? undefined,
    relatedDealId: row.dealId ?? undefined,
    link,
  };
}

// ── 4. WorkflowRun → workflow_run ────────────────────────────────────────────

export interface WorkflowRunRow {
  id: string;
  workflowId?: string | null;
  status?: string | null;
  summary?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export function normalizeWorkflowRun(row: WorkflowRunRow): UnifiedActivityItem {
  let status: ActivityStatus;
  switch (row.status) {
    case 'completed':
      status = 'success';
      break;
    case 'running':
      status = 'pending';
      break;
    case 'failed':
      status = 'failed';
      break;
    case 'skipped':
      status = 'skipped';
      break;
    default:
      status = 'info';
      break;
  }

  return {
    id: `workflow_run:${row.id}`,
    source: 'workflowRun',
    kind: 'workflow_run',
    title: text(row.summary) ?? 'Workflow ran',
    summary: status === 'failed' ? text(row.error) : undefined,
    ...statusTone(status),
    occurredAt: iso(row.startedAt),
    relatedWorkflowId: row.workflowId ?? undefined,
    link: row.workflowId
      ? { kind: 'workflow', id: row.workflowId }
      : { kind: 'workflow' },
  };
}

// ── 5. ScheduledMessage → scheduled_message ──────────────────────────────────

export interface ScheduledMessageRow {
  id: string;
  channel?: string | null;
  status?: string | null;
  recipientContactId?: string | null;
  instruction?: string | null;
  sendAt?: string | null;
  workflowId?: string | null;
  createdAt?: string | null;
}

export function normalizeScheduledMessage(row: ScheduledMessageRow): UnifiedActivityItem {
  let status: ActivityStatus;
  let verb: string;
  switch (row.status) {
    case 'sent':
      status = 'success';
      verb = 'Sent';
      break;
    case 'pending':
    case 'sending':
    case 'drafted':
      status = 'pending';
      verb = row.status === 'drafted' ? 'Drafted' : 'Scheduled';
      break;
    case 'failed':
      status = 'failed';
      verb = 'Scheduled';
      break;
    case 'canceled':
      status = 'skipped';
      verb = 'Canceled';
      break;
    default:
      status = 'info';
      verb = 'Scheduled';
      break;
  }

  const link: UnifiedActivityItem['link'] = row.recipientContactId
    ? { kind: 'contact', id: row.recipientContactId }
    : { kind: 'inbox' };

  return {
    id: `scheduled_message:${row.id}`,
    source: 'scheduledMessage',
    kind: 'scheduled_message',
    title: `${verb} a ${channelNoun(row.channel)}`,
    summary: text(row.instruction),
    ...statusTone(status),
    occurredAt: iso(row.createdAt),
    channel: row.channel ?? undefined,
    relatedContactId: row.recipientContactId ?? undefined,
    relatedWorkflowId: row.workflowId ?? undefined,
    link,
  };
}

// ── 6. IntegrationEvent → integration_event ──────────────────────────────────

export interface IntegrationEventRow {
  id: string;
  toolkit?: string | null;
  eventType?: string | null;
  title?: string | null;
  actor?: string | null;
  snippet?: string | null;
  status?: string | null;
  connectionId?: string | null;
  occurredAt?: string | null;
}

export function normalizeIntegrationEvent(row: IntegrationEventRow): UnifiedActivityItem {
  let status: ActivityStatus;
  switch (row.status) {
    case 'dispatched':
      status = 'pending';
      break;
    case 'skipped':
      status = 'skipped';
      break;
    case 'failed':
      status = 'failed';
      break;
    case 'captured':
    default:
      status = 'info';
      break;
  }

  const title =
    text(row.title) ??
    (row.actor ? `${humanize(row.eventType)} from ${text(row.actor)}` : humanize(row.eventType));

  return {
    id: `integration_event:${row.id}`,
    source: 'integrationEvent',
    kind: 'integration_event',
    title,
    summary: text(row.snippet),
    ...statusTone(status),
    occurredAt: iso(row.occurredAt),
    toolkit: row.toolkit ?? undefined,
    link: { kind: 'integrations' },
  };
}

// ── 7. Routine → routine_run ─────────────────────────────────────────────────

export interface RoutineRow {
  id: string;
  instruction?: string | null;
  lastRunStatus?: string | null;
  cadence?: string | null;
  lastRunAt?: string | null;
}

export function normalizeRoutineRun(row: RoutineRow): UnifiedActivityItem {
  let status: ActivityStatus;
  switch (row.lastRunStatus) {
    case 'ok':
      status = 'success';
      break;
    case 'error':
      status = 'failed';
      break;
    default:
      status = 'info';
      break;
  }

  return {
    id: `routine_run:${row.id}`,
    source: 'routine',
    kind: 'routine_run',
    title: 'Routine ran',
    summary: text(row.instruction),
    ...statusTone(status),
    occurredAt: iso(row.lastRunAt),
    link: { kind: 'routines', id: row.id },
  };
}

// ── 8. ContactActivity → outbound_message ────────────────────────────────────
//
// ContactActivity holds BOTH manual notes/logs the realtor wrote AND Chippi's
// own logged outbound sends. To keep the feed about "what Chippi did", we INCLUDE
// a row ONLY when its metadata carries an agent/workflow origin marker — i.e.
// metadata.source OR metadata.via is a non-null string (e.g.
// 'workflow_scheduled_auto', 'workflow', 'agent', 'on_demand_agent',
// 'background_agent'). A plain manual note has no such marker (or only
// manualLog:true) and is EXCLUDED. normalizeContactActivity returns null for
// excluded rows; the query layer drops the nulls.

export interface ContactActivityRow {
  id: string;
  type?: string | null;
  content?: string | null;
  contactId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

/** True when the row's metadata marks it as agent/workflow origin (not a manual
 *  note). A non-null string in metadata.source or metadata.via is the marker. */
function isAgentOrigin(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const source = metadata.source;
  const via = metadata.via;
  return (
    (typeof source === 'string' && source.trim().length > 0) ||
    (typeof via === 'string' && via.trim().length > 0)
  );
}

export function normalizeOutboundMessage(row: ContactActivityRow): UnifiedActivityItem | null {
  // EXCLUDE manual notes — only agent/workflow-origin rows belong in the feed.
  if (!isAgentOrigin(row.metadata)) return null;

  // Map the activity type onto a unified status. These are logged AFTER the
  // fact, so they're effectively done: calls/meetings/sends → success; a logged
  // follow_up intent reads as pending.
  const status: ActivityStatus = row.type === 'follow_up' ? 'pending' : 'success';

  const channel =
    row.type === 'email' || row.type === 'call' ? row.type : row.type === 'note' ? 'note' : undefined;

  return {
    id: `outbound_message:${row.id}`,
    source: 'contactActivity',
    kind: 'outbound_message',
    title: `Sent a ${channelNoun(channel)}`,
    summary: text(row.content),
    ...statusTone(status),
    occurredAt: iso(row.createdAt),
    channel: channel ?? undefined,
    relatedContactId: row.contactId ?? undefined,
    link: row.contactId ? { kind: 'contact', id: row.contactId } : undefined,
  };
}
