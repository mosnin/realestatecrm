'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  List,
} from 'lucide-react';
import Link from 'next/link';
import { formatCompact } from '@/lib/formatting';

export interface RealtorRow {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  onboard: boolean;
  role: string;
  joinedAt: string;
  spaceId: string | null;
  spaceSlug: string | null;
  leads: number;
  contacts: number;
  deals: number;
  pipeline: number;
  /** hot leads (leadScore >= 70) */
  hotLeads: number;
}

type SortKey = 'name' | 'leads' | 'contacts' | 'deals' | 'pipeline' | 'hotLeads' | 'joined';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'active' | 'pending';
type ViewMode = 'cards' | 'table';

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  leads: 'Leads',
  contacts: 'Contacts',
  deals: 'Deals',
  pipeline: 'Pipeline',
  hotLeads: 'Hot leads',
  joined: 'Joined',
};

function roleLabel(role: string) {
  if (role === 'broker_owner') return 'Owner';
  if (role === 'broker_manager') return 'Manager';
  return 'Realtor';
}

function initials(name: string | null, email: string) {
  return (name || email || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function SortButton({
  col,
  current,
  dir,
  onSort,
}: {
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = col === current;
  return (
    <button
      onClick={() => onSort(col)}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
      }`}
    >
      {SORT_LABELS[col]}
      {active ? (
        dir === 'desc' ? (
          <ArrowDown size={11} />
        ) : (
          <ArrowUp size={11} />
        )
      ) : (
        <ArrowUpDown size={11} className="opacity-40" />
      )}
    </button>
  );
}

export function RealtorsClient({ realtors }: { realtors: RealtorRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('pipeline');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<ViewMode>('cards');

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const filtered = realtors.filter((r) => {
      if (statusFilter === 'active') return r.onboard;
      if (statusFilter === 'pending') return !r.onboard;
      return true;
    });

    return [...filtered].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case 'name':
          va = (a.name || a.email).toLowerCase();
          vb = (b.name || b.email).toLowerCase();
          return sortDir === 'asc' ? va.localeCompare(vb as string) : vb.localeCompare(va as string);
        case 'leads':       va = a.leads;     vb = b.leads;     break;
        case 'contacts':    va = a.contacts;  vb = b.contacts;  break;
        case 'deals':       va = a.deals;     vb = b.deals;     break;
        case 'pipeline':    va = a.pipeline;  vb = b.pipeline;  break;
        case 'hotLeads':    va = a.hotLeads;  vb = b.hotLeads;  break;
        case 'joined':
          va = new Date(a.joinedAt).getTime();
          vb = new Date(b.joinedAt).getTime();
          break;
        default: return 0;
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [realtors, sortKey, sortDir, statusFilter]);

  const activeCount = realtors.filter((r) => r.onboard).length;
  const pendingCount = realtors.filter((r) => !r.onboard).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {/* Sort pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium mr-0.5">Sort:</span>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <SortButton key={k} col={k} current={sortKey} dir={sortDir} onSort={handleSort} />
          ))}
        </div>

        {/* Status filter + view toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {(['all', 'active', 'pending'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 transition-colors ${
                  statusFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {f === 'all' ? `All (${realtors.length})` : f === 'active' ? `Active (${activeCount})` : `Pending (${pendingCount})`}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setView('cards')}
              className={`p-1.5 transition-colors ${view === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView('table')}
              className={`p-1.5 transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <List size={14} />
            </button>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">No realtors match the current filter.</p>
          </CardContent>
        </Card>
      ) : view === 'cards' ? (
        <CardGrid rows={sorted} sortKey={sortKey} />
      ) : (
        <TableView rows={sorted} sortKey={sortKey} onSort={handleSort} sortDir={sortDir} />
      )}

      <p className="text-xs text-muted-foreground text-right">
        Showing {sorted.length} of {realtors.length} members
      </p>
    </div>
  );
}

// ── Card Grid ─────────────────────────────────────────────────────────────────

function CardGrid({ rows, sortKey }: { rows: RealtorRow[]; sortKey: SortKey }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {rows.map((r, i) => (
        <RealtorCard key={r.membershipId} row={r} rank={i + 1} sortKey={sortKey} />
      ))}
    </div>
  );
}

function RealtorCard({ row, rank, sortKey }: { row: RealtorRow; rank: number; sortKey: SortKey }) {
  const joinedAt = new Date(row.joinedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const stats: { key: SortKey; label: string; value: string | number }[] = [
    { key: 'leads',    label: 'Leads',     value: row.leads },
    { key: 'hotLeads', label: 'Hot leads', value: row.hotLeads },
    { key: 'contacts', label: 'Contacts',  value: row.contacts },
    { key: 'deals',    label: 'Deals',     value: row.deals },
    { key: 'pipeline', label: 'Pipeline',  value: formatCompact(row.pipeline) },
  ];

  return (
    <Card className="flex flex-col">
      <CardContent className="px-5 py-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Rank badge */}
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                {initials(row.name, row.email)}
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-muted border border-background text-[9px] font-bold text-muted-foreground flex items-center justify-center">
                {rank}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{row.name ?? 'No name'}</p>
              <p className="text-xs text-muted-foreground truncate">{row.email}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {row.onboard ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                <CheckCircle2 size={10} /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                <AlertCircle size={10} /> Pending
              </span>
            )}
            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">
              {roleLabel(row.role)}
            </span>
          </div>
        </div>

        {/* Stats grid — highlight the active sort column */}
        <div className="grid grid-cols-2 gap-2">
          {stats.map(({ key, label, value }) => (
            <div
              key={key}
              className={`rounded-lg px-3 py-2.5 transition-colors ${
                key === sortKey
                  ? 'bg-primary/10 ring-1 ring-primary/20'
                  : 'bg-muted/50'
              }`}
            >
              <p className={`text-[10px] font-medium uppercase tracking-wide ${key === sortKey ? 'text-primary' : 'text-muted-foreground'}`}>
                {label}
              </p>
              <p className={`text-lg font-bold mt-0.5 tabular-nums ${key === sortKey ? 'text-primary' : ''}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1 border-t border-border">
          <p className="text-[11px] text-muted-foreground">Joined {joinedAt}</p>
          {row.spaceSlug ? (
            <Link
              href={`/s/${row.spaceSlug}`}
              className="inline-flex items-center gap-1 text-[11px] text-primary font-medium hover:underline underline-offset-2"
            >
              View workspace <ExternalLink size={10} />
            </Link>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">No workspace yet</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Table View ────────────────────────────────────────────────────────────────

function TableView({
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
  function Th({ col, label, className = '' }: { col: SortKey; label: string; className?: string }) {
    const active = col === sortKey;
    return (
      <th
        className={`px-4 py-3 text-left cursor-pointer select-none group ${className}`}
        onClick={() => onSort(col)}
      >
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
          {label}
          {active ? (
            sortDir === 'desc' ? <ArrowDown size={11} /> : <ArrowUp size={11} />
          ) : (
            <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-40" />
          )}
        </span>
      </th>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left w-8">
                <span className="text-xs font-semibold text-muted-foreground">#</span>
              </th>
              <Th col="name" label="Realtor" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">
                Role
              </th>
              <Th col="leads" label="Leads" className="text-right [&>span]:justify-end" />
              <Th col="hotLeads" label="Hot" className="text-right [&>span]:justify-end hidden md:table-cell" />
              <Th col="contacts" label="Contacts" className="text-right [&>span]:justify-end hidden lg:table-cell" />
              <Th col="deals" label="Deals" className="text-right [&>span]:justify-end" />
              <Th col="pipeline" label="Pipeline" className="text-right [&>span]:justify-end hidden sm:table-cell" />
              <Th col="joined" label="Joined" className="hidden lg:table-cell" />
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const joinedAt = new Date(r.joinedAt).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: '2-digit',
              });
              return (
                <tr
                  key={r.membershipId}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold text-primary flex-shrink-0">
                        {initials(r.name, r.email)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-xs truncate">{r.name ?? 'No name'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                      {roleLabel(r.role)}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${sortKey === 'leads' ? 'text-primary' : ''}`}>
                    {r.leads}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs hidden md:table-cell ${sortKey === 'hotLeads' ? 'text-primary' : ''}`}>
                    {r.hotLeads > 0 ? (
                      <span className="text-rose-600 font-semibold">{r.hotLeads}</span>
                    ) : (
                      <span className="text-muted-foreground">{r.hotLeads}</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs hidden lg:table-cell ${sortKey === 'contacts' ? 'text-primary' : ''}`}>
                    {r.contacts}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs font-semibold ${sortKey === 'deals' ? 'text-primary' : ''}`}>
                    {r.deals}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums text-xs hidden sm:table-cell ${sortKey === 'pipeline' ? 'text-primary' : ''}`}>
                    {formatCompact(r.pipeline)}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className={`text-[11px] text-muted-foreground ${sortKey === 'joined' ? 'text-primary font-medium' : ''}`}>
                      {joinedAt}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.onboard ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15">
                        <CheckCircle2 size={9} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15">
                        <AlertCircle size={9} /> Pending
                      </span>
                    )}
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
