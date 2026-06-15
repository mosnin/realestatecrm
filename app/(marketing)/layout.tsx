/**
 * Marketing route-group layout — the dark, cinematic shell ("Giga" redesign).
 *
 * Every page under `app/(marketing)/` renders inside this shell, which is a
 * deliberately separate visual world from the product:
 *
 *  - ALWAYS DARK. A near-black (#0a0a0a) canvas with light text, regardless of
 *    the app's light/dark theme toggle. The `dark` class is forced ON this
 *    subtree so the legacy sub-pages (pricing / realtors / deals / …), which
 *    were authored with `dark:` variants, also render their dark treatment on
 *    this shell instead of flashing white cards. The product (outside this
 *    group) keeps its own theme + type system untouched.
 *
 *  - SERIF DISPLAY HEADLINES. An elegant, high-contrast serif (Fraunces, with
 *    a high optical-size axis + light weight) is the headline voice, exposed as
 *    `--font-serif-display`. ROOT CAUSE FIXED: the previous shell forced
 *    `--font-title → --font-display` (Bricolage Grotesque) and slapped
 *    `font-display` on the wrapper, so every headline rendered as a heavy sans.
 *    That override is GONE. The shell is tagged `data-marketing-shell`; a
 *    scoped rule in globals.css makes the serif the DEFAULT for every heading
 *    in the tree (out-specifying the global `h1..h6 { --font-heading }` base
 *    rule), so headlines render large + thin even where a component leans on a
 *    class. Body text stays on a clean system sans.
 *
 *  - EYEBROWS in monospace (JetBrains Mono), exposed as `--font-mono-display`.
 *
 * The marketing site is public; Clerk isn't loaded for unauth visitors (the
 * middleware sets `x-public-page` and the root layout skips ClerkProvider).
 * Auth-aware pages (the homepage redirects auth users to their workspace) still
 * call `auth()` from their own server component before rendering.
 */

import { Fraunces, JetBrains_Mono } from 'next/font/google';
import { SiteHeader } from '@/components/marketing/giga/header';
import { SiteFooter } from '@/components/marketing/giga/footer';
import { FprScript } from '@/components/affiliate/fpr-script';

// Elegant high-contrast serif display face — the reference's headline voice.
// Fraunces is a VARIABLE font: requesting the `opsz` axis means the weight axis
// must stay variable (next/font forbids pinning discrete `weight`s alongside
// `axes`). We get the full weight range too, so the scoped CSS in globals.css
// can push optical sizing high AND keep the weight light — the thin, refined
// large headlines of the reference, not the chunky low-opsz default.
const serifDisplay = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
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
      // `dark` is forced so this shell is dark regardless of the user's theme,
      // and so legacy sub-pages' `dark:` variants resolve to their dark look.
      // `data-marketing-shell` scopes the serif-headline + mono-eyebrow rules
      // in globals.css to this subtree only.
      data-marketing-shell
      className={`dark ${serifDisplay.variable} ${monoDisplay.variable} flex min-h-screen flex-col bg-[#0a0a0a] text-white antialiased`}
    >
      {/* FirstPromoter click tracking, sets _fprom_tid cookie from ?fpr= links */}
      <FprScript />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
