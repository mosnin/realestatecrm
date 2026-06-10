'use client';

/**
 * Nav — calm sticky bar.
 *
 * Replaces the floating frosted pill with mega-menu dropdowns. The product is
 * a quiet sticky header with a hairline under it; the marketing nav now is
 * too. Flat links (no dropdowns — a four-item nav doesn't need a mega-menu),
 * foreground primary CTA, honest "Start free trial" (the old nav said "Start
 * free" and "One plan, honest pricing", neither of which is true).
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { FortitudoThemeToggle } from '@/components/marketing/fortitudo/theme-toggle';

const links = [
  { label: 'Realtors', href: '/realtors' },
  { label: 'Brokerages', href: '/brokerages' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Company', href: '/company' },
];

export function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Chippi home">
          <BrandLogo className="h-5" alt="Chippi" />
        </Link>

        {/* Desktop links */}
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          <div className="hidden items-center gap-1.5 lg:flex">
            <FortitudoThemeToggle />
            <Link
              href="/login/realtor"
              className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Log in
            </Link>
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
            >
              Start free trial
            </Link>
          </div>

          <FortitudoThemeToggle className="lg:hidden" />
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/[0.06] lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] bg-background lg:hidden">
          <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
            <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              <BrandLogo className="h-5" alt="Chippi" />
            </Link>
            <button
              aria-label="Close menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-foreground/[0.06]"
              onClick={() => setMobileOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-4 py-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-2 py-3 text-lg text-foreground transition-colors hover:bg-foreground/[0.04]"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-6 space-y-3 border-t border-border/60 pt-6">
              <Link
                href="/login/realtor?intent=signup"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-full items-center justify-center rounded-full bg-foreground text-sm font-medium text-background"
              >
                Start free trial
              </Link>
              <Link
                href="/login/realtor"
                onClick={() => setMobileOpen(false)}
                className="flex h-11 w-full items-center justify-center rounded-full border border-border/70 text-sm font-medium text-foreground"
              >
                Log in
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
