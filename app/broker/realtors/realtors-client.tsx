'use client';

import { useState, useMemo } from 'react';
import { Search, X, Check, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { formatCompact, getInitials } from '@/lib/formatting';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RealtorRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  onboard: boolean;
  role: string;
  spaceSlug: string | null;
  /** Total people on file (excludes application-link tags). */
  people: number;
  /** Deal count. */
  deals: number;
  /** Sum of deal values. */
  pipeline: number;
  /** Avg first-response hours over the last 7 days, null when no samples. */
  responseAvgHours: number | null;
  /** Band relative to team median (mirrors agent/tools/broker/performance.py). */
  responseBand: 'fast' | 'on_pace' | 'slow' | 'no_data';
}

type SortKey = 'pipeline' | 'deals' | 'people' | 'name';

const SORT_LABELS: Record<SortKey, string> = {
  pipeline: 'Pipeline',
  deals: 'Deals',
  people: 'People',
  name: 'Name A–Z',
};

const roleLabel = (role: string) =>
  role === 'broker_owner' ? 'Owner' : role === 'broker_admin' ? 'Admin' : 'Realtor';

// Role pill — small caps, muted bg. Same vocabulary as the contacts stage
// pill so the broker surface feels like the realtor surface.
const rolePillClass =
  'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 bg-muted text-muted-foreground';

// Inline response-time pill. Hand-rolled per STYLESHEET.md §Badges & pills —
// the only place we leave the neutral palette. Tones:
//   fast   → emerald (responded, sanctioned green)
//   slow   → amber   (NOT rose; rose is destructive — slow is "needs nudge",
//                     not "broken")
//   on_pace / no_data → muted
function ResponseTimePill({
  avgHours,
  band,
}: {
  avgHours: number | null;
  band: RealtorRow['responseBand'];
}) {
  const baseClass =
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums flex-shrink-0';

  if (band === 'no_data') return null;

  const hours = avgHours ?? 0;
  const label = hours < 1 ? '<1h' : `${Math.round(hours)}h`;

  if (band === 'fast') {
    return (
      <span
        className={cn(
          baseClass,
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
        )}
      >
        <Check size={9} aria-hidden />
        {label}
      </span>
    );
  }

  if (band === 'slow') {
    return (
      <span
        className={cn(
          baseClass,
          'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
        )}
      >
        {label} avg
      </span>
    );
  }

  return (
    <span className={cn(baseClass, 'bg-muted text-muted-foreground')}>{label}</span>
  );
}

export function RealtorsClient({ realtors }: { realtors: RealtorRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');

  const sorted = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const filtered = q
      ? realtors.filter(
          (r) =>
            (r.name ?? '').toLowerCase().includes(q) ||
            r.email.toLowerCase().includes(q),
        )
      : realtors;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') {
        const va = (a.name || a.email).toLowerCase();
        const vb = (b.name || b.email).toLowerCase();
        return va.localeCompare(vb);
      }
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return vb - va;
    });
  }, [realtors, sortKey, searchQuery]);

  return (
    <div className="space-y-3">
      {/* Search + sort. One row, no Card wrapper, no column headers — the
          metric for sort is right-aligned on every row so the eye finds it
          without a header label. */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 sm:flex-initial min-w-[160px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search realtors…"
            className="h-9 w-full sm:w-64 rounded-md border border-border/70 bg-background pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors ml-auto"
            >
              <span className="text-muted-foreground">Sort:</span>
              {SORT_LABELS[sortKey]}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onSelect={() => setSortKey(key)}
                className={cn('text-xs', sortKey === key && 'font-semibold')}
              >
                {SORT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          Nobody matches.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {sorted.map((r) => {
            const displayName = r.name ?? r.email;
            // /broker/chippi reads `?prompt=` and seeds it as initialPrefill
            // — broker can edit before sending, never auto-fires.
            const chippiHref = `/broker/chippi?prompt=${encodeURIComponent(
              `Tell me about ${displayName}`,
            )}`;
            return (
              <li
                key={r.membershipId}
                className="group/row flex items-center gap-3 py-3"
              >
                <Link
                  href={`/broker/realtors/${r.userId}`}
                  className="flex items-center gap-3 min-w-0 flex-1 -mx-2 px-2 py-0.5 rounded-md hover:bg-foreground/[0.04] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {getInitials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">
                        {displayName}
                      </span>
                      <span className={rolePillClass}>{roleLabel(r.role)}</span>
                      {!r.onboard && (
                        <span className="inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                          Pending
                        </span>
                      )}
                      <ResponseTimePill
                        avgHours={r.responseAvgHours}
                        band={r.responseBand}
                      />
                    </div>
                    {/* Right-aligned metric line — the sort key reads
                        "loudest" on the row. Pipeline + deals + people in
                        one muted sentence; an empty pipeline shows a dash. */}
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {r.pipeline > 0 ? formatCompact(r.pipeline) : '—'} pipeline
                      <span className="text-muted-foreground/40"> · </span>
                      {r.deals} {r.deals === 1 ? 'deal' : 'deals'}
                      <span className="text-muted-foreground/40"> · </span>
                      {r.people} {r.people === 1 ? 'person' : 'people'}
                    </p>
                  </div>
                </Link>
                {/* Ask Chippi — hover-revealed on lg+, always visible on
                    small screens (touch needs the target). */}
                <Link
                  href={chippiHref}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    'flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground transition-all',
                    'hover:bg-muted hover:text-foreground',
                    'opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100',
                    'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  )}
                  aria-label={`Ask Chippi about ${displayName}`}
                  title={`Ask Chippi about ${displayName}`}
                >
                  <MessageCircle size={14} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
