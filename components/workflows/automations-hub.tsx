'use client';

/**
 * One surface for standing orders: when something happens, or on a schedule.
 * The old hub stacked two managers, four metrics, a tour, and a template
 * bazaar. This is a tab and a list.
 */

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WorkflowsManager } from '@/components/workflows/workflows-manager';
import { RoutinesManager } from '@/components/routines/routines-manager';
import { cn } from '@/lib/utils';

type Tab = 'when' | 'schedule';

function tabFromLocation(hash: string, routineQuery: boolean): Tab {
  if (routineQuery || hash.startsWith('#routine')) return 'schedule';
  if (hash.startsWith('#workflow') || hash === '#workflows') return 'when';
  if (hash === '#routines' || hash === '#schedule') return 'schedule';
  return 'when';
}

export function AutomationsHub() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('when');

  useEffect(() => {
    setTab(tabFromLocation(window.location.hash, searchParams.get('routine') === '1'));
  }, [searchParams]);

  function select(next: Tab) {
    setTab(next);
    const hash = next === 'when' ? 'workflows' : 'routines';
    router.replace(`${pathname}${window.location.search}#${hash}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Automation type" className="flex items-center gap-6 border-b border-border/70">
        {(
          [
            { value: 'when' as const, label: 'Automations', hint: 'Leads, replies, deals and scheduled work' },
            { value: 'schedule' as const, label: 'Scheduled reviews', hint: 'Existing routines that prepare work' },
          ] as const
        ).map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => select(item.value)}
              className={cn(
                'relative pb-2.5 text-left text-sm transition-colors -mb-px',
                active ? 'font-medium text-foreground' : 'font-normal text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="block">{item.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground/80">{item.hint}</span>
              {active && (
                <span aria-hidden className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-foreground" />
              )}
            </button>
          );
        })}
      </div>

      {tab === 'when' ? (
        <WorkflowsManager />
      ) : (
        <RoutinesManager apiBase="/api/routines" startOpen={searchParams.get('routine') === '1'} />
      )}
    </div>
  );
}
