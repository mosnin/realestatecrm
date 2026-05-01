'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Home as HomeIcon, Loader2, Building2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property, PropertyListingStatus } from '@/lib/types';
import { formatCurrency } from '@/lib/formatting';
import { formatPropertyAddress } from '@/lib/properties';
import { useRowNavigation } from '@/lib/hooks/use-row-navigation';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import {
  H1,
  H2,
  H3,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_LABEL,
  PAGE_RHYTHM,
  PRIMARY_PILL,
  QUIET_LINK,
} from '@/lib/typography';
import { PropertyForm } from './property-form';

// Status reads as a small word, not a colored chip. Cut the rainbow palette —
// the realtor knows what "Pending" means without a yellow halo. One muted tone
// for everything except "Live" which earns a single accent.
const STATUS_LABEL: Record<PropertyListingStatus, string> = {
  active: 'Live',
  pending: 'Pending',
  sold: 'Closed',
  off_market: 'Withdrawn',
  owned: 'Owned',
};

const STATUS_TONE: Record<PropertyListingStatus, string> = {
  active: 'text-emerald-700 dark:text-emerald-400',
  pending: 'text-foreground',
  sold: 'text-muted-foreground',
  off_market: 'text-muted-foreground',
  owned: 'text-muted-foreground',
};

interface Props {
  slug: string;
  initial: Property[];
  subtitle: string;
}

