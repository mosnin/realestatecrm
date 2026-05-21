/**
 * The public realtor "link in bio" page rendered at /p/[slug].
 *
 * A stranger taps the realtor's bio link and lands here. The page is one
 * narrow column: who the realtor is, then a short stack of links. The
 * application is the loud one — it's the conversion, the thing that turns
 * a stranger into a tracked lead — so it sits first and filled-black.
 * Everything else recedes to an outline tile.
 *
 * Server component: every element is a link, nothing needs the client.
 */

import { ArrowRight, ArrowUpRight, CalendarCheck, Globe } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { safeHref } from '@/lib/utils';
import { SECTION_LABEL, TITLE_FONT } from '@/lib/typography';

export interface PublicProperty {
  id: string;
  address: string;
  city: string | null;
  stateRegion: string | null;
  listPrice: number | null;
  photos: string[] | null;
  listingUrl: string | null;
}

interface PublicProfileProps {
  slug: string;
  businessName: string;
  agentName: string;
  agentPhoto: string | null;
  bio: string | null;
  headline: string | null;
  socialLinks: Record<string, string> | null;
  showIntake: boolean;
  showTours: boolean;
  customLinks: Array<{ id: string; label: string; url: string }>;
  properties: PublicProperty[];
  hidePoweredBy: boolean;
}

function formatPrice(value: number | null): string | null {
  if (value == null || value <= 0) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Hand-rolled brand marks — lucide dropped brand icons, so the public
 *  surfaces carry their own (same paths the intake/booking shell uses). */
function SocialIcon({ platform }: { platform: string }) {
  const size = 15;
  switch (platform.toLowerCase()) {
    case 'linkedin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      );
    default:
      return <Globe size={size} aria-hidden />;
  }
}

function PropertyCard({ property }: { property: PublicProperty }) {
  const cover = property.photos?.[0] ?? null;
  const locality = [property.city, property.stateRegion].filter(Boolean).join(', ');
  const price = formatPrice(property.listPrice);

  const inner = (
    <>
      {cover && (
        <img
          src={cover}
          alt={property.address}
          loading="lazy"
          decoding="async"
          className="aspect-[3/2] w-full object-cover"
        />
      )}
      <div className="px-4 py-3">
        <p className="truncate text-sm font-medium text-foreground">{property.address}</p>
        {locality && <p className="truncate text-xs text-muted-foreground">{locality}</p>}
        {price && (
          <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{price}</p>
        )}
      </div>
    </>
  );

  if (property.listingUrl) {
    return (
      <a
        href={safeHref(property.listingUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="block overflow-hidden rounded-xl border border-border/70 bg-card transition-colors hover:bg-muted/30"
      >
        {inner}
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">{inner}</div>
  );
}

export function PublicProfile({
  slug,
  businessName,
  agentName,
  agentPhoto,
  bio,
  headline,
  socialLinks,
  showIntake,
  showTours,
  customLinks,
  properties,
  hidePoweredBy,
}: PublicProfileProps) {
  const socialEntries = Object.entries(socialLinks ?? {}).filter(
    ([, url]) => typeof url === 'string' && url.trim().length > 0,
  );
  const initial = (businessName || agentName || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto w-full max-w-md px-5 pt-12 pb-16 sm:pt-16">
        {/* Identity */}
        <header className="flex flex-col items-center text-center">
          {agentPhoto ? (
            <img
              src={agentPhoto}
              alt={agentName}
              width={96}
              height={96}
              loading="eager"
              decoding="async"
              className="h-24 w-24 rounded-full object-cover ring-1 ring-border/70"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
              {initial}
            </div>
          )}

          <h1
            className="mt-4 text-2xl tracking-tight text-foreground"
            style={TITLE_FONT}
          >
            {businessName}
          </h1>
          {agentName && agentName !== businessName && (
            <p className="mt-0.5 text-sm text-muted-foreground">{agentName}</p>
          )}
          {headline && (
            <p className="mt-2 text-sm text-foreground">{headline}</p>
          )}
          {bio && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{bio}</p>
          )}
        </header>

        {/* Link stack — application first (the conversion), then tour, then
            the realtor's own links. */}
        <div className="mt-8 space-y-3">
          {showIntake && (
            <a
              href={`/apply/${slug}`}
              className="group flex items-center gap-3 rounded-xl bg-foreground px-5 py-4 text-background transition-transform duration-150 active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Start your application</p>
                <p className="truncate text-xs text-background/70">
                  A few quick questions about what you&apos;re looking for.
                </p>
              </div>
              <ArrowRight
                size={18}
                className="shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </a>
          )}

          {showTours && (
            <a
              href={`/book/${slug}`}
              className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-5 py-4 transition-colors hover:bg-muted/30"
            >
              <CalendarCheck size={18} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Book a tour</p>
                <p className="truncate text-xs text-muted-foreground">
                  Pick a time that works for you.
                </p>
              </div>
              <ArrowRight
                size={16}
                className="shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5"
              />
            </a>
          )}

          {customLinks.map((link) => (
            <a
              key={link.id}
              href={safeHref(link.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-5 py-4 transition-colors hover:bg-muted/30"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {link.label}
              </span>
              <ArrowUpRight
                size={16}
                className="shrink-0 text-muted-foreground/40 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
          ))}
        </div>

        {/* Featured listings */}
        {properties.length > 0 && (
          <section className="mt-10 space-y-3">
            <p className={SECTION_LABEL}>Listings</p>
            <div className="space-y-3">
              {properties.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          </section>
        )}

        {/* Socials */}
        {socialEntries.length > 0 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {socialEntries.map(([platform, url]) => (
              <a
                key={platform}
                href={safeHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={platform}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              >
                <SocialIcon platform={platform} />
              </a>
            ))}
          </div>
        )}

        {/* Powered by Chippi — free tier only; paid plans are white-label. */}
        {!hidePoweredBy && (
          <footer className="mt-12 flex items-center justify-center gap-1.5 opacity-40">
            <span className="text-[10px] text-muted-foreground">Powered by</span>
            <BrandLogo className="h-3" />
          </footer>
        )}
      </main>
    </div>
  );
}
