'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search, Home as HomeIcon, Loader2, Building2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property, PropertyListingStatus } from '@/lib/types';
import { formatCurrency, formatCompact } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';
import { useRowNavigation } from '@/lib/hooks/use-row-navigation';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  H1,
  H2,
  H3,
  TITLE_FONT,
  STAT_NUMBER,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  PAGE_RHYTHM,
  PRIMARY_PILL,
} from '@/lib/typography';
import { PropertyForm } from './property-form';

// Subtle status pill palette — matches the locked design language.
// active   → "Live"
// pending  → "Pending"
// sold     → "Closed"
// off_market → "Withdrawn"
// owned    → "Owned"
const STATUS_LABEL: Record<PropertyListingStatus, string> = {
  active: 'Live',
  pending: 'Pending',
  sold: 'Closed',
  off_market: 'Withdrawn',
  owned: 'Owned',
};

const STATUS_PILL: Record<PropertyListingStatus, string> = {
  active: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400',
  pending: 'text-amber-700 bg-amber-500/10 dark:text-amber-400',
  sold: 'text-muted-foreground bg-foreground/[0.06]',
  off_market: 'text-rose-700 bg-rose-500/10 dark:text-rose-400',
  owned: 'text-muted-foreground bg-foreground/[0.06]',
};

type ChipKey = 'all' | PropertyListingStatus;

interface Stats {
  closedYtd: number;
  closedCount: number;
  liveCount: number;
  pipelineValue: number;
  pipelinePropertyCount: number;
}

interface Props {
  slug: string;
  initial: Property[];
  stats: Stats;
}

type SortKey = 'recent' | 'price-high' | 'price-low' | 'address';

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recently updated',
  'price-high': 'Price: high to low',
  'price-low': 'Price: low to high',
  address: 'Address A–Z',
};

