/**
 * Unified activity query — merge eight sources into one chronological feed.
 *
 * getUnifiedActivity() runs one scoped query PER SOURCE in parallel, normalizes
 * each source's rows to UnifiedActivityItem, concatenates them, sorts the whole
 * set by occurredAt DESC, applies the app-side filters that can't be pushed to a
 * single SQL query (status across heterogeneous vocabularies, a free-text search
 * over title+summary), and slices to `limit`.
 *
 * TENANT ISOLATION — the #1 requirement. EVERY source query carries
 * `.eq('spaceId', spaceId)`. There is no path that reads a source without that
 * filter; a centralized `runSource` helper builds the base query with the
 * spaceId guard already applied, and each source's builder extends it. The query
 * tests assert every source query recorded a spaceId filter.
 *
 * DEFENSIVE: each source is wrapped so one source failing (a missing table in
 * some env, a transient DB error) logs and yields [] rather than failing the
 * whole feed. A partial feed beats a blank one.
 *
 * CURSOR: keyset-ish over occurredAt. `before` (an ISO cursor) applies `.lt` on
 * EACH source's own sort column, so the merge resumes strictly before the last
 * page's tail. `nextCursor` is the occurredAt of the last returned item when the
 * page is full (exactly `limit` items), else null — the UI stops paging on null.
 * Note: occurredAt isn't unique across sources, so the cursor is an instant, not
 * a row key; an item sharing the exact cursor instant can be skipped on the next
 * page. Acceptable for an activity feed (sub-second collisions are vanishingly
 * rare); a precise keyset would need a composite (occurredAt, id) cursor.
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type {
  ActivityKind,
  ActivityStatus,
  UnifiedActivityItem,
} from './types';
import {
  normalizeAgentAction,
  normalizeAgentDispatch,
  normalizeDraft,
  normalizeWorkflowRun,
  normalizeScheduledMessage,
  normalizeIntegrationEvent,
  normalizeRoutineRun,
  normalizeOutboundMessage,
  type AgentActivityRow,
  type AgentRunLedgerRow,
  type AgentDraftRow,
  type WorkflowRunRow,
  type ScheduledMessageRow,
  type IntegrationEventRow,
  type RoutineRow,
  type ContactActivityRow,
} from './normalize';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

/** Per-source fetch cap. We over-fetch (limit*2, capped) so the post-merge sort
 *  + filter has enough headroom to fill a page even when one source dominates. */
const PER_SOURCE_CAP = 100;

export interface GetUnifiedActivityInput {
  spaceId: string;
  limit?: number;
  /** ISO cursor — return only items strictly before this instant. */
  before?: string;
  /** Restrict to these kinds; sources with no requested kind are skipped. */
  kinds?: ActivityKind[];
  /** Restrict to these unified statuses (applied in app code post-merge). */
  statuses?: ActivityStatus[];
  /** Lower bound (inclusive) on occurredAt — an ISO instant. */
  since?: string;
  /** Upper bound (inclusive) on occurredAt — an ISO instant. */
  until?: string;
  /** Case-insensitive substring over title+summary (applied post-merge). */
  search?: string;
}

export interface GetUnifiedActivityResult {
  items: UnifiedActivityItem[];
  nextCursor: string | null;
}

/** Each source: its table, sort column, the kind(s) it can produce, and a mapper
 *  from a raw row to a UnifiedActivityItem (or null to drop the row). */
interface SourceSpec {
  table: string;
  sortCol: string;
  kinds: ActivityKind[];
  /** Columns to select — curated only, never raw payload (except metadata for
   *  ContactActivity, which the normalizer inspects for origin then discards). */
  select: string;
  normalize: (row: Record<string, unknown>) => UnifiedActivityItem | null;
}

