/**
 * Footer — calm, paper-flat.
 *
 * Replaces the inset charcoal card. Sits on the page background with a single
 * hairline above it, like the rest of the site. The brand wordmark swaps with
 * the theme (BrandLogo), links are muted, and the status dot stays.
 */

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

const columns = {
  Product: [
    { label: 'For realtors', href: '/realtors' },
    { label: 'For brokerages', href: '/brokerages' },
    { label: 'Integrations', href: '/integrations' },
    { label: 'Pricing', href: '/pricing' },
  ],
  Company: [
    { label: 'Company', href: '/company' },
    { label: 'Book a demo', href: '/demo' },
    { label: 'Status', href: '/status' },
    { label: 'Log in', href: '/login/realtor' },
  ],
  Legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Legal', href: '/legal' },
  ],
};

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 space-y-4 md:col-span-1">
            <Link href="/" className="flex items-center gap-2" aria-label="Chippi home">
              <BrandLogo className="h-5" alt="Chippi" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              The agentic OS for real-estate agents and brokerages. The busywork
              runs itself, so the hours go to closing.
            </p>
          </div>

          {Object.entries(columns).map(([heading, items]) => (
            <div key={heading}>
              <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {heading}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {items.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-2 border-t border-border/60 pt-6 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Chippi. All rights reserved.
          </p>
          <Link
            href="/status"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <span aria-hidden className="inline-block size-1.5 rounded-full bg-emerald-500" />
            All systems operational.
          </Link>
        </div>
      </div>
    </footer>
  );
}
