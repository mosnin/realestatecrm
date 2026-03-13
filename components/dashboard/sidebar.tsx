'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { primaryNavItems, secondaryNavItems } from '@/lib/nav-items';

interface SidebarProps {
  slug: string;
  spaceName: string;
  spaceEmoji: string;
  unreadLeadCount: number;
}

export function Sidebar({ slug, spaceName, spaceEmoji, unreadLeadCount }: SidebarProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;

  return (
    <aside className="hidden md:flex flex-col w-60 h-full bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Workspace header */}
      <div className="px-4 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base flex-shrink-0">
            {spaceEmoji}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">{spaceName}</p>
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{slug}</p>
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Workspace
        </p>
        {primaryNavItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive =
            item.href === '' ? pathname === base : pathname.startsWith(`${base}${item.href}`);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon
                size={16}
                className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')}
              />
              <span className="flex items-center gap-2 flex-1 min-w-0">
                <span className="truncate">{item.label}</span>
                {item.href === '/leads' && unreadLeadCount > 0 ? (
                  <span
                    className={cn(
                      'inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold flex-shrink-0',
                      isActive ? 'bg-white/25 text-white' : 'bg-primary text-primary-foreground'
                    )}
                  >
                    {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav + branding */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-sidebar-border pt-3">
        {secondaryNavItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon
                size={16}
                className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')}
              />
              {item.label}
            </Link>
          );
        })}
        <div className="flex items-center gap-2 px-3 pt-3">
          <BrandLogo className="h-4" alt="Chippi" />
        </div>
      </div>
    </aside>
  );
}
