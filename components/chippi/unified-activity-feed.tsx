'use client';

/**
 * UnifiedActivityFeed — the single, filterable "what Chippi did" timeline.
 *
 * Replaces the old split between /chippi/history (Chippi's own actions) and
 * /chippi/triggers (connected-app events). Eight sources are merged + sorted by
 * the data layer (lib/activity/*) and served by GET /api/chippi/activity as a
 * normalized `UnifiedActivityItem[]` + a keyset `nextCursor`. This component is
 * purely the face: it owns the filter state, fetches page 1 on any filter
 * change, appends "load older" pages via the cursor, and renders one calm,
 * scannable list — kind icon, title, summary, status pill, relative time, and
 * an outbound link when the item carries a structured `link` hint.
 *
 * Styling mirrors the house feeds (components/triggers/activity-feed.tsx and
 * components/chippi/activity-feed.tsx): divide-y rows, icon + text, a status
 * pill, a right-aligned `timeAgo`, the muted/foreground vocabulary.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Loader2,
  ChevronRight,
  Search,
  Sparkles,
  Send,
  PencilLine,
  Workflow,
  CalendarClock,
  Plug,
  Repeat,
  Mail,
  CheckCircle2,
  Clock3,
  CircleX,
  MinusCircle,
  Info,
  SlidersHorizontal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { SECTION_LABEL } from '@/lib/typography';
import { groupActivityByDay } from '@/lib/activity/group';
import type {
  ActivityKind,
  ActivityStatus,
  ActivityTone,
  ActivityLink,
  UnifiedActivityItem,
} from '@/lib/activity/types';

const PAGE_LIMIT = 50;

// ── Link resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a structured `link` hint to a slug-scoped href. The data layer never
 * knows the space slug, so it emits `{ kind, id? }`; the UI builds the path.
 *
 * Pure + exported so it can be unit-tested without a DOM. Returns `null` for a
 * missing link, an unknown kind, or a kind that needs an id but didn't get one
 * — the caller renders no link rather than a broken href.
 */
export function resolveLink(
  link: ActivityLink | undefined,
  slug: string,
): string | null {
  if (!link || !slug) return null;
  const base = `/s/${slug}`;
  switch (link.kind) {
    case 'contact':
      return link.id ? `${base}/contacts/${link.id}` : null;
    case 'deal':
      return link.id ? `${base}/deals/${link.id}` : null;
    case 'workflow':
      return `${base}/workflows`;
    case 'inbox':
      return `${base}/chippi/inbox`;
    case 'integrations':
      return `${base}/chippi/integrations`;
    case 'routines':
      return `${base}/routines`;
    default:
      return null;
  }
}

// ── Kind metadata ─────────────────────────────────────────────────────────────

interface KindMeta {
  /** Friendly label used by the filter chips. */
  label: string;
  icon: LucideIcon;
}

const KIND_META: Record<ActivityKind, KindMeta> = {
  agent_action: { label: 'Actions', icon: Sparkles },
  agent_dispatch: { label: 'Dispatches', icon: Send },
  draft: { label: 'Drafts', icon: PencilLine },
  workflow_run: { label: 'Workflows', icon: Workflow },
  scheduled_message: { label: 'Scheduled', icon: CalendarClock },
  integration_event: { label: 'App events', icon: Plug },
  routine_run: { label: 'Routines', icon: Repeat },
  outbound_message: { label: 'Sends', icon: Mail },
};

/** Filter chip order — "All" is prepended in the bar itself. */
const KIND_ORDER: ActivityKind[] = [
  'agent_action',
  'agent_dispatch',
  'draft',
  'workflow_run',
  'scheduled_message',
  'integration_event',
  'routine_run',
  'outbound_message',
];

// ── Status metadata ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ActivityStatus, string> = {
  success: 'Success',
  pending: 'Pending',
  failed: 'Failed',
  skipped: 'Skipped',
  info: 'Info',
};

const TONE_PILL: Record<ActivityTone, string> = {
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400',
  muted: 'bg-foreground/[0.05] text-muted-foreground',
};

const STATUS_ICON: Record<ActivityStatus, LucideIcon> = {
  success: CheckCircle2,
  pending: Clock3,
  failed: CircleX,
  skipped: MinusCircle,
  info: Info,
};

/** Status filter — a subset (the four the realtor reasons about), plus All. */
const STATUS_FILTERS: ActivityStatus[] = ['success', 'pending', 'failed', 'skipped'];

// ── Date range presets ────────────────────────────────────────────────────────

type RangePreset = 'all' | 'today' | '7d' | '30d';

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

