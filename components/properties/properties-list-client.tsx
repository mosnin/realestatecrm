'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Plus, Search, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/types';
import {
  formatPropertyAddress,
  formatPropertyFacts,
  PROPERTY_LISTING_STATUS_OPTIONS,
} from '@/lib/properties';
import { formatCompact, formatCurrency } from '@/lib/formatting';
import { H1, TITLE_FONT, PAGE_RHYTHM, SECTION_LABEL } from '@/lib/typography';
import { PropertyForm } from './property-form';

export interface PropertyRow {
  property: Property;
  dealCount: number;
  activeCount: number;
  wonCount: number;
  closedNet: number;
  expectedNet: number;
}

interface Props {
  slug: string;
  initialRows: PropertyRow[];
}

export function PropertiesListClient({ slug, initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<PropertyRow[]>(initialRows);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  // Headline sentence — one fact about the inventory in plain English.
  const subtitle = useMemo(() => {
    if (rows.length === 0) {
      return 'No properties yet. Add your first listing or rental.';
    }
    const totalEarned = rows.reduce((acc, r) => acc + r.closedNet, 0);
    const inFlight = rows.reduce((acc, r) => acc + r.expectedNet, 0);
    const active = rows.filter((r) => r.property.listingStatus === 'active').length;
    if (totalEarned > 0) {
      return `${rows.length} ${rows.length === 1 ? 'property' : 'properties'} · ${formatCompact(totalEarned)} earned, ${formatCompact(inFlight)} in flight.`;
    }
    if (inFlight > 0) {
      return `${rows.length} ${rows.length === 1 ? 'property' : 'properties'} · ${formatCompact(inFlight)} in flight.`;
    }
    return `${rows.length} ${rows.length === 1 ? 'property' : 'properties'}${active > 0 ? ` · ${active} active` : ''}.`;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const addr = formatPropertyAddress(r.property).toLowerCase();
      return (
        addr.includes(q) ||
        (r.property.mlsNumber ?? '').toLowerCase().includes(q) ||
        (r.property.city ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, filter]);

  async function createProperty(values: Partial<Property>) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/properties?slug=${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't add that property.");
        return;
      }
      const created = (await res.json()) as Property;
      setRows((prev) => [
        {
          property: created,
          dealCount: 0,
          activeCount: 0,
          wonCount: 0,
          closedNet: 0,
          expectedNet: 0,
        },
        ...prev,
      ]);
      setCreating(false);
      toast.success('Added.');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (creating) {
    return (
      <div className={cn(PAGE_RHYTHM, 'max-w-3xl')}>
        <header className="space-y-2">
          <h1 className={H1} style={TITLE_FONT}>
            Add property
          </h1>
          <p className="text-sm text-muted-foreground">
            New listing, rental, or owned. The property becomes available to attach to a deal.
          </p>
        </header>
        <div className="rounded-xl border border-border/70 bg-card p-5">
          <PropertyForm
            onCancel={() => setCreating(false)}
            onSubmit={createProperty}
            submitting={submitting}
            submitLabel="Add property"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(PAGE_RHYTHM, 'max-w-[1500px]')}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className={H1} style={TITLE_FONT}>
            Properties
          </h1>
          <p className="text-lg text-muted-foreground" style={TITLE_FONT}>
            {subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={14} strokeWidth={2} />
          Add property
        </button>
      </header>

      {rows.length > 0 && (
        <div className="relative max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
          />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by address, city, or MLS"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-border/70 bg-background text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
          />
        </div>
      )}

      {/* List — paper-flat hairline rows. Each property row is a doorway to
          its detail; the commission column is the field that connects this
          surface back to /properties/commissions. */}
      {rows.length === 0 ? (
        <EmptyState onAdd={() => setCreating(true)} />
      ) : (
        <div className="rounded-xl border border-border/70 bg-background overflow-hidden">
          <div
            className={cn(
              'hidden sm:grid grid-cols-[minmax(0,2fr)_120px_90px_120px_28px] px-5 py-2 bg-foreground/[0.02]',
              SECTION_LABEL,
            )}
          >
            <span>Property</span>
            <span className="text-right">Deals</span>
            <span className="text-right">Status</span>
            <span className="text-right">Commission</span>
            <span />
          </div>
          {filtered.length === 0 ? (
            <p className="px-5 py-6 text-xs text-muted-foreground text-center">
              No properties match &ldquo;{filter}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-border/70">
              {filtered.map((row) => (
                <PropertyListRow key={row.property.id} slug={slug} row={row} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PropertyListRow({ slug, row }: { slug: string; row: PropertyRow }) {
  const { property, dealCount, activeCount, wonCount, closedNet, expectedNet } = row;
  const addr = formatPropertyAddress(property);
  const facts = formatPropertyFacts(property);
  const statusLabel =
    PROPERTY_LISTING_STATUS_OPTIONS.find((o) => o.value === property.listingStatus)?.label ??
    property.listingStatus;

  // Commission cell: prefer realized over projected. If neither, show em-dash.
  const commissionCell = (() => {
    if (closedNet > 0) {
      return {
        primary: formatCurrency(closedNet),
        secondary: 'earned',
      };
    }
    if (expectedNet > 0) {
      return {
        primary: formatCurrency(expectedNet),
        secondary: 'in flight',
      };
    }
    return { primary: '—', secondary: null as string | null };
  })();

  const dealsLabel = (() => {
    if (dealCount === 0) return 'No deals';
    const parts: string[] = [];
    if (activeCount > 0) parts.push(`${activeCount} active`);
    if (wonCount > 0) parts.push(`${wonCount} won`);
    return parts.length > 0 ? parts.join(' · ') : `${dealCount} ${dealCount === 1 ? 'deal' : 'deals'}`;
  })();

  return (
    <li>
      <Link
        href={`/s/${slug}/properties/${property.id}`}
        className="group flex flex-col sm:grid sm:grid-cols-[minmax(0,2fr)_120px_90px_120px_28px] sm:items-center px-5 py-3 hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150"
      >
        <div className="flex items-center gap-3 min-w-0">
          {property.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={property.photos[0]}
              alt=""
              className="w-9 h-9 rounded-md object-cover flex-shrink-0 ring-1 ring-border/60"
            />
          ) : (
            <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground/60">
              <Building2 size={14} strokeWidth={1.75} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{addr}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {facts || property.propertyType?.replace('_', ' ') || ' '}
            </p>
          </div>
        </div>
        <span className="hidden sm:block text-right text-sm text-muted-foreground tabular-nums">
          {dealsLabel}
        </span>
        <span className="hidden sm:block text-right text-[11px] uppercase tracking-wider text-muted-foreground">
          {statusLabel}
        </span>
        <span className="hidden sm:flex flex-col items-end">
          <span className="tabular-nums text-sm text-foreground">{commissionCell.primary}</span>
          {commissionCell.secondary && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {commissionCell.secondary}
            </span>
          )}
        </span>
        <span className="hidden sm:flex justify-end text-muted-foreground/40 group-hover:text-foreground transition-colors duration-150">
          <ArrowRight size={13} strokeWidth={1.75} />
        </span>
      </Link>
    </li>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-background px-6 py-16 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center text-muted-foreground/70">
        <Building2 size={20} strokeWidth={1.75} />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">Your inventory lives here.</p>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Add a listing or rental, then attach incoming leads as deals.
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
      >
        <Plus size={14} strokeWidth={2} />
        Add property
      </button>
    </div>
  );
}
