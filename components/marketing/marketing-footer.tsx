/**
 * Marketing footer — paper-flat, 5-column, reference (not destination).
 *
 * Apple discipline: a wall of small text in columns with the brand mark and
 * copyright at the bottom. NO big CTA card here — the page's `<MarketingCTA>`
 * lives above this footer. Hairlines only, no shadows, no gradients, no
 * brand orange. Hover is a single beat: text color shifts from
 * foreground/80 to foreground. No underline, no scale, no chrome.
 *
 * Layout:
 * - 5-column grid on desktop: brand col 1, link cols 2-5.
 * - 2-column on mobile, brand spans both columns at the top.
 *
 * Below the columns: a single hairline strip carries a small operational
 * status line (Apple footers wear this same trust signal in the same quiet
 * voice) and the copyright row. The status link reads as a calm fact, not
 * a marketing claim.
 */

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';

type FooterLink = { href: string; label: string };
type FooterColumn = { title: string; items: FooterLink[] };

const COLUMNS: FooterColumn[] = [
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

const LINK_CLASS =
  'text-[13px] text-foreground/80 hover:text-foreground transition-colors duration-150';

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn('border-t border-border/60 bg-background')}
      role="contentinfo"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8 py-16 md:py-20">
        {/* Columns: brand + 4 link groups. 2-col mobile, 5-col md+. */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 md:gap-12">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              aria-label="Chippi home"
              className="inline-flex items-center"
            >
              <BrandLogo className="h-5" alt="Chippi" />
            </Link>
            <p className="mt-4 text-[13px] leading-snug text-muted-foreground max-w-[14ch]">
              The agentic OS for real-estate agents and brokerages.
            </p>
          </div>

          {/* Link columns */}
          {COLUMNS.map((column) => (
            <nav
              key={column.title}
              aria-label={column.title}
              className="min-w-0"
            >
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {column.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.items.map((item) => (
                  <li key={`${column.title}:${item.href}:${item.label}`}>
                    <Link href={item.href} className={LINK_CLASS}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom strip: status line + copyright row. */}
        <div className="mt-16 border-t border-border/60 pt-6">
          {/* Operational status — quiet trust signal, Apple footer move. */}
          <div className="mb-4">
            <Link
              href="/status"
              className="inline-flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              <span
                aria-hidden
                className="inline-block size-1.5 rounded-full bg-emerald-500"
              />
              All systems operational.
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-[12px] text-muted-foreground">
              &copy; {year} Chippi. All rights reserved.
            </p>
            <p className="text-[12px] text-muted-foreground">
              Built quietly. Shipped daily.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
