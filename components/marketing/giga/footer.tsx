'use client';

/**
 * SiteFooter — light/dark-adaptive footer (reference-matched): the twirling
 * shader-gradient band on top, then the Chippi wordmark + COMPLIANT badges on
 * the left and three link columns on the right, with a © / social meta row.
 */

import Link from 'next/link';
import { ShaderGradient } from './shader-gradient';

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
    { label: 'Research', href: '/research' },
    { label: 'Status', href: '/status' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ],
};

const BADGES = ['SOC 2', 'ISO 27001', 'GDPR'];
const MONO = { fontFamily: 'var(--font-mono)' } as const;

export function SiteFooter() {
  return (
    <footer className="relative bg-white dark:bg-[#0a0a0a]">
      {/* Twirling gradient band, fading into the footer surface */}
      <div className="relative h-56 w-full overflow-hidden sm:h-72">
        <ShaderGradient />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-[#0a0a0a]" />
      </div>

      <div className="relative">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
            {/* Left: logo + compliance */}
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-black.png" alt="Chippi" width={512} height={171} className="h-5 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.png" alt="Chippi" width={512} height={171} className="hidden h-5 w-auto dark:block" />
              <span style={MONO} className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-neutral-400 dark:text-white/40">
                <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-500" />
                Compliant
              </span>
              <div className="mt-3 flex items-center gap-2">
                {BADGES.map((b) => (
                  <span
                    key={b}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-neutral-50 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50"
                  >
                    {b}
                  </span>
                ))}
                <span className="text-[11px] text-neutral-400 dark:text-white/35">+ more</span>
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
