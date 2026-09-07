'use client';

/** Searchable property register with the existing expandable gallery available on demand. */

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Property } from '@/lib/types';
import { formatCompact } from '@/lib/formatting';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';
import { EASE_OUT, EASE_APPLE, DURATION_BASE, DURATION_FAST } from '@/lib/motion';
import { CAPTION, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { PropertyStatusBadge } from './property-status-badge';

interface Props {
  slug: string;
  properties: (Property & {workSummary?:string})[];
}

export function PropertyListGrid({ slug, properties }: Props) {
  const reduce = useReducedMotion();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<'list' | 'gallery'>('list');
  const visible = properties.filter(p => (status === 'all' || p.listingStatus === status) && `${formatPropertyAddress(p)} ${p.mlsNumber ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <input aria-label="Search properties" placeholder="Search address or MLS number" value={query} onChange={e => setQuery(e.target.value)} className="min-w-0 basis-full sm:basis-auto flex-1 rounded-md border bg-background px-3 py-2 text-sm" />
      <select aria-label="Property status" value={status} onChange={e => setStatus(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm"><option value="all">All statuses</option>{['active','pending','sold','off_market','owned'].map(v => <option key={v} value={v}>{v.replace('_',' ')}</option>)}</select>
      <button type="button" onClick={() => setView(view === 'list' ? 'gallery' : 'list')} className="rounded-md border px-3 py-2 text-sm">{view === 'list' ? 'Gallery view' : 'List view'}</button>
    </div>
    <p className="text-xs text-muted-foreground">{visible.length} properties · Saved facts may need verification. Research does not confirm listing availability.</p>
    {!visible.length && <p role="status" className="py-6 text-sm">No properties match. Try another search or status.</p>}
    <ul className={view === 'gallery' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'divide-y'}>
      {visible.map(property => <li key={property.id}>{view === 'gallery' ? <PropertyCard slug={slug} property={property} reduce={!!reduce}/> : <Link href={`/s/${slug}/properties/${property.id}`} className="flex flex-wrap items-center gap-3 py-4 focus-visible:outline focus-visible:outline-2">
        {property.photos?.[0] && <img src={property.photos[0]} alt="" className="h-14 w-20 rounded object-cover"/>}
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{formatPropertyAddress(property)}</span><span className="block text-xs text-muted-foreground">{formatPropertyFacts(property)}</span>{property.workSummary && <span className="block text-xs">{property.workSummary}</span>}<span className="block text-xs text-muted-foreground">{property.analysis?.sources?.length ? `Web research · ${new Date(property.analysis.analyzedAt).toLocaleDateString()}` : property.analyzedAt ? 'Research attempted · no saved evidence' : 'Research not run'}</span></span>
        <span className="flex items-center gap-3"><PropertyStatusBadge status={property.listingStatus}/><span className="text-sm tabular-nums">{property.listPrice == null ? 'Price unknown' : property.listPrice.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0})}</span></span>
      </Link>}</li>)}
    </ul>
  </div>;
}

function PropertyCard({
  slug,
  property,
  reduce,
}: {
  slug: string;
  property: Property;
  reduce: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const addr = formatPropertyAddress(property);
  const facts = formatPropertyFacts(property);
  const cover = property.photos[0];
  const rest = property.photos.slice(1, 6);
  const hasSpecs =
    property.beds != null ||
    property.baths != null ||
    property.squareFeet != null ||
    property.yearBuilt != null;
  const expandable = hasSpecs || rest.length > 0 || !!property.mlsNumber;

  return (
    <motion.div
      // Hover lift — a 1px rise + a barely-there shadow bloom. Confident,
      // not bouncy; matches the product's 150ms hover language.
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
      className={cn(
        'chippi-dashboard-panel group relative flex h-full flex-col overflow-hidden rounded-[1.75rem]',
        'transition-shadow duration-200',
        'hover:shadow-[0_12px_30px_-24px_rgba(0,0,0,0.22)]',
      )}
    >
      {/* ── Cover ─────────────────────────────────────────────────────────
          The house first. A 4:3 frame, gentle zoom on hover (image scales,
          not the card), a soft top gradient so the status chip stays legible
          on any photo. The whole cover links to the detail page. */}
      <Link
        href={`/s/${slug}/properties/${property.id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-muted focus-visible:outline-none"
        aria-label={`Open ${addr}`}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={addr}
            loading="lazy"
            className={cn(
              'h-full w-full object-cover',
              !reduce &&
                'transition-transform duration-[450ms] ease-out group-hover:scale-[1.04]',
            )}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <span className="text-[11px] text-muted-foreground/70">No photo yet</span>
          </div>
        )}

        {/* Status chip floats top-left over the photo; falls back to plain
            placement when no photo (the badge already reads on muted). */}
        <div className="absolute left-3 top-3">
          {cover ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur-sm">
              <PropertyStatusBadge status={property.listingStatus} className="bg-transparent px-0 py-0" />
            </span>
          ) : (
            <PropertyStatusBadge status={property.listingStatus} />
          )}
        </div>

        {/* Photo count — bottom-right, only when there's more than one. */}
        {property.photos.length > 1 && (
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
            {property.photos.length} photos
          </span>
        )}
      </Link>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Link
              href={`/s/${slug}/properties/${property.id}`}
              className="block truncate text-sm font-medium text-foreground transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:underline"
            >
              {addr}
            </Link>
            {(facts || property.propertyType) && (
              <p className={cn('mt-0.5 truncate', CAPTION)}>
                {[facts, property.propertyType?.replace('_', ' ')]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Price — the confident display number. Counts up on entry. */}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          {property.listPrice != null ? (
            // Serif display face — matches the focal-stat treatment used on
            // the detail page and the commissions stat strip.
            <span style={TITLE_FONT}>
              <span className="text-[21px] leading-none tabular-nums">{property.listPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</span>
            </span>
          ) : (
            <span className="text-sm not-italic text-muted-foreground">Price TBD</span>
          )}

          {expandable ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Hide quick specs' : 'Show quick specs'}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
                'text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              )}
            >
              {expanded ? 'Less' : 'Specs'}
              <ChevronDown
                size={13}
                aria-hidden
                className={cn('transition-transform duration-200', expanded && 'rotate-180')}
              />
            </button>
          ) : (
            <Link
              href={`/s/${slug}/properties/${property.id}`}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              Open
              <ArrowUpRight size={12} aria-hidden />
            </Link>
          )}
        </div>

        {/* ── Expanded quick specs ──────────────────────────────────────
            Stays in the card (no nav). A small spec strip + a thumbnail
            rail of the remaining photos. Height animates; content fades. */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="specs"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={
                reduce
                  ? { opacity: 1 }
                  : { height: 'auto', opacity: 1, transition: { duration: DURATION_BASE, ease: EASE_APPLE } }
              }
              exit={
                reduce
                  ? { opacity: 0 }
                  : { height: 0, opacity: 0, transition: { duration: DURATION_FAST, ease: EASE_OUT } }
              }
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-border/60 pt-3">
                {hasSpecs && (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {property.beds != null && (
                      <SpecChip value={property.beds} label="bed" />
                    )}
                    {property.baths != null && (
                      <SpecChip value={property.baths} label="bath" />
                    )}
                    {property.squareFeet != null && (
                      <SpecChip
                        value={property.squareFeet}
                        suffix=" sqft"
                        label="floor area"
                      />
                    )}
                    {property.yearBuilt != null && (
                      <SpecChip rawValue={String(property.yearBuilt)} label="built" />
                    )}
                  </div>
                )}

                {property.mlsNumber && (
                  <p className={cn(CAPTION)}>
                    <span className={cn(SECTION_LABEL, 'mr-1.5')}>MLS</span>
                    <span className="tabular-nums text-foreground">{property.mlsNumber}</span>
                  </p>
                )}

                {rest.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {rest.map((url, i) => (
                      <Link
                        key={url}
                        href={`/s/${slug}/properties/${property.id}`}
                        className="relative h-12 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border/60 transition-opacity hover:opacity-90"
                        aria-label={`Photo ${i + 2} of ${addr}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/** A single inline spec: icon + count-up value + quiet label. */
function SpecChip({
  value,
  rawValue,
  suffix = '',
  label,
}: {
  value?: number;
  rawValue?: string;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="leading-tight">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {rawValue != null ? (
            rawValue
          ) : (
            <span>{value?.toLocaleString() ?? '—'}{suffix}</span>
          )}
        </span>
        <span className="ml-1 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
