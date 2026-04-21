'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MessageSquare, Inbox, Activity, Settings } from 'lucide-react';

type Tab = {
  key: string;
  label: string;
  icon: typeof MessageSquare;
  href: string;
  /** Active when pathname matches and (if provided) searchParam tab equals matchTab. */
  pathMatch: (pathname: string, tab: string | null) => boolean;
};

/**
 * Unified tab bar for the Assistant — lives above /ai (chat) and /agent (drafts,
 * activity, settings). Two routes stay live; the user sees one surface.
 */
export function AssistantTabs({ slug, pendingDrafts = 0 }: { slug: string; pendingDrafts?: number }) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const tab = searchParams?.get('tab') ?? null;

  const tabs: Tab[] = [
    {
      key: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      href: `/s/${slug}/ai`,
      pathMatch: (p) => p === `/s/${slug}/ai` || p.startsWith(`/s/${slug}/ai/`),
    },
    {
      key: 'drafts',
      label: 'Drafts',
      icon: Inbox,
      href: `/s/${slug}/agent`,
      pathMatch: (p, t) => p === `/s/${slug}/agent` && (t === null || t === 'inbox'),
    },
    {
      key: 'activity',
      label: 'Activity',
      icon: Activity,
      href: `/s/${slug}/agent?tab=activity`,
      pathMatch: (p, t) => p === `/s/${slug}/agent` && t === 'activity',
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: Settings,
      href: `/s/${slug}/agent?tab=settings`,
      pathMatch: (p, t) => p === `/s/${slug}/agent` && t === 'settings',
    },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((t) => {
        const isActive = t.pathMatch(pathname, tab);
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            {t.label}
            {t.key === 'drafts' && pendingDrafts > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] rounded-full bg-brand text-brand-foreground text-[10px] font-bold flex items-center justify-center px-1">
                {pendingDrafts > 99 ? '99+' : pendingDrafts}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
