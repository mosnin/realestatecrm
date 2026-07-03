'use client';

/**
 * PropertyListGrid — the realtor's listing wall.
 *
 * A property list is a register AND a gallery: the realtor scans facts, but
 * they also recognise houses by their photo first, address second. So this
 * is a responsive card grid — a strong 4:3 cover, a confident compact price,
 * a quiet status chip, and a fact line. Cards lift a hair on hover and arrive
 * in a stagger. Each card *expands in place* (no navigation) to reveal a spec
 * strip + a thumbnail rail of the rest of the photos, so the realtor can
 * glance the details of three listings without leaving the wall. The card
 * title still links to the full detail page.
 *
 * Pure presentation: same data, same routes, same links as the server list it
 * replaces (address → `/s/[slug]/properties/[id]`, "Add property" → `/new`).
 * No data is fetched here; the server page passes the rows in.
 */

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BedDouble, Bath, Ruler, Calendar, ArrowUpRight, ChevronDown } from 'lucide-react';
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
  properties: Property[];
}

export function PropertyListGrid({ slug, properties }: Props) {
  const reduce = useReducedMotion();

  return (
    <motion.ul
      initial="initial"
      animate="enter"
      variants={{
        initial: {},
        enter: { transition: { staggerChildren: reduce ? 0 : 0.045 } },
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {properties.map((property) => (
        <motion.li
          key={property.id}
          variants={{
            initial: reduce ? { opacity: 0 } : { opacity: 0, y: 10 },
            enter: {
              opacity: 1,
              y: 0,
              transition: { duration: DURATION_BASE, ease: EASE_OUT },
            },
          }}
        >
          <PropertyCard slug={slug} property={property} reduce={!!reduce} />
        </motion.li>
      ))}
    </motion.ul>
  );
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
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card',
        'transition-shadow duration-200',
        'hover:border-border hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]',
        'dark:hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)]',
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

        {/* Legibility scrim — only top, only if there's a photo. */}
        {cover && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent"
            aria-hidden
          />
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
              <AnimatedNumber
                value={property.listPrice}
                format={formatCompact}
                className="text-[21px] leading-none tracking-tight tabular-nums text-foreground"
              />
            </span>
          ) : (
            <span className="text-sm italic text-muted-foreground">Price TBD</span>
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
                      <SpecChip icon={BedDouble} value={property.beds} label="bed" />
                    )}
                    {property.baths != null && (
                      <SpecChip icon={Bath} value={property.baths} label="bath" />
                    )}
                    {property.squareFeet != null && (
                      <SpecChip
                        icon={Ruler}
                        value={property.squareFeet}
                        suffix=" sqft"
                        label="floor area"
                      />
                    )}
                    {property.yearBuilt != null && (
                      <SpecChip icon={Calendar} rawValue={String(property.yearBuilt)} label="built" />
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
  icon: Icon,
  value,
  rawValue,
  suffix = '',
  label,
}: {
  icon: typeof BedDouble;
  value?: number;
  rawValue?: string;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={15} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
      <div className="leading-tight">
        <span className="text-sm font-medium tabular-nums text-foreground">
          {rawValue != null ? (
            rawValue
          ) : (
            <AnimatedNumber
              value={value ?? 0}
              format={(n) => `${Math.round(n).toLocaleString()}${suffix}`}
              duration={600}
            />
          )}
        </span>
        <span className="ml-1 text-[11px] text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}
