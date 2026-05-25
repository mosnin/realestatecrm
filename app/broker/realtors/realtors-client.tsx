'use client';

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X, Check, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';
import { cn } from '@/lib/utils';

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

type SortKey = 'name' | 'people' | 'deals' | 'pipeline';
type SortDir = 'asc' | 'desc';

function initials(name: string | null, email: string) {
  return (name || email || '?')
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

// Inline response-time pill. Hand-rolled per STYLESHEET.md:472 — the only
// place we leave the neutral palette. Tones:
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
    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums';

  if (band === 'no_data') {
    return (
      <span className={cn(baseClass, 'bg-muted text-muted-foreground')}>—</span>
    );
  }

  const hours = avgHours ?? 0;
  // Format: <1h → "<1h avg", whole hours otherwise. The pill earns its space
  // by being scannable — three characters of number + "h avg" is the budget.
  const label = hours < 1
    ? '<1h avg'
    : `${Math.round(hours)}h avg`;

  if (band === 'fast') {
    return (
      <span
        className={cn(
          baseClass,
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
        )}
      >
        <Check size={10} aria-hidden />
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
        {label}
      </span>
    );
  }

  return (
    <span className={cn(baseClass, 'bg-muted text-muted-foreground')}>
      {label}
    </span>
  );
}

export function RealtorsClient({ realtors }: { realtors: RealtorRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pipeline');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

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
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [realtors, sortKey, sortDir, searchQuery]);

  return (
    <div className="space-y-3">
      {/* Search — the only chrome. Status filter, view toggle, sort pill row all cut. */}
      <div className="relative w-full sm:w-64">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search realtors…"
          className="h-9 w-full rounded-lg border border-border bg-muted/60 pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:bg-background transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No realtors match.
        </p>
      ) : (
        <Table rows={sorted} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

function Table({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: RealtorRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  function Th({
    col,
    label,
    align = 'left',
  }: {
    col: SortKey;
    label: string;
    align?: 'left' | 'right';
  }) {
    const active = col === sortKey;
    return (
      <th
        className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none group`}
        onClick={() => onSort(col)}
      >
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider ${
            active
              ? 'text-foreground'
              : 'text-muted-foreground group-hover:text-foreground'
          }`}
        >
          {label}
          {active ? (
            sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
          ) : (
            <ArrowUpDown size={11} className="opacity-0 group-hover:opacity-40" />
          )}
        </span>
      </th>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th col="name" label="Realtor" />
              <Th col="people" label="People" align="right" />
              <Th col="deals" label="Deals" align="right" />
              <Th col="pipeline" label="Pipeline" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // URL-encode the realtor's display name into the chat prompt.
              // /broker/chippi reads `?prompt=` and seeds it as initialPrefill
              // — broker can edit before sending, never auto-fires.
              const displayName = r.name ?? r.email;
              const chippiHref = `/broker/chippi?prompt=${encodeURIComponent(
                `Tell me about ${displayName}`,
              )}`;

              return (
                <tr
                  key={r.membershipId}
                  className="group/row border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Link
                        href={`/broker/realtors/${r.userId}`}
                        className="flex items-center gap-3 min-w-0 group flex-1"
                      >
                        <div className="relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                          {initials(r.name, r.email)}
                          {!r.onboard && (
                            <span
                              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 border border-background"
                              title="Pending invite"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                              {r.name ?? r.email}
                            </p>
                            <ResponseTimePill
                              avgHours={r.responseAvgHours}
                              band={r.responseBand}
                            />
                          </div>
                          {r.name && (
                            <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                          )}
                        </div>
                      </Link>
                      {/* Hover-reveal on desktop, always visible on mobile —
                          the action is one tap, no need to chase it. */}
                      <Link
                        href={chippiHref}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          'flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground transition-all',
                          'hover:bg-muted hover:text-foreground',
                          'opacity-100 md:opacity-0 md:group-hover/row:opacity-100',
                          'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        )}
                        title={`Ask Chippi about ${displayName}`}
                        aria-label={`Ask Chippi about ${displayName}`}
                      >
                        <MessageCircle size={14} aria-hidden />
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {r.people}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm font-medium">
                    {r.deals}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-sm">
                    {r.pipeline > 0 ? formatCompact(r.pipeline) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