export function PropertiesClient({ slug, initial, stats }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Property[]>(initial);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<ChipKey>('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Counts per status — live, no recompute needed during interaction.
  const counts = useMemo(() => {
    const c: Record<ChipKey, number> = {
      all: items.length,
      active: 0,
      pending: 0,
      sold: 0,
      off_market: 0,
      owned: 0,
    };
    for (const p of items) c[p.listingStatus]++;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let list = items.filter((p) => {
      if (statusFilter !== 'all' && p.listingStatus !== statusFilter) return false;
      if (!query) return true;
      const hay =
        `${p.address} ${p.unitNumber ?? ''} ${p.city ?? ''} ${p.mlsNumber ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
    if (sortBy === 'price-high') {
      list = [...list].sort((a, b) => (b.listPrice ?? -1) - (a.listPrice ?? -1));
    } else if (sortBy === 'price-low') {
      list = [...list].sort((a, b) => (a.listPrice ?? Infinity) - (b.listPrice ?? Infinity));
    } else if (sortBy === 'address') {
      list = [...list].sort((a, b) => a.address.localeCompare(b.address));
    } else {
      list = [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    return list;
  }, [items, q, statusFilter, sortBy]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const { focusedId, containerRef } = useRowNavigation(filteredIds, (id) => {
    router.push(`/s/${slug}/properties/${id}`);
  });

  async function onCreate(values: Partial<Property>) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't create that property.");
        return;
      }
      const created: Property = await res.json();
      setItems((prev) => [created, ...prev]);
      setCreating(false);
      toast.success('Property added.');
    } finally {
      setSubmitting(false);
    }
  }

  const chips: { key: ChipKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Live', count: counts.active },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'sold', label: 'Closed', count: counts.sold },
    { key: 'off_market', label: 'Withdrawn', count: counts.off_market },
  ];

  const isFreshWorkspace = items.length === 0;

  return (
    <div className={PAGE_RHYTHM}>
      {/* Header — title + canonical primary pill */}
      <header className="flex items-end justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Properties
        </h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={PRIMARY_PILL}
        >
          <Plus size={14} strokeWidth={2.25} />
          Add property
        </button>
      </header>

      {/* Stat strip — paper-flat, hairline-divided */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell
          value={<AnimatedNumber value={stats.closedYtd} format={formatCompact} />}
          label="Closed YTD"
          sub={`${stats.closedCount} closed deal${stats.closedCount === 1 ? '' : 's'}`}
        />
        <StatCell
          value={<AnimatedNumber value={stats.liveCount} />}
          label="Live now"
          sub={stats.liveCount === 1 ? 'live listing' : 'live listings'}
        />
        <StatCell
          value={<AnimatedNumber value={stats.pipelineValue} format={formatCompact} />}
          label="Pipeline value"
          sub={`across ${stats.pipelinePropertyCount} active deal${stats.pipelinePropertyCount === 1 ? '' : 's'}`}
        />
      </div>

      {/* Filter chips + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {chips.map((chip) => {
            const active = statusFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setStatusFilter(chip.key)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-3 h-7 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                )}
                aria-pressed={active}
              >
                {chip.label}
                <span
                  className={cn(
                    'tabular-nums text-[11px]',
                    active ? 'opacity-70' : 'opacity-60',
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search address, city, MLS#"
              className="pl-9 pr-3 h-9 w-64 text-sm rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-150"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
              >
                <span className="text-muted-foreground">Sort:</span>
                {SORT_LABELS[sortBy]}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => setSortBy(key)}
                  className={cn(sortBy === key && 'font-semibold')}
                >
                  {SORT_LABELS[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState isFresh={isFreshWorkspace} onAdd={() => setCreating(true)} />
      ) : (
        <div
          ref={containerRef}
          className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70"
        >
          {/* Table header — md+ only */}
          <div className="hidden md:grid grid-cols-[minmax(0,2.5fr)_90px_120px_140px_70px_28px] items-center gap-3 px-5 py-2.5 bg-foreground/[0.02] border-b border-border/70">
            <span className={SECTION_LABEL}>Address</span>
            <span className={SECTION_LABEL}>Status</span>
            <span className={cn(SECTION_LABEL, 'text-right')}>List price</span>
            <span className={SECTION_LABEL}>Details</span>
            <span className={cn(SECTION_LABEL, 'text-right')}>MLS</span>
            <span />
          </div>

          <StaggerList className="divide-y divide-border/70">
          {filtered.map((p, i) => {
            const isFocused = focusedId === p.id;
            const row = (
              <Link
                href={`/s/${slug}/properties/${p.id}`}
                data-row-id={p.id}
                className={cn(
                  'group relative block transition-[colors,transform] duration-150',
                  'hover:bg-foreground/[0.04] hover:scale-[1.005]',
                  isFocused &&
                    'bg-foreground/[0.045] before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-foreground',
                )}
              >
                {/* md+ table row */}
                <div className="hidden md:grid grid-cols-[minmax(0,2.5fr)_90px_120px_140px_70px_28px] items-center gap-3 px-5 py-3.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    {formatPropertyAddress(p)}
                  </p>
                  <span
                    className={cn(
                      'inline-flex items-center text-[10px] font-medium rounded-full px-2 h-5 w-fit',
                      STATUS_PILL[p.listingStatus],
                    )}
                  >
                    {STATUS_LABEL[p.listingStatus]}
                  </span>
                  <span className="text-sm tabular-nums text-foreground text-right">
                    {p.listPrice != null ? formatCurrency(p.listPrice) : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {formatPropertyFacts(p) || '—'}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground text-right truncate">
                    {p.mlsNumber ?? '—'}
                  </span>
                  <ArrowRight
                    size={13}
                    strokeWidth={1.75}
                    className="text-muted-foreground/40 group-hover:text-foreground transition-colors duration-150"
                  />
                </div>

                {/* mobile card */}
                <div className="md:hidden flex items-start gap-3 px-4 py-3.5">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {formatPropertyAddress(p)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center text-[10px] font-medium rounded-full px-2 h-5',
                          STATUS_PILL[p.listingStatus],
                        )}
                      >
                        {STATUS_LABEL[p.listingStatus]}
                      </span>
                      {p.listPrice != null && (
                        <span className="text-xs tabular-nums text-foreground">
                          {formatCurrency(p.listPrice)}
                        </span>
                      )}
                      {formatPropertyFacts(p) && (
                        <span className="text-xs text-muted-foreground truncate">
                          {formatPropertyFacts(p)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight
                    size={13}
                    strokeWidth={1.75}
                    className="text-muted-foreground/40 mt-1 flex-shrink-0"
                  />
                </div>
              </Link>
            );
            // Cap the stagger to the first 10 rows — past that the cumulative
            // delay reads as theatrical, so the rest just appear.
            return i < 10 ? (
              <StaggerItem key={p.id}>{row}</StaggerItem>
            ) : (
              <div key={p.id}>{row}</div>
            );
          })}
          </StaggerList>
        </div>
      )}

      {/* Create modal — kept; restyled to paper-flat */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 backdrop-blur-sm pt-[10vh] px-4"
          onClick={() => !submitting && setCreating(false)}
        >
          <div
            className="w-full max-w-[640px] rounded-xl border border-border/70 bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-border/70 flex items-center gap-2">
              <Building2 size={15} className="text-muted-foreground" />
              <h2 className={H3}>New property</h2>
              {submitting && (
                <Loader2
                  size={13}
                  className="animate-spin text-muted-foreground ml-auto"
                />
              )}
            </div>
            <div className="p-5">
              <PropertyForm
                onCancel={() => setCreating(false)}
                onSubmit={onCreate}
                submitting={submitting}
                submitLabel="Add property"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({
  value,
  label,
  sub,
}: {
  value: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER} style={TITLE_FONT}>
        {value}
      </p>
      <p className={cn(BODY, 'mt-1.5')}>{label}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

function EmptyState({
  isFresh,
  onAdd,
}: {
  isFresh: boolean;
  onAdd: () => void;
}) {
  if (isFresh) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
          <HomeIcon size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
        </div>
        <h2 className={cn(H2, 'mb-2')} style={TITLE_FONT}>
          Nothing listed yet.
        </h2>
        <p className={cn(BODY_MUTED, 'max-w-sm mb-6')}>
          Add your first property and I'll keep track of the commissions.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className={PRIMARY_PILL}
        >
          <Plus size={14} strokeWidth={2.25} />
          Add your first property
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
        <Search size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <p className={cn(H2, 'mb-1')} style={TITLE_FONT}>
        Nothing matches.
      </p>
      <p className={BODY_MUTED}>
        Shorten the query or drop the filter.
      </p>
    </div>
  );
}
