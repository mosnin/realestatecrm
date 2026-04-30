import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

type Tab = { href: string; label: string; matchPath: string };

const BASE_TABS: Tab[] = [
  { href: '/settings', label: 'General', matchPath: '/settings' },
  { href: '/settings/profile', label: 'Profile', matchPath: '/settings/profile' },
  { href: '/settings/notifications', label: 'Notifications', matchPath: '/settings/notifications' },
  { href: '/settings/integrations', label: 'Integrations', matchPath: '/settings/integrations' },
  { href: '/settings/templates', label: 'Templates', matchPath: '/settings/templates' },
  { href: '/settings/legal', label: 'Legal', matchPath: '/settings/legal' },
];

const BROKERAGE_TAB: Tab = {
  href: '/settings/brokerage',
  label: 'Brokerage',
  matchPath: '/settings/brokerage',
};

/**
 * Settings layout — single-line underline tab strip above each settings page.
 * No subtitle on the parent header; each child page carries its own serif
 * title. Brokerage tab appears only when the user has a pending invitation
 * or active brokerage membership.
 */
export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const h = await headers();
  const pathname = h.get('x-pathname') || h.get('next-url') || '';

  // Brokerage tab visibility — only show if the user has a pending invite or
  // an active brokerage row keyed off their email. Failures fall back to
  // hiding the tab; the page itself still works via direct URL.
  let showBrokerage = false;
  try {
    const { userId } = await auth();
    if (userId) {
      const { data: user } = await supabase
        .from('User')
        .select('email, brokerageId')
        .eq('clerkId', userId)
        .maybeSingle();
      const email = user?.email?.toLowerCase() ?? null;
      if (user?.brokerageId) {
        showBrokerage = true;
      } else if (email) {
        const { data: inv } = await supabase
          .from('Invitation')
          .select('id')
          .ilike('email', email)
          .eq('status', 'pending')
          .limit(1);
        showBrokerage = (inv?.length ?? 0) > 0;
      }
    }
  } catch {
    showBrokerage = false;
  }

  const tabs: Tab[] = showBrokerage ? [...BASE_TABS, BROKERAGE_TAB] : BASE_TABS;

  // Match the deepest tab that is a prefix of the current path. /settings is
  // exact-only so it doesn't shadow /settings/profile etc.
  const activeTab = (() => {
    let best: Tab | null = null;
    for (const tab of tabs) {
      const expected = `/s/${slug}${tab.matchPath}`;
      if (tab.matchPath === '/settings') {
        if (pathname === expected) return tab;
      } else if (pathname.startsWith(expected)) {
        if (!best || tab.matchPath.length > best.matchPath.length) best = tab;
      }
    }
    return best;
  })();

  return (
    <div className="space-y-8">
      <h1
        className="text-3xl tracking-tight text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        Settings
      </h1>

      <nav
        className="flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto"
        aria-label="Settings sections"
      >
        {tabs.map((tab) => {
          const isActive = activeTab?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={`/s/${slug}${tab.href}`}
              className={`flex items-center px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors duration-150 ${
                isActive
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div>{children}</div>
    </div>
  );
}
