'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
  matchPath: string;
}

interface SettingsTabsProps {
  slug: string;
  tabs: Tab[];
}

/**
 * Settings tab strip — client component so the active state derives from the
 * actual current pathname. The previous server-side approach read from
 * `headers()` which Next.js doesn't populate with the pathname by default,
 * so no tab ever rendered as active. This swap fixes that without touching
 * the server-side brokerage-membership data fetch in the parent layout.
 */
export function SettingsTabs({ slug, tabs }: SettingsTabsProps) {
  const pathname = usePathname() || '';

  // Match the deepest tab that is a prefix of the current path. /settings is
  // exact-only so it doesn't shadow /settings/profile etc.
  const activeHref = (() => {
    let best: Tab | null = null;
    for (const tab of tabs) {
      const expected = `/s/${slug}${tab.matchPath}`;
      if (tab.matchPath === '/settings') {
        if (pathname === expected) return tab.href;
      } else if (pathname.startsWith(expected)) {
        if (!best || tab.matchPath.length > best.matchPath.length) best = tab;
      }
    }
    return best?.href ?? null;
  })();

  return (
    <nav
      className="flex items-center gap-1 border-b border-border/60 -mx-2 px-2 overflow-x-auto"
      aria-label="Settings sections"
    >
      {tabs.map((tab) => {
        const isActive = activeHref === tab.href;
        return (
          <Link
            key={tab.href}
            href={`/s/${slug}${tab.href}`}
            className={`flex items-center px-3 py-2 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors duration-150 ${
              isActive
                ? 'border-foreground text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
