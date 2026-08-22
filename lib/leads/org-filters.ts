/**
 * First-class lead organization on the existing Contact model.
 *
 * This is NOT a parallel CRM. Every concept maps onto a column (or SavedView)
 * that already exists:
 *
 *   segment   → Contact.leadType     (rental | buyer | seller)
 *   stage     → Contact.type         (QUALIFICATION | TOUR | APPLICATION)
 *   tags      → Contact.tags[]
 *   lists     → SavedView            (named, space-scoped filter sets)
 *   ownership → Contact.spaceId      (the workspace is the owner)
 *   source    → Contact.source       (lib/lead-source.ts)
 *   status    → Contact.snoozedUntil (active | snoozed | archived)
 *
 * Filters are applied AFTER the caller has already scoped `.eq('spaceId', …)`.
 * An `owner` that does not match this space never opens another tenant — it
 * matches zero rows inside the already-scoped query.
 */

import { CLIENT_TYPES, type ContactStageKey } from '@/lib/constants';
import { isLeadSource, type LeadSource } from '@/lib/lead-source';

/** Pipeline stages already stored on Contact.type. */
export const LEAD_ORG_STAGES = CLIENT_TYPES;
export type LeadOrgStage = ContactStageKey;

/** Segments already stored on Contact.leadType. */
export const LEAD_ORG_SEGMENTS = ['rental', 'buyer', 'seller'] as const;
export type LeadOrgSegment = (typeof LEAD_ORG_SEGMENTS)[number];

/** Derived from Contact.snoozedUntil. `all` is the explicit unfiltered cut. */
export const LEAD_ORG_STATUSES = ['active', 'snoozed', 'archived', 'all'] as const;
export type LeadOrgStatus = (typeof LEAD_ORG_STATUSES)[number];

export const LEAD_ORG_SCORE_LABELS = ['hot', 'warm', 'cold', 'unscored'] as const;
export type LeadOrgScoreLabel = (typeof LEAD_ORG_SCORE_LABELS)[number];

/**
 * Far-future snooze that means "archived" on Contact (no status column).
 * Shared with POST /api/contacts/bulk so archive/unarchive stay one rule.
 */
export const CONTACT_ARCHIVE_UNTIL = '2999-12-31T00:00:00.000Z';

/** Never-match id used when an owner filter points at another tenant. */
export const LEAD_ORG_EMPTY_ID = '__lead_org_owner_mismatch__';

const TAG_MAX_LEN = 100;

export type LeadOrgFilters = {
  stage?: LeadOrgStage;
  segment?: LeadOrgSegment;
  /** Single tag (Contact.tags contains). */
  tag?: string;
  /** Additional tags, AND-combined. */
  tags?: string[];
  source?: LeadSource;
  status?: LeadOrgStatus;
  scoreLabel?: LeadOrgScoreLabel;
  /** SavedView id — the route loads it space-scoped, then merges. */
  list?: string;
  /**
   * Space owner user id or space id. Must match the authorized workspace
   * or the query is forced empty (never cross-tenant).
   */
  owner?: string;
};

/**
 * Minimal PostgREST chain the filter helper needs. Real supabase queries
 * satisfy this; tests pass a recording stub. Methods are typed loosely so
 * we don't fight PostgrestFilterBuilder's overloads.
 */
export type LeadOrgQuery = {
  eq: (column: string, value: string) => LeadOrgQuery;
  contains: (column: string, value: string[]) => LeadOrgQuery;
  or: (filters: string) => LeadOrgQuery;
  is: (column: string, value: null) => LeadOrgQuery;
  gt: (column: string, value: string) => LeadOrgQuery;
  gte: (column: string, value: string) => LeadOrgQuery;
  lt: (column: string, value: string) => LeadOrgQuery;
  lte: (column: string, value: string) => LeadOrgQuery;
};

function isStage(v: string): v is LeadOrgStage {
  return (LEAD_ORG_STAGES as readonly string[]).includes(v);
}

function isSegment(v: string): v is LeadOrgSegment {
  return (LEAD_ORG_SEGMENTS as readonly string[]).includes(v);
}

function isStatus(v: string): v is LeadOrgStatus {
  return (LEAD_ORG_STATUSES as readonly string[]).includes(v);
}

function isScoreLabel(v: string): v is LeadOrgScoreLabel {
  return (LEAD_ORG_SCORE_LABELS as readonly string[]).includes(v);
}

function sanitizeTag(raw: string): string | null {
  const tag = raw.trim().slice(0, TAG_MAX_LEN);
  return tag.length > 0 ? tag : null;
}

/**
 * Parse first-class lead-org query params. Unknown values are dropped (never
 * throw) so a bad filter cannot 500 the list. Aliases:
 *   stage | type, segment | leadType, tag | tags (comma-separated).
 */
