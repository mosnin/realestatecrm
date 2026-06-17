'use client';

/**
 * ListingsCarousel — the horizontal listings strip on /p/[slug], plus the
 * detail modal each card opens.
 *
 * Why a client island: the public profile is a server component, but a card
 * that opens a detail view needs interactivity. This component owns only the
 * carousel + modal state; everything else on the profile stays server-rendered.
 *
 * Card behaviour:
 *   - Tapping a card opens a detail modal with the listing's photo, address,
 *     locality, and price (using the data already loaded for the card — no new
 *     fetch).
 *   - When the listing has an external `listingUrl`, the modal surfaces a
 *     "View full listing" button out to it. The card itself always opens the
 *     modal (never dead, never a silent no-op).
 *   - Photo renders when present; a tasteful Home-glyph placeholder is the
 *     fallback only when there's no photo.
 */

import { useState } from 'react';
import { ArrowUpRight, Home } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { safeHref } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import type { PublicProperty } from './public-profile';

function formatPrice(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function loc(property: PublicProperty): string {
  return [property.city, property.stateRegion].filter(Boolean).join(', ');
}

/** A single property card inside the carousel. Image-led; fixed width so the
 *  carousel hints a peek of the next card at the right edge on mobile. The
 *  whole card is a button that opens the detail modal. */
function PropertyCard({
  property,
  onOpen,
}: {
  property: PublicProperty;
  onOpen: () => void;
}) {
  const cover = property.photos?.[0] ?? null;
  const locality = loc(property);
  const price = formatPrice(property.listPrice);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View details for ${property.address}`}
      className="block w-[260px] shrink-0 snap-start cursor-pointer overflow-hidden rounded-2xl border border-border/70 bg-card text-left sm:transition-transform sm:duration-150 sm:hover:-translate-y-0.5"
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt={property.address}
          loading="lazy"
          decoding="async"
          className="aspect-[16/9] w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex aspect-[16/9] w-full items-center justify-center bg-muted"
        >
          <Home size={28} className="text-muted-foreground/60" />
        </div>
      )}
      <div className="px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">{property.address}</p>
        {locality && <p className="truncate text-xs text-muted-foreground">{locality}</p>}
        {price && (
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{price}</p>
        )}
      </div>
    </button>
  );
}

export function ListingsCarousel({
  properties,
  accentColor,
}: {
  properties: PublicProperty[];
  accentColor: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? properties.find((p) => p.id === activeId) ?? null : null;

  const cover = active?.photos?.[0] ?? null;
  const locality = active ? loc(active) : '';
  const price = active ? formatPrice(active.listPrice) : null;
  const listingHref = active?.listingUrl ? safeHref(active.listingUrl) : null;

  return (
    <>
      <div
        className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 no-scrollbar"
        style={{ scrollPaddingLeft: '1.5rem', scrollPaddingRight: '1.5rem' }}
      >
        {properties.map((p) => (
          <PropertyCard key={p.id} property={p} onOpen={() => setActiveId(p.id)} />
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        {active && (
          <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt={active.address}
                loading="eager"
                decoding="async"
                className="aspect-[16/9] w-full object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="flex aspect-[16/9] w-full items-center justify-center bg-muted"
              >
                <Home size={36} className="text-muted-foreground/60" />
              </div>
            )}
            <div className="space-y-3 p-5">
              <DialogHeader className="space-y-1">
                <DialogTitle className="text-left text-lg">{active.address}</DialogTitle>
                <DialogDescription className="text-left">
                  {locality || 'Listing details'}
                </DialogDescription>
              </DialogHeader>
              {price && (
                <p className="text-xl font-semibold tabular-nums text-foreground">{price}</p>
              )}
              {listingHref && (
                <a
                  href={listingHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ backgroundColor: accentColor, color: pickContrastColor(accentColor) }}
                  className="group inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-5 py-3 text-sm font-semibold transition-transform duration-150 active:scale-[0.99]"
                >
                  View full listing
                  <ArrowUpRight
                    size={16}
                    className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </a>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
