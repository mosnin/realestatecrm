/**
 * Marketing route group layout.
 *
 * Every page under `app/(marketing)/` renders inside this shell — nav at top,
 * footer at bottom, content fills the middle. The dashboard chrome (Sidebar,
 * Header) is NOT mounted here.
 *
 * The chrome is the calm site system: a sticky hairline nav and a paper-flat
 * footer that match the product. (The old shell mounted a floating frosted
 * pill nav, an inset charcoal footer, and a scroll-progress bar — the
 * scroll-progress bar was pure decoration and is gone.)
 *
 * The marketing site is public — we don't load Clerk for unauth visitors.
 * Auth-aware pages (the homepage redirects auth users to their workspace)
 * still call `auth()` from their own server component before rendering.
 */

import { SiteNav } from '@/components/marketing/site/nav';
import { SiteFooter } from '@/components/marketing/site/footer';
import { FprScript } from '@/components/affiliate/fpr-script';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* FirstPromoter click tracking — sets _fprom_tid cookie from ?fpr= links */}
      <FprScript />
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
