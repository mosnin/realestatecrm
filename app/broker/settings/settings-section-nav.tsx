'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const settingsRoutes = [
  ['/broker/settings', 'General'],
  ['/broker/settings/profile', 'My profile'],
  ['/broker/settings/auto-assignment', 'Auto-assignment'],
  ['/broker/settings/routing-rules', 'Routing rules'],
  ['/broker/settings/form-builder', 'Intake form'],
  ['/broker/settings/mcp', 'Agent connections'],
] as const;

export function BrokerSettingsSectionNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible" aria-label="Brokerage settings">
      {settingsRoutes.map(([href, label]) => {
        const active = href === '/broker/settings' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors lg:rounded-xl',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