/** Translate a preset to an ISO `since` lower bound (or null for "all time"). */
function sinceForPreset(preset: RangePreset): string | null {
  if (preset === 'all') return null;
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  const days = preset === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status, tone }: { status: ActivityStatus; tone: ActivityTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 flex-shrink-0',
        TONE_PILL[tone],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── Feed row ──────────────────────────────────────────────────────────────────

function FeedRow({ item, slug }: { item: UnifiedActivityItem; slug: string }) {
  const meta = KIND_META[item.kind];
  const KindIcon = meta?.icon ?? Info;
  const StatusIcon = STATUS_ICON[item.status] ?? Info;
  const href = resolveLink(item.link, slug);

  const body = (
    <>
      <div
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
          TONE_PILL[item.tone],
        )}
      >
        <KindIcon size={14} aria-hidden />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground leading-snug truncate">
            {item.title}
          </p>
          <StatusIcon
            size={11}
            aria-hidden
            className={cn(
              'flex-shrink-0',
              item.tone === 'green' && 'text-emerald-600 dark:text-emerald-400',
              item.tone === 'amber' && 'text-amber-600 dark:text-amber-400',
              item.tone === 'rose' && 'text-rose-600 dark:text-rose-400',
              item.tone === 'muted' && 'text-muted-foreground',
            )}
          />
          <span className="text-[11px] tabular-nums text-muted-foreground/70 ml-auto flex-shrink-0">
            {timeAgo(item.occurredAt)}
          </span>
          {href && (
            <ChevronRight
              size={13}
              aria-hidden
              className="flex-shrink-0 text-muted-foreground/60 group-hover/row:text-foreground transition-colors"
            />
          )}
        </div>
        {item.summary && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {item.summary}
          </p>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {meta?.label ?? item.kind}
          </span>
          <StatusPill status={item.status} tone={item.tone} />
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <li className="group/row">
        <Link
          href={href}
          className="flex items-start gap-3 py-4 first:pt-0 hover:bg-foreground/[0.02] -mx-2 px-2 rounded-md transition-colors"
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li className="group/row flex items-start gap-3 py-4 first:pt-0">{body}</li>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex items-center h-7 px-3 rounded-full text-xs font-medium transition-colors',
        selected
          ? 'bg-foreground text-background'
          : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

// ── Digest ────────────────────────────────────────────────────────────────────

/**
 * A one-line, at-a-glance reading of what's currently loaded — total plus the
 * few counts a realtor scans for (drafts waiting, messages sent, anything that
 * failed). Reflects the loaded set; empty string when there's nothing to show.
 */
function summarizeFeed(items: UnifiedActivityItem[]): string {
  if (items.length === 0) return '';
  let drafts = 0;
  let sent = 0;
  let failed = 0;
  for (const i of items) {
    if (i.kind === 'draft') drafts += 1;
    if (i.kind === 'outbound_message') sent += 1;
    if (i.status === 'failed') failed += 1;
  }
  const parts = [`${items.length} ${items.length === 1 ? 'event' : 'events'}`];
  if (drafts) parts.push(`${drafts} ${drafts === 1 ? 'draft' : 'drafts'}`);
  if (sent) parts.push(`${sent} sent`);
  if (failed) parts.push(`${failed} failed`);
  return parts.join(' · ');
}

// ── Main component ────────────────────────────────────────────────────────────

interface ApiResponse {
  items: UnifiedActivityItem[];
  nextCursor: string | null;
}

export function UnifiedActivityFeed() {
  const params = useParams();
  const slug = (params?.slug as string | undefined) ?? '';

  // Filter state. Any change refetches from page 1.
  const [kind, setKind] = useState<ActivityKind | null>(null);
  const [status, setStatus] = useState<ActivityStatus | null>(null);
  const [range, setRange] = useState<RangePreset>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced value that drives fetches
  const [showFilters, setShowFilters] = useState(false); // Type/Status drawer

  // Feed state.
  const [items, setItems] = useState<UnifiedActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  // Guards against a stale page-1 response clobbering a newer one when filters
  // change rapidly. Each fetch tags itself; only the latest commits.
  const requestSeq = useRef(0);

  // Debounce the search box → `search` param (300ms).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  /** Build the query string for the active filters (+ optional cursor). */
  const buildParams = useCallback(
    (before?: string | null) => {
      const p = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (kind) p.set('kinds', kind);
      if (status) p.set('statuses', status);
      const since = sinceForPreset(range);
      if (since) p.set('since', since);
      if (search) p.set('search', search);
      if (before) p.set('before', before);
      return p.toString();
    },
    [kind, status, range, search],
  );

  // Page 1: runs on mount and whenever a filter changes.
  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await fetch(`/api/chippi/activity?${buildParams()}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as ApiResponse;
        if (seq !== requestSeq.current) return; // a newer fetch superseded us
        setItems(data.items ?? []);
        setNextCursor(data.nextCursor ?? null);
      } catch {
        if (seq !== requestSeq.current) return;
        setError(true);
        setItems([]);
        setNextCursor(null);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    })();
  }, [buildParams]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/chippi/activity?${buildParams(nextCursor)}`);
      if (!res.ok) return;
      const data = (await res.json()) as ApiResponse;
      const batch = data.items ?? [];
      // Dedupe by id — the source-prefixed id is globally unique.
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const fresh = batch.filter((i) => !seen.has(i.id));
        return fresh.length > 0 ? [...prev, ...fresh] : prev;
      });
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // Keep what's loaded.
    } finally {
      setLoadingMore(false);
    }
  }, [buildParams, loadingMore, nextCursor]);

  const hasFilters = useMemo(
    () => Boolean(kind || status || range !== 'all' || search),
    [kind, status, range, search],
  );

  // Number of active Type/Status facets — drives the "Filters" button badge and
  // forces the drawer open so an active facet is never hidden.
  const activeFacetCount = useMemo(
    () => (kind ? 1 : 0) + (status ? 1 : 0),
    [kind, status],
  );
  const filtersOpen = showFilters || activeFacetCount > 0;

  // Group the loaded feed into Today / Yesterday / weekday buckets so it reads
  // as a story, and derive a one-line digest of what's on screen.
  const groups = useMemo(() => groupActivityByDay(items), [items]);
  const digest = useMemo(() => summarizeFeed(items), [items]);

  return (
    <div className="space-y-6">
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Search + a Filters toggle that hides the heavier facets until asked. */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search activity…"
              aria-label="Search activity"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-foreground/[0.04] text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-1 focus:ring-foreground/20"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={filtersOpen}
            aria-label="Toggle type and status filters"
            className={cn(
              'inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors',
              filtersOpen
                ? 'bg-foreground/[0.07] text-foreground'
                : 'bg-foreground/[0.04] text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal size={13} aria-hidden />
            Filters
            {activeFacetCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                {activeFacetCount}
              </span>
            )}
          </button>
        </div>

        {/* When — the most-used facet, always inline and compact. */}
        <div
          role="group"
          aria-label="Filter by date range"
          className="flex items-center gap-1.5 flex-wrap"
        >
          {RANGE_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={range === opt.value}
              onClick={() => setRange(opt.value)}
            />
          ))}
        </div>

        {/* Type + Status — tucked into a drawer, force-shown when one is active. */}
        {filtersOpen && (
          <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-3">
            <div className="space-y-1.5">
              <p className={SECTION_LABEL}>Type</p>
              <div
                role="group"
                aria-label="Filter by type"
                className="flex items-center gap-1.5 flex-wrap"
              >
                <Chip label="All" selected={kind === null} onClick={() => setKind(null)} />
                {KIND_ORDER.map((k) => (
                  <Chip
                    key={k}
                    label={KIND_META[k].label}
                    selected={kind === k}
                    onClick={() => setKind(k)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className={SECTION_LABEL}>Status</p>
              <div
                role="group"
                aria-label="Filter by status"
                className="flex items-center gap-1.5 flex-wrap"
              >
                <Chip
                  label="All"
                  selected={status === null}
                  onClick={() => setStatus(null)}
                />
                {STATUS_FILTERS.map((s) => (
                  <Chip
                    key={s}
                    label={STATUS_LABEL[s]}
                    selected={status === s}
                    onClick={() => setStatus(s)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Feed ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading activity">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted/40 animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-muted/30 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-8 text-center">
          <p className="text-sm text-foreground">Couldn&apos;t load activity.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Something went wrong. Try a filter, or refresh.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">
            {hasFilters ? 'No activity matches these filters.' : 'Nothing yet.'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasFilters
              ? 'Try widening the type, status, or date range.'
              : "When Chippi acts, it'll show up here."}
          </p>
        </div>
      ) : (
        <>
          {/* At-a-glance digest of what's loaded. */}
          {digest && (
            <p className="text-[11px] tabular-nums text-muted-foreground/70">{digest}</p>
          )}

          {/* Day-grouped timeline — Today / Yesterday / weekday headers. */}
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className={SECTION_LABEL}>{group.label}</h3>
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">
                    {group.items.length}
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  {group.items.map((item) => (
                    <FeedRow key={item.id} item={item} slug={slug} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {loadingMore && <Loader2 size={12} className="animate-spin" />}
                {loadingMore ? 'Loading…' : 'Load older'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
