'use client';

import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

const navItems = [
  { href: '#problem', label: 'Problem' },
  { href: '#solution', label: 'Solution' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' }
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 flex flex-row items-center justify-between border-b border-border/60 bg-background/85 px-6 py-5 backdrop-blur lg:px-10">
      <Link href="/" className="flex items-center" aria-label="Chippi home">
        <BrandLogo className="h-7" alt="Chippi" />
      </Link>

      <nav className="hidden lg:flex flex-row items-center gap-7" aria-label="Main navigation">
        {navItems.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <Link
        href="/sign-in"
        className="rainbow-outline-btn rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        Log in
      </Link>
    </header>
  );
}
