'use client';

/**
 * SiteFooter — the dark, cinematic footer (reference-matched).
 *
 * A closing CTA block (big serif sign-off + white pill) over a hairline rule,
 * then link columns and a meta row, all on near-black. Copy is Chippi/
 * real-estate. Replaces the old pastel footer for the redesigned marketing site.
 */

import Link from 'next/link';
import { BlurRise, Eyebrow, PillPrimary, PillGhost, Serif } from './primitives';

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
    { label: 'Status', href: '/status' },
    { label: 'Sign in', href: '/login/realtor' },
  ],
  Legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Legal', href: '/legal' },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.08] bg-black">
      {/* Closing CTA */}
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <BlurRise>
          <div className="flex flex-col items-center text-center">
            <Eyebrow>Get started</Eyebrow>
            <Serif className="mt-6 max-w-2xl text-[2.25rem] leading-[1.05] text-white sm:text-[3.25rem]">
              Give every agent a Chippi.
            </Serif>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/60">
              See it run on your own numbers — the inbox, the drafts, the board —
              in a 15-minute walkthrough.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <PillPrimary href="/demo" withArrow>
                See a demo
              </PillPrimary>
              <PillGhost href="/login/realtor">Talk to us</PillGhost>
            </div>
          </div>
        </BlurRise>
      </div>

      {/* Links */}
      <div className="border-t border-white/[0.08]">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-white.png" alt="Chippi" width={512} height={171} className="h-5 w-auto" />
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/45">
                The AI cowork for real-estate agents and brokerages — the busywork runs
                itself so the hours go to closing.
              </p>
            </div>
            {Object.entries(columns).map(([heading, items]) => (
              <div key={heading}>
                <h4
                  style={{ fontFamily: 'var(--font-mono-display)' }}
                  className="text-[11px] uppercase tracking-[0.18em] text-white/40"
                >
                  {heading}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {items.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-white/55 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Meta row */}
          <div className="mt-14 flex flex-col items-center gap-2 border-t border-white/[0.08] pt-6 sm:flex-row sm:justify-between">
            <p className="text-xs text-white/40">
              &copy; {new Date().getFullYear()} Chippi. All rights reserved.
            </p>
            <Link
              href="/status"
              className="inline-flex items-center gap-2 text-xs text-white/40 transition-colors hover:text-white"
            >
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-400" />
              All systems operational
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
