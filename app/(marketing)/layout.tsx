/**
 * Marketing route-group layout — the dark, cinematic shell (Giga redesign).
 *
 * Every page under `app/(marketing)/` renders inside this shell, deliberately
 * split from the product:
 *
 *  - Always dark: a near-black (#0a0a0a) canvas with white text, regardless of
 *    the app's light/dark theme toggle. The marketing site is its own visual
 *    world; the product (outside this group) keeps its own type + theme system.
 *  - Type: an elegant light-weight SERIF display face (Fraunces) is the
 *    headline voice, exposed as `--font-serif-display`. Eyebrow labels use a
 *    monospace face (JetBrains Mono) exposed as `--font-mono-display`. Body
 *    stays on the app's system sans.
 *
 * The marketing site is public; Clerk isn't loaded for unauth visitors.
 * Auth-aware pages (the homepage redirects auth users to their workspace)
 * still call `auth()` from their own server component before rendering.
 */

import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { SiteHeader } from '@/components/marketing/giga/header';
import { SiteFooter } from '@/components/marketing/giga/footer';
import { FprScript } from '@/components/affiliate/fpr-script';

// Elegant thin serif display face (the reference's headline voice). Optical
// sizing + a light default weight keep the large headlines refined, not heavy.
const serifDisplay = Fraunces({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-serif-display',
});

// Monospace face for the uppercase eyebrow labels.
const monoDisplay = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono-display',
});

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${serifDisplay.variable} ${monoDisplay.variable} flex min-h-screen flex-col bg-[#0a0a0a] text-white antialiased`}
    >
      {/* FirstPromoter click tracking, sets _fprom_tid cookie from ?fpr= links */}
      <FprScript />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
