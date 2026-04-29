import Link from 'next/link';
import { headers } from 'next/headers';

// Five tabs, not seven. Templates moves to Chippi memory in Phase 4 (the
// agent owns its own message templates). Legal goes back to a footer link
// because it's not a setting — it's a document. Both routes stay live.
const SETTINGS_TABS: { href: string; label: string; matchPath: string }[] = [
  { href: '/settings', label: 'Account', matchPath: '/settings' },
  { href: '/settings/profile', label: 'Profile', matchPath: '/settings/profile' },
  { href: '/settings/notifications', label: 'Notifications', matchPath: '/settings/notifications' },
  { href: '/settings/integrations', label: 'Integrations', matchPath: '/settings/integrations' },
  { href: '/billing', label: 'Billing', matchPath: '/billing' },
];

/**
 * Settings layout — renders an in-page tab strip above each settings page.
 * Replaces the sidebar children that were dropped in Phase 0; the routes
 * themselves are unchanged.
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

  // Match the deepest tab that is a prefix of the current path. /settings is
  // exact-only so it doesn't shadow /settings/profile etc.
  const activeTab = (() => {
    let best: typeof SETTINGS_TABS[number] | null = null;
    for (const tab of SETTINGS_TABS) {
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
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Account, profile, billing, and how Chippi reaches you.
        </p>
      </header>

      <nav
        className="flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto"
        aria-label="Settings sections"
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={`/s/${slug}${tab.href}`}
              className={`flex items-center px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors ${
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
