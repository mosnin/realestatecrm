'use client';

/**
 * Marketing footer (foundation stub).
 *
 * Phase 0 ships a dense, paper-flat footer with column groupings. The
 * polished version lands in `claude/marketing-footer` — don't refactor
 * here, replace.
 *
 * Apple-discipline: no big CTA card at the top of the footer (the page's
 * `<MarketingCTA>` already lives above it), text columns recede, brand
 * mark is small. Footer is reference, not destination.
 */

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

const COLUMNS: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: 'Product',
    items: [
      { href: '/realtors', label: 'For realtors' },
      { href: '/teams', label: 'For teams' },
      { href: '/features', label: 'All features' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Surfaces',
    items: [
      { href: '/features/chippi', label: 'Chippi' },
      { href: '/features/people', label: 'People' },
      { href: '/features/deals', label: 'Deals' },
      { href: '/features/communication', label: 'Communication' },
      { href: '/features/calendar', label: 'Calendar' },
      { href: '/features/properties', label: 'Properties' },
      { href: '/features/studio', label: 'Studio' },
      { href: '/features/files', label: 'Files' },
    ],
  },
  {
    title: 'Teams',
    items: [
      { href: '/teams', label: 'Overview' },
      { href: '/teams/leads', label: 'Lead distribution' },
      { href: '/teams/members', label: 'Members' },
      { href: '/teams/analytics', label: 'Analytics' },
      { href: '/teams/templates', label: 'Templates' },
      { href: '/teams/chat', label: 'Team chat' },
    ],
  },
  {
    title: 'Company',
    items: [
      { href: '/about', label: 'About' },
      { href: '/login/realtor', label: 'Log in' },
      { href: '/legal', label: 'Legal' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer
      className={cn('border-t border-border/60 bg-background')}
      role="contentinfo"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8 py-16 md:py-20">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" aria-label="Chippi home" className="inline-flex items-center">
              <BrandLogo className="h-5" alt="Chippi" />
            </Link>
            <p className="mt-4 text-[13px] text-muted-foreground leading-snug max-w-[14ch]">
              The agentic OS for real-estate agents and brokerages.
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {c.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {c.items.map((it) => (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className="text-[13px] text-foreground/80 hover:text-foreground transition-colors duration-150"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 pt-6 border-t border-border/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">
            © {new Date().getFullYear()} Chippi. All rights reserved.
          </p>
          <p className="text-[12px] text-muted-foreground">
            Built quietly. Shipped daily.
          </p>
        </div>
      </div>
    </footer>
  );
}
