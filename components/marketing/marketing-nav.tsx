'use client';

/**
 * Marketing nav (foundation stub).
 *
 * Phase 0 ships a quiet top-bar that resolves all the routes and reads as
 * paper-flat. The Apple-style mega menu (desktop hover panels + mobile
 * full-screen drawer) lands in PR `claude/marketing-nav`, which replaces
 * this stub. Don't refactor here — replace.
 *
 * The stub still meets the bar: brand-left, nav-right, Log in + Start free
 * trial buttons, sticky with backdrop blur, hairline border under. That
 * way every marketing page is shippable from day 0.
 */

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { cn } from '@/lib/utils';
import { PRIMARY_PILL, GHOST_PILL } from '@/lib/typography';

const NAV_ITEMS = [
  { href: '/realtors', label: 'Realtors' },
  { href: '/teams', label: 'Teams' },
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
];

export function MarketingNav() {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full',
        'bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70',
        'border-b border-border/60',
      )}
    >
      <nav className="mx-auto max-w-7xl px-6 md:px-8 h-16 flex items-center justify-between">
        <Link href="/" aria-label="Chippi home" className="flex items-center">
          <BrandLogo className="h-5" alt="Chippi" />
        </Link>
        <ul className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((it) => (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  'inline-flex items-center h-9 px-3 rounded-md text-sm font-medium',
                  'text-foreground/80 hover:text-foreground hover:bg-foreground/[0.04]',
                  'transition-colors duration-150',
                )}
              >
                {it.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link href="/login/realtor" className={cn(GHOST_PILL, 'hidden sm:inline-flex')}>
            Log in
          </Link>
          <Link href="/login/realtor?intent=signup" className={PRIMARY_PILL}>
            Start free trial
          </Link>
        </div>
      </nav>
    </header>
  );
}