const SOURCES: SourceSpec[] = [
  {
    table: 'AgentActivityLog',
    sortCol: 'createdAt',
    kinds: ['agent_action'],
    select:
      'id, actionType, outcome, reasoning, relatedContactId, relatedDealId, reversible, reversedAt, createdAt',
    normalize: (r) => normalizeAgentAction(r as unknown as AgentActivityRow),
  },
  {
    table: 'AgentRunLedger',
    sortCol: 'dispatchedAt',
    kinds: ['agent_dispatch'],
    select: 'id, trigger, status, failureReason, dispatchedAt',
    normalize: (r) => normalizeAgentDispatch(r as unknown as AgentRunLedgerRow),
  },
  {
    table: 'AgentDraft',
    sortCol: 'createdAt',
    kinds: ['draft'],
    select: 'id, channel, status, subject, contactId, dealId, createdAt',
    normalize: (r) => normalizeDraft(r as unknown as AgentDraftRow),
  },
  {
    table: 'WorkflowRun',
    sortCol: 'startedAt',
    kinds: ['workflow_run'],
    select: 'id, workflowId, status, summary, error, startedAt, finishedAt',
    normalize: (r) => normalizeWorkflowRun(r as unknown as WorkflowRunRow),
  },
  {
    table: 'ScheduledMessage',
    sortCol: 'createdAt',
    kinds: ['scheduled_message'],
    select:
      'id, channel, status, recipientContactId, instruction, sendAt, workflowId, createdAt',
    normalize: (r) => normalizeScheduledMessage(r as unknown as ScheduledMessageRow),
  },
  {
    table: 'IntegrationEvent',
    sortCol: 'occurredAt',
    kinds: ['integration_event'],
    select: 'id, toolkit, eventType, title, actor, snippet, status, connectionId, occurredAt',
    normalize: (r) => normalizeIntegrationEvent(r as unknown as IntegrationEventRow),
  },
  {
    table: 'Routine',
    sortCol: 'lastRunAt',
    kinds: ['routine_run'],
    select: 'id, instruction, lastRunStatus, cadence, lastRunAt',
    normalize: (r) => normalizeRoutineRun(r as unknown as RoutineRow),
  },
  {
    table: 'ContactActivity',
    sortCol: 'createdAt',
    kinds: ['outbound_message'],
    select: 'id, type, content, contactId, metadata, createdAt',
    normalize: (r) => normalizeOutboundMessage(r as unknown as ContactActivityRow),
  },
];

/**
 * Fetch + normalize ONE source, fully scoped. EVERY query starts from the
 * spaceId guard and is ordered by the source's sort column DESC. Defensive: any
 * error (PostgREST error object or a thrown exception) logs and yields [].
 */
async function fetchSource(
  spec: SourceSpec,
  input: GetUnifiedActivityInput,
  perSourceLimit: number,
): Promise<UnifiedActivityItem[]> {
  try {
    // TENANT ISOLATION: spaceId filter is applied FIRST, on every source.
    let q = supabase
      .from(spec.table)
      .select(spec.select)
      .eq('spaceId', input.spaceId)
      .order(spec.sortCol, { ascending: false })
      .limit(perSourceLimit);

    // Routine surfaces RUNS, not definitions — only rows that have actually run.
    if (spec.table === 'Routine') {
      q = q.not('lastRunAt', 'is', null);
    }

    if (input.before) q = q.lt(spec.sortCol, input.before);
    if (input.until) q = q.lte(spec.sortCol, input.until);
    if (input.since) q = q.gte(spec.sortCol, input.since);

    const { data, error } = await q;
    if (error) {
      logger.warn('[activity] source query failed', { table: spec.table, spaceId: input.spaceId }, error);
      return [];
    }

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const items: UnifiedActivityItem[] = [];
    for (const row of rows) {
      const item = spec.normalize(row);
      if (item) items.push(item); // drop nulls (e.g. excluded manual notes)
    }
    return items;
  } catch (err) {
    logger.warn('[activity] source query threw', { table: spec.table, spaceId: input.spaceId }, err);
    return [];
  }
}

/**
 * Merge the eight sources into one filtered, sorted, paginated feed. See the
 * module header for the cursor + isolation contract.
 */
export async function getUnifiedActivity(
  input: GetUnifiedActivityInput,
): Promise<GetUnifiedActivityResult> {
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  const perSourceLimit = Math.min(limit * 2, PER_SOURCE_CAP);

  // OPTIMIZATION: when kinds is set, skip any source that produces none of them.
  const wanted = input.kinds && input.kinds.length > 0 ? new Set(input.kinds) : null;
  const active = wanted
    ? SOURCES.filter((s) => s.kinds.some((k) => wanted.has(k)))
    : SOURCES;

  // Query every active source in parallel; each is independently defensive.
  const perSource = await Promise.all(
    active.map((spec) => fetchSource(spec, input, perSourceLimit)),
  );

  let items = perSource.flat();

  // SORT the merged set by occurredAt DESC (string ISO compares correctly).
  items.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));

  // App-side STATUS filter (status spans heterogeneous source vocabularies).
  if (input.statuses && input.statuses.length > 0) {
    const allowed = new Set(input.statuses);
    items = items.filter((it) => allowed.has(it.status));
  }

  // App-side SEARCH — case-insensitive substring over title + summary.
  if (input.search && input.search.trim()) {
    const needle = input.search.trim().toLowerCase();
    items = items.filter(
      (it) =>
        it.title.toLowerCase().includes(needle) ||
        (it.summary ? it.summary.toLowerCase().includes(needle) : false),
    );
  }

  const page = items.slice(0, limit);
  // A full page means there may be more; hand back the tail's instant as the
  // next cursor. A short page means we exhausted the feed → null.
  const nextCursor = page.length === limit ? page[page.length - 1].occurredAt : null;

  return { items: page, nextCursor };
}
