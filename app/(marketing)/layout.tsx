/**
 * Marketing route group layout — the "bold canvas" shell.
 *
 * Every page under `app/(marketing)/` renders inside this shell. The marketing
 * site is its own visual world, deliberately split from the product:
 *
 *  - Canvas, not paper: the page background is a tinted canvas (warm bone in
 *    light, near-black in dark) and content lives in big rounded color-blocked
 *    cards that sit ON it.
 *  - Display type: Inter Tight (via next/font, self-hosted) is the headline
 *    voice; Instrument Serif italic is the accent flourish. `--font-title` is
 *    overridden HERE so every legacy serif-Times headline in the marketing
 *    tree resolves to the display face — the product (outside this group)
 *    keeps its own type system untouched.
 *
 * The marketing site is public — we don't load Clerk for unauth visitors.
 * Auth-aware pages (the homepage redirects auth users to their workspace)
 * still call `auth()` from their own server component before rendering.
 */

import { Inter_Tight, Instrument_Serif } from 'next/font/google';
import { SiteNav } from '@/components/marketing/site/nav';
import { SiteFooter } from '@/components/marketing/site/footer';
import { FprScript } from '@/components/affiliate/fpr-script';

const display = Inter_Tight({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-display',
});

const accent = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-accent',
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${display.variable} ${accent.variable} flex min-h-screen flex-col bg-[#f3f1ed] text-[#141414] dark:bg-[#0a0a0b] dark:text-[#f5f5f4]`}
      style={{ '--font-title': 'var(--font-display)' } as React.CSSProperties}
    >
      {/* FirstPromoter click tracking — sets _fprom_tid cookie from ?fpr= links */}
      <FprScript />
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
