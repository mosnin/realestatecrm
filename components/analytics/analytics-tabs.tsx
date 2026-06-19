'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

interface Tab {
  href: string;
  label: string;
  matchPath: string;
}

/**
 * Analytics tab strip — underline pattern, paper-flat.
 * Active tab gets a foreground bottom border; idle tabs are muted. The active
 * underline is a single shared element that slides between tabs (layoutId) so
 * switching sections reads as one continuous motion rather than a hard cut.
 */
export function AnalyticsTabs({ slug }: { slug: string }) {
  const pathname = usePathname() || '';
  const reduce = useReducedMotion();

  const tabs: Tab[] = [
    { href: '/analytics', label: 'Overview', matchPath: '/analytics' },
    { href: '/analytics/leads', label: 'Leads', matchPath: '/analytics/leads' },
    { href: '/analytics/clients', label: 'Clients', matchPath: '/analytics/clients' },
    { href: '/analytics/tours', label: 'Tours', matchPath: '/analytics/tours' },
    { href: '/analytics/pipeline', label: 'Pipeline', matchPath: '/analytics/pipeline' },
    { href: '/analytics/form-traffic', label: 'Form traffic', matchPath: '/analytics/form-traffic' },
  ];

  // Match the deepest tab that is a prefix of the current path. /analytics is
  // exact-only so it doesn't shadow /analytics/leads etc.
  const activeHref = (() => {
    let best: Tab | null = null;
    for (const tab of tabs) {
      const expected = `/s/${slug}${tab.matchPath}`;
      if (tab.matchPath === '/analytics') {
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
      aria-label="Analytics sections"
    >
      {tabs.map((tab) => {
        const isActive = activeHref === tab.href;
        return (
          <Link
            key={tab.href}
            href={`/s/${slug}${tab.href}`}
            className={`relative flex items-center px-3 py-2 -mb-px text-sm whitespace-nowrap transition-colors duration-150 ${
              isActive
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
            {isActive && (
              <motion.span
                layoutId="analytics-tab-underline"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground"
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: DURATION_BASE, ease: EASE_OUT }
                }
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