export function PropertiesClient({ slug, initial, subtitle }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<Property[]>(initial);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Search is the only filter that earns its place — addresses are long and
  // realtors hunt by street name. Status filtering is gone: the subtitle calls
  // out the loudest fact, and the row badge tells the rest.
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? items.filter((p) => {
          const hay =
            `${p.address} ${p.unitNumber ?? ''} ${p.city ?? ''} ${p.mlsNumber ?? ''}`.toLowerCase();
          return hay.includes(query);
        })
      : items;
    // One sort: most-recently-touched first. The realtor's working surface,
    // not an archive. Sort dropdowns are configuration disguised as a feature.
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [items, q]);

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
        toast.error(data.error || "Couldn't add that listing. Try again in a moment.");
        return;
      }
      const created: Property = await res.json();
      setItems((prev) => [created, ...prev]);
      setCreating(false);
      toast.success('Listing on the books.');
    } finally {
      setSubmitting(false);
    }
  }

  const isFreshWorkspace = items.length === 0;

  return (
    <div className={PAGE_RHYTHM}>
      {/* Header — H1 + Chippi-voiced subtitle + CTA cluster mirroring /contacts
          and /deals. The conversation is the front door; the form is offered
          quietly. */}
      <header className="space-y-2">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className={H1} style={TITLE_FONT}>
              Properties
            </h1>
            <p className="text-lg text-muted-foreground" style={TITLE_FONT}>
              {subtitle}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Link
              href={`/s/${slug}/chippi?prefill=${encodeURIComponent("I'm adding a new listing — ")}`}
              className={PRIMARY_PILL}
            >
              Tell Chippi →
            </Link>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={QUIET_LINK}
            >
              or fill out the form
            </button>
          </div>
        </div>
      </header>

      {/* Search — the one piece of toolbar that earns its place. No chips,
          no sort dropdown, no popover. */}
      {!isFreshWorkspace && (
        <div className="flex items-center justify-between gap-2">
          <div className="relative flex-1 sm:flex-initial min-w-[160px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search address, city, MLS#"
              className="pl-9 pr-3 h-9 w-full sm:w-72 text-sm rounded-md border border-border/70 bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-all duration-150"
            />
          </div>
          <Link
            href={`/s/${slug}/properties/commissions`}
            className={QUIET_LINK}
          >
            Commissions →
          </Link>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          isFresh={isFreshWorkspace}
          slug={slug}
          onAdd={() => setCreating(true)}
        />
      ) : (
        <div
          ref={containerRef}
          className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70"
        >
          {/* Table header — md+ only. Four columns: Address / Status / List /
              Updated. MLS and Details columns moved to the detail page where
              they belong. */}
          <div className="hidden md:grid grid-cols-[minmax(0,3fr)_90px_120px_110px_28px] items-center gap-3 px-5 py-2.5 bg-foreground/[0.02] border-b border-border/70">
            <span className={SECTION_LABEL}>Address</span>
            <span className={SECTION_LABEL}>Status</span>
            <span className={cn(SECTION_LABEL, 'text-right')}>List price</span>
            <span className={cn(SECTION_LABEL, 'text-right')}>Updated</span>
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
                  <div className="hidden md:grid grid-cols-[minmax(0,3fr)_90px_120px_110px_28px] items-center gap-3 px-5 py-3.5">
                    <p className="text-sm font-medium text-foreground truncate">
                      {formatPropertyAddress(p)}
                    </p>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        STATUS_TONE[p.listingStatus],
                      )}
                    >
                      {STATUS_LABEL[p.listingStatus]}
                    </span>
                    <span className="text-sm tabular-nums text-foreground text-right">
                      {p.listPrice != null ? formatCurrency(p.listPrice) : '—'}
                    </span>
                    <span className="text-xs text-muted-foreground text-right tabular-nums">
                      {formatRelative(p.updatedAt)}
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
                      <p className="text-sm font-medium text-foreground truncate">
                        {formatPropertyAddress(p)}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={cn(
                            'text-xs font-medium',
                            STATUS_TONE[p.listingStatus],
                          )}
                        >
                          {STATUS_LABEL[p.listingStatus]}
                        </span>
                        {p.listPrice != null && (
                          <span className="text-xs tabular-nums text-foreground">
                            {formatCurrency(p.listPrice)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(p.updatedAt)}
                        </span>
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
              return i < 10 ? (
                <StaggerItem key={p.id}>{row}</StaggerItem>
              ) : (
                <div key={p.id}>{row}</div>
              );
            })}
          </StaggerList>
        </div>
      )}

      {/* Create modal — kept; the form path still exists for those who want it. */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 backdrop-blur-sm pt-[10vh] px-4"
          onClick={() => !submitting && setCreating(false)}
        >
          <div
            className="w-full max-w-[640px] max-h-[85vh] flex flex-col rounded-xl border border-border/70 bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-border/70 flex items-center gap-2 flex-shrink-0">
              <Building2 size={15} className="text-muted-foreground" />
              <h2 className={H3}>New listing</h2>
              {submitting && (
                <Loader2
                  size={13}
                  className="animate-spin text-muted-foreground ml-auto"
                />
              )}
            </div>
            <div className="p-5 overflow-y-auto">
              <PropertyForm
                onCancel={() => setCreating(false)}
                onSubmit={onCreate}
                submitting={submitting}
                submitLabel="Add listing"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Short relative time — "today", "3d", "2w", "Mar 12". Tabular by design. */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function EmptyState({
  isFresh,
  slug,
  onAdd,
}: {
  isFresh: boolean;
  slug: string;
  onAdd: () => void;
}) {
  if (isFresh) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
          <HomeIcon size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
        </div>
        <h2 className={cn(H2, 'mb-2')} style={TITLE_FONT}>
          No listings yet.
        </h2>
        <p className={cn(BODY_MUTED, 'max-w-sm mb-6')}>
          Drop the first address and I&apos;ll keep track of the rest.
        </p>
        <div className="flex flex-col items-center gap-1">
          <Link
            href={`/s/${slug}/chippi?prefill=${encodeURIComponent("I'm adding a new listing — ")}`}
            className={PRIMARY_PILL}
          >
            Tell Chippi →
          </Link>
          <button type="button" onClick={onAdd} className={QUIET_LINK}>
            or fill out the form
          </button>
        </div>
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
      <p className={BODY_MUTED}>Shorten the search.</p>
    </div>
  );
}