export function parseLeadOrgFilters(
  params: Pick<URLSearchParams, 'get' | 'getAll'>,
): LeadOrgFilters {
  const filters: LeadOrgFilters = {};

  const stageRaw = params.get('stage') ?? params.get('type');
  if (stageRaw && isStage(stageRaw)) filters.stage = stageRaw;

  const segmentRaw = params.get('segment') ?? params.get('leadType');
  if (segmentRaw && isSegment(segmentRaw)) filters.segment = segmentRaw;

  const sourceRaw = params.get('source');
  if (sourceRaw && isLeadSource(sourceRaw)) filters.source = sourceRaw;

  const statusRaw = params.get('status');
  if (statusRaw && isStatus(statusRaw)) filters.status = statusRaw;

  const scoreRaw = params.get('scoreLabel');
  if (scoreRaw && isScoreLabel(scoreRaw)) filters.scoreLabel = scoreRaw;

  const listRaw = params.get('list');
  if (listRaw && listRaw.trim()) filters.list = listRaw.trim().slice(0, 80);

  const ownerRaw = params.get('owner');
  if (ownerRaw && ownerRaw.trim()) filters.owner = ownerRaw.trim().slice(0, 80);

  const tagSingles: string[] = [];
  const tagParam = params.get('tag');
  if (tagParam) {
    const t = sanitizeTag(tagParam);
    if (t) tagSingles.push(t);
  }
  for (const raw of params.getAll('tags')) {
    for (const part of raw.split(',')) {
      const t = sanitizeTag(part);
      if (t) tagSingles.push(t);
    }
  }
  if (tagSingles.length === 1) filters.tag = tagSingles[0];
  else if (tagSingles.length > 1) {
    filters.tag = tagSingles[0];
    filters.tags = tagSingles.slice(1);
  }

  return filters;
}

/**
 * Fold a SavedView.filters payload (the People-table shape) into lead-org
 * filters. Request params win when both set a field — the URL is the
 * explicit cut; the list is the starting point.
 */
export function mergeSavedViewFilters(
  base: LeadOrgFilters,
  viewFilters: Record<string, unknown> | null | undefined,
): LeadOrgFilters {
  if (!viewFilters || typeof viewFilters !== 'object') return { ...base };
  const merged: LeadOrgFilters = { ...base };

  const typeFilter = viewFilters.typeFilter;
  if (!merged.stage && typeof typeFilter === 'string' && isStage(typeFilter)) {
    merged.stage = typeFilter;
  }

  const leadTypeFilter = viewFilters.leadTypeFilter;
  if (!merged.segment && typeof leadTypeFilter === 'string') {
    if (isSegment(leadTypeFilter)) merged.segment = leadTypeFilter;
    else if (leadTypeFilter === 'new' && !merged.tag) merged.tag = 'new-lead';
  }

  const tagFilter = viewFilters.tagFilter;
  if (!merged.tag && typeof tagFilter === 'string') {
    const t = sanitizeTag(tagFilter);
    if (t) merged.tag = t;
  }

  const source = viewFilters.source;
  if (!merged.source && typeof source === 'string' && isLeadSource(source)) {
    merged.source = source;
  }

  const status = viewFilters.status;
  if (!merged.status && typeof status === 'string' && isStatus(status)) {
    merged.status = status;
  }

  return merged;
}

export type LeadOrgScope = {
  spaceId: string;
  /** Space.ownerId — the workspace owner. */
  ownerId: string;
};

/**
 * Apply parsed lead-org filters to an already space-scoped Contact query.
 * Ownership is the space: a matching owner is a no-op; a foreign owner
 * forces zero rows without leaving this spaceId.
 */
export function applyLeadOrgFilters<Q>(
  query: Q,
  filters: LeadOrgFilters,
  scope: LeadOrgScope,
  now: Date = new Date(),
): Q {
  // Cast once: Q is a PostgREST chain (or a test stub) that implements the
  // methods we call. Returning Q keeps .order / .range / .limit on the caller.
  let q: LeadOrgQuery = query as LeadOrgQuery;

  if (filters.owner && filters.owner !== scope.spaceId && filters.owner !== scope.ownerId) {
    q = q.eq('id', LEAD_ORG_EMPTY_ID);
  }

  if (filters.stage) q = q.eq('type', filters.stage);
  if (filters.segment) q = q.eq('leadType', filters.segment);
  if (filters.source) q = q.eq('source', filters.source);
  if (filters.scoreLabel) q = q.eq('scoreLabel', filters.scoreLabel);

  const allTags = [filters.tag, ...(filters.tags ?? [])].filter(
    (t): t is string => typeof t === 'string' && t.length > 0,
  );
  for (const tag of allTags) {
    q = q.contains('tags', [tag]);
  }

  if (filters.status === 'archived') {
    q = q.gte('snoozedUntil', CONTACT_ARCHIVE_UNTIL);
  } else if (filters.status === 'snoozed') {
    q = q.gt('snoozedUntil', now.toISOString()).lt('snoozedUntil', CONTACT_ARCHIVE_UNTIL);
  } else if (filters.status === 'active' || filters.status == null) {
    // Default People view: hide currently-snoozed / archived rows.
    if (filters.status === 'active') {
      q = q.or(`snoozedUntil.is.null,snoozedUntil.lte.${now.toISOString()}`);
    }
  }
  // status === 'all' → no snooze predicate

  return q as Q;
}
