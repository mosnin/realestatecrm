'use client';

import { useState, useEffect } from 'react';
import { Building2, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { CardSkeleton } from '../card-skeleton';
import { DURATION_BASE, EASE_IN_OUT } from '@/lib/motion';

interface PropertySummary {
  id: string;
  address: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  listingStatus?: string;
}

interface PropertyDetail {
  id: string;
  address: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  listingStatus: string;
  daysOnMarket: number | null;
  dealCount: number;
  description: string | null;
}

interface PropertyCardProps {
  property: PropertySummary;
  slug: string;
  animDelay?: number;
}

/** Format a price number into a compact string like "$450k" or "$1.2M". */
function formatPrice(v: number | null | undefined): string | null {
  if (v == null) return null;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

/** Format a price for the detail grid — full number with commas. */
function formatPriceFull(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toLocaleString()}`;
}

function formatSqft(v: number | null | undefined): string | null {
  if (v == null) return null;
  return v.toLocaleString();
}

/** Icon background tone keyed by listingStatus. */
function iconBg(status: string | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'active') return 'bg-emerald-500/10';
  if (s === 'pending') return 'bg-amber-500/10';
  return 'bg-muted';
}

/** Status chip styling keyed by listingStatus. */
const STATUS_CHIP: Record<string, string> = {
  active:
    'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  pending:
    'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  sold: 'text-muted-foreground bg-muted',
  closed: 'text-muted-foreground bg-muted',
  withdrawn: 'text-muted-foreground bg-muted',
};

function statusChipClass(status: string | undefined): string {
  const key = (status ?? '').toLowerCase();
  return STATUS_CHIP[key] ?? 'text-muted-foreground bg-muted';
}

export function PropertyCard({ property, slug, animDelay = 0 }: PropertyCardProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || detail || loading) return;
    if (!slug) return;
    setLoading(true);
    fetch(`/api/cards/property/${property.id}?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: PropertyDetail | null) => {
        if (d) setDetail(d);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, detail, loading, slug, property.id]);

  const compactPrice = formatPrice(property.price);
  const iconBgClass = iconBg(property.listingStatus);
  const chipClass = statusChipClass(property.listingStatus);

  // Sub-line: beds · baths · sqft
  const specs: string[] = [];
  if (property.beds != null) specs.push(`${property.beds} bd`);
  if (property.baths != null) specs.push(`${property.baths} ba`);
  if (property.sqft != null) specs.push(`${formatSqft(property.sqft)} sqft`);
  const specsLine = specs.join(' · ');

  return (
    <motion.div
      className="rounded-xl border border-border/60 bg-background overflow-hidden"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1], delay: animDelay }}
    >
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group/row w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {/* Building icon with status-tinted background */}
        <div
          className={cn(
            'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
            iconBgClass,
          )}
        >
          <Building2 size={14} className="text-muted-foreground" />
        </div>

        {/* Address + specs sub-line */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">
            {property.address}
          </p>
          {specsLine && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{specsLine}</p>
          )}
        </div>

        {/* Price + status chip + chevron */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {compactPrice && (
            <span className="text-[11px] tabular-nums text-foreground font-medium">
              {compactPrice}
            </span>
          )}
          {property.listingStatus && (
            <span
              className={cn(
                'inline-flex text-[10px] font-medium rounded-full px-2 py-0.5 whitespace-nowrap',
                chipClass,
              )}
            >
              {property.listingStatus}
            </span>
          )}
          {open ? (
            <ChevronDown size={13} className="text-muted-foreground/60" />
          ) : (
            <ChevronRight
              size={13}
              className="text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
            />
          )}
        </div>
      </button>

      {/* Expanded detail panel */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DURATION_BASE, ease: EASE_IN_OUT }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 bg-muted/20 px-4 py-4 space-y-4">
              {loading && <CardSkeleton rows={4} />}

              {!loading && detail && (
                <>
                  {/* Specs grid */}
                  <div className="grid grid-cols-2 gap-px rounded-lg overflow-hidden border border-border/60 bg-border/60 text-[12px]">
                    <div className="bg-background px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Price
                      </span>
                      <span className="text-foreground font-medium tabular-nums">
                        {formatPriceFull(detail.price)}
                      </span>
                    </div>
                    <div className="bg-background px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Status
                      </span>
                      <span
                        className={cn(
                          'self-start inline-flex text-[10px] font-medium rounded-full px-2 py-0.5',
                          statusChipClass(detail.listingStatus),
                        )}
                      >
                        {detail.listingStatus}
                      </span>
                    </div>
                    <div className="bg-background px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Beds
                      </span>
                      <span className="text-foreground tabular-nums">
                        {detail.beds ?? '—'}
                      </span>
                    </div>
                    <div className="bg-background px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Baths
                      </span>
                      <span className="text-foreground tabular-nums">
                        {detail.baths ?? '—'}
                      </span>
                    </div>
                    <div className="bg-background px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        Sqft
                      </span>
                      <span className="text-foreground tabular-nums">
                        {detail.sqft != null ? detail.sqft.toLocaleString() : '—'}
                      </span>
                    </div>
                    <div className="bg-background px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        DOM
                      </span>
                      <span className="text-foreground tabular-nums">
                        {detail.daysOnMarket != null
                          ? `${detail.daysOnMarket} days`
                          : '—'}
                      </span>
                    </div>
                    {detail.dealCount > 0 && (
                      <div className="bg-background px-3 py-2 col-span-2 flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                          Deals
                        </span>
                        <span className="text-foreground">
                          {detail.dealCount} active{' '}
                          {detail.dealCount === 1 ? 'deal' : 'deals'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {detail.description && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">
                        Description
                      </p>
                      <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-4">
                        {detail.description}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div>
                    <a
                      href={`/s/${slug}/properties/${property.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground hover:text-muted-foreground transition-colors"
                    >
                      View Property
                      <ChevronRight size={12} />
                    </a>
                  </div>
                </>
              )}

              {/* No detail loaded and not loading — fallback when fetch returned null */}
              {!loading && !detail && (
                <p className="text-[12px] text-muted-foreground">
                  Could not load property details.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
