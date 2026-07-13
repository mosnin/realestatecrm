'use client';

/**
 * SiteFooter, light/dark-adaptive footer (reference-matched): the twirling
 * shader-gradient band on top, then the Chippi wordmark + security-practice badges on
 * the left and three link columns on the right, with a © / social meta row.
 */

import Link from 'next/link';
import AnimatedGradientBackground from '@/components/ui/animated-gradient-background';

const columns: Record<string, { label: string; href: string }[]> = {
  Product: [
    { label: 'Agents', href: '/agents' },
    { label: 'Brokerages', href: '/brokerages' },
    { label: 'Integrations', href: '/integrations' },
    { label: 'Pricing', href: '/pricing' },
  ],
  Company: [
    { label: 'Company', href: '/company' },
    { label: 'See a demo', href: '/demo' },
    { label: 'Sign in', href: '/login/realtor' },
  ],
  Resources: [
    { label: 'Help Center', href: '/help' },
    { label: 'Research', href: '/research' },
    { label: 'Status', href: '/status' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ],
};

const SECURITY_PRACTICES = ['Access', 'Audit', 'Privacy'];
const MONO = { fontFamily: 'var(--font-mono)' } as const;

export function SiteFooter() {
  return (
    <footer className="relative bg-white dark:bg-[#0a0a0a]">
      {/* Warm gradient band (Chippi orange / pink / yellow), anchored toward the
          footer and revealing as it scrolls into view. A wide, flat ellipse so
          it reads as a soft wash rather than a tight radial. Fades UP into the
          CTA above and out at the very bottom. */}
      <div className="relative h-60 w-full overflow-hidden sm:h-72">
        <AnimatedGradientBackground
          revealOnScroll
          Breathing
          startingGap={185}
          topOffset={-115}
          breathingRange={6}
          animationSpeed={0.02}
          gradientOrigin="50% 92%"
          gradientColors={['#ffd84d', '#ff8a3d', '#ff5fa2', 'rgba(255,95,162,0)']}
          gradientStops={[0, 38, 72, 100]}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-white dark:to-[#0a0a0a]" />
      </div>

      <div className="relative">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
            {/* Left: logo + security practices. Avoid certification claims unless
                the corresponding audit or attestation can be linked publicly. */}
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-black.png" alt="Chippi" width={512} height={171} className="h-5 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.png" alt="Chippi" width={512} height={171} className="hidden h-5 w-auto dark:block" />
              <span style={MONO} className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-neutral-400 dark:text-white/40">
                <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-500" />
                Security controls
              </span>
              <div className="mt-3 flex items-center gap-2">
                {SECURITY_PRACTICES.map((practice) => (
                  <span
                    key={practice}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-neutral-50 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50"
                  >
                    {practice}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: link columns */}
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {Object.entries(columns).map(([heading, items]) => (
                <div key={heading}>
                  <span style={MONO} className="text-[11px] uppercase tracking-[0.2em] text-neutral-400 dark:text-white/40">
                    {heading}
                  </span>
                  <ul className="mt-4 space-y-2.5">
                    {items.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-white/55 dark:hover:text-white"
                        >
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Meta row */}
          <div className="mt-14 flex flex-col items-center gap-3 border-t border-black/[0.06] pt-6 dark:border-white/[0.08] sm:flex-row sm:justify-between">
            <p className="text-xs text-neutral-400 dark:text-white/40">
              &copy; {new Date().getFullYear()} Chippi, Inc. All rights reserved.
            </p>
            <div className="flex items-center gap-5">
              <a
                href="https://x.com/usechippi"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-700 dark:text-white/40 dark:hover:text-white"
              >
                X
              </a>
              <a
                href="https://www.linkedin.com/company/usechippi"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-neutral-400 transition-colors hover:text-neutral-700 dark:text-white/40 dark:hover:text-white"
              >
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
