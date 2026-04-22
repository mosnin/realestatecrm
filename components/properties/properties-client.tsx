'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Search, Home as HomeIcon, Loader2, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property, PropertyListingStatus } from '@/lib/types';
import { formatCurrency } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts, PROPERTY_LISTING_STATUS_OPTIONS } from '@/lib/properties';
import { PropertyForm } from './property-form';

const STATUS_CLASS: Record<PropertyListingStatus, string> = {
  active:     'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  pending:    'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  sold:       'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  off_market: 'bg-muted text-muted-foreground',
  owned:      'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
};

interface Props {
  slug: string;
  initial: Property[];
}

export function PropertiesClient({ slug, initial }: Props) {
  const [items, setItems] = useState<Property[]>(initial);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<PropertyListingStatus | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((p) => {
      if (statusFilter !== 'all' && p.listingStatus !== statusFilter) return false;
      if (!query) return true;
      const hay = `${p.address} ${p.unitNumber ?? ''} ${p.city ?? ''} ${p.mlsNumber ?? ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [items, q, statusFilter]);

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
        toast.error(data.error || 'Could not create property');
        return;
      }
      const created: Property = await res.json();
      setItems((prev) => [created, ...prev]);
      setCreating(false);
      toast.success('Property added');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search address, city, MLS#"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-card"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PropertyListingStatus | 'all')}
          className="text-xs border border-border rounded px-2 py-1.5 bg-card"
        >
          <option value="all">All statuses</option>
          {PROPERTY_LISTING_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background text-sm font-semibold px-3 py-1.5"
        >
          <Plus size={13} /> Add property
        </button>
      </div>

      {/* Create modal */}
      {creating && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm pt-[10vh] px-4"
          onClick={() => !submitting && setCreating(false)}
        >
          <div
            className="w-full max-w-[640px] rounded-xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <Building2 size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">New property</h2>
              {submitting && <Loader2 size={13} className="animate-spin text-muted-foreground ml-auto" />}
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

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 px-6 py-14 text-center">
          <HomeIcon size={22} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-semibold">No properties yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add an address to link deals, tours, and shareable listing packets to.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const cover = p.photos[0];
            return (
              <Link
                key={p.id}
                href={`/s/${slug}/properties/${p.id}`}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:border-foreground transition-colors"
              >
                <div className="aspect-[16/10] bg-muted overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {cover ? (
                    <img src={cover} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <HomeIcon size={26} />
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight truncate flex-1">
                      {formatPropertyAddress(p)}
                    </p>
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 flex-shrink-0', STATUS_CLASS[p.listingStatus])}>
                      {p.listingStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{formatPropertyFacts(p) || '—'}</span>
                    {p.listPrice != null && (
                      <span className="font-semibold text-foreground tabular-nums flex-shrink-0 ml-2">
                        {formatCurrency(p.listPrice)}
                      </span>
                    )}
                  </div>
                  {p.mlsNumber && (
                    <p className="text-[10px] text-muted-foreground font-mono">MLS {p.mlsNumber}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
