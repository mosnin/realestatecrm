'use client';

/**
 * HomeFooter — the arrival. A last quiet CTA, the full link map, and an
 * oversized Chippi wordmark that anchors the page. Light canvas, editorial.
 * Used on the rebuilt homepage in place of the shared MarketingFooter.
 */

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { Reveal } from './home-kit';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Chippi', href: '/features/chippi' },
      { label: 'People', href: '/features/people' },
      { label: 'Deals', href: '/features/deals' },
      { label: 'Calendar', href: '/features/calendar' },
      { label: 'Studio', href: '/features/studio' },
      { label: 'Files', href: '/features/files' },
    ],
  },
  {
    title: 'For teams',
    links: [
      { label: 'Overview', href: '/teams' },
      { label: 'Lead distribution', href: '/teams/leads' },
      { label: 'Members', href: '/teams/members' },
      { label: 'Analytics', href: '/teams/analytics' },
      { label: 'Templates', href: '/teams/templates' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Blog', href: '/blog' },
      { label: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/legal/privacy' },
      { label: 'Terms', href: '/legal/terms' },
    ],
  },
];

export function HomeFooter() {
  return (
    <footer className="relative bg-card border-t border-border/60">
      <div className="mx-auto max-w-7xl px-6 pt-20 md:px-8 md:pt-28">
        {/* last CTA */}
        <Reveal className="flex flex-col items-start justify-between gap-8 border-b border-black/[0.08] pb-16 md:flex-row md:items-end">
          <h2 className="max-w-2xl text-[clamp(2rem,4.5vw,3.5rem)] font-heading font-semibold leading-[1.04] tracking-[-0.035em] text-foreground">
            Ready to let the busywork run itself?
          </h2>
          <div className="flex gap-3">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center rounded-full bg-foreground px-7 text-[15px] font-medium text-background transition-transform duration-150 active:scale-[0.98]"
            >
              Start free
            </Link>
            <Link
              href="/about"
              className="inline-flex h-12 items-center justify-center rounded-full bg-black/[0.04] px-6 text-[15px] font-medium text-foreground transition-colors hover:bg-black/[0.07]"
            >
              Talk to sales
            </Link>
          </div>
        </Reveal>

        {/* link map */}
        <div className="grid grid-cols-2 gap-8 py-16 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" aria-label="Chippi home" className="inline-flex items-center">
              <BrandLogo className="h-6" alt="Chippi" />
            </Link>
            <p className="mt-4 max-w-[16rem] text-[14px] leading-relaxed text-foreground/50">
              The agentic OS for real estate. You close; Chippi does the rest.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-foreground/40">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[14px] text-foreground/65 transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>

      {/* oversized wordmark */}
      <div aria-hidden className="overflow-hidden px-6 md:px-8">
        <div
          style={{ fontFamily: 'var(--font-title)' }}
          className="select-none text-[clamp(4rem,20vw,16rem)] leading-[0.8] tracking-[-0.03em] text-foreground/[0.06]"
        >
          Chippi
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-8 text-[13px] text-foreground/45 md:flex-row md:px-8">
        <span>© {new Date().getFullYear()} Chippi. All rights reserved.</span>
        <span className="inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          All systems operational
        </span>
      </div>
    </footer>
  );
}
