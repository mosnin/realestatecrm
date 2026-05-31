/**
 * Marketing route group layout.
 *
 * Every page under `app/(marketing)/` renders inside this shell — nav at
 * top, footer at bottom, content fills the middle. The dashboard chrome
 * (Sidebar, Header) is NOT mounted here.
 *
 * The marketing site is public — we don't load Clerk for unauth visitors.
 * Auth-aware pages (the homepage redirects auth users to their workspace)
 * still call `auth()` from their own server component before rendering.
 */

import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
