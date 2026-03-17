'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { primaryNavItems, secondaryNavItems } from '@/lib/nav-items';
import { Building2, Settings, ChevronRight, Sparkles } from 'lucide-react';

interface SidebarProps {
  slug: string;
  spaceName: string;
  spaceEmoji: string;
  unreadLeadCount: number;
  isBroker?: boolean;
}

export function Sidebar({ slug, spaceName, spaceEmoji, unreadLeadCount, isBroker = false }: SidebarProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { user } = useUser();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'My Account'
    : 'My Account';
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';

  return (
    <aside className="hidden md:flex flex-col w-60 h-full bg-sidebar border-r border-sidebar-border shrink-0">

      {/* Brand */}
      <div className="px-5 pt-5 pb-4 flex items-center">
        <BrandLogo className="h-4" alt="Chippi" />
      </div>

      {/* Workspace card */}
      <div className="px-3 pb-3">
        <Link
          href={`${base}/settings`}
          className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 bg-accent/50 hover:bg-accent border border-border/40 transition-all duration-200"
        >
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-lg flex-shrink-0">
            {spaceEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">
              {spaceName}
            </p>
            <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{slug}</p>
          </div>
          <Settings
            size={13}
            className="text-muted-foreground/40 flex-shrink-0 group-hover:text-muted-foreground/70 transition-colors"
          />
        </Link>
      </div>

      <div className="mx-4 border-t border-sidebar-border/40 mb-1" />

      {/* Primary nav */}
      <nav className="flex-1 px-3 pt-2 pb-2 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
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
                'group flex items-center gap-2.5 py-[7px] pr-3 rounded-xl text-sm font-medium transition-all duration-200 pl-3',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon
                size={15}
                className={cn(
                  'flex-shrink-0 transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-45 group-hover:opacity-75'
                )}
              />
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="truncate">{item.label}</span>
                {item.href === '/leads' && unreadLeadCount > 0 && (
                  <span
                    className={cn(
                      'inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-bold tabular-nums flex-shrink-0',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-primary text-primary-foreground'
                    )}
                  >
                    {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
                  </span>
                )}
                {item.href === '/ai' && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-primary/10 text-primary flex-shrink-0 leading-none">
                    <Sparkles size={8} />
                    AI
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav */}
      <div className="px-3 pb-2 border-t border-sidebar-border/40 pt-3 space-y-0.5">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Account
        </p>
        {isBroker && (
          <Link
            href="/broker"
            className="group flex items-center gap-2.5 py-[7px] pr-3 rounded-xl text-sm font-medium pl-3 transition-all duration-200 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Building2 size={15} className="flex-shrink-0 opacity-45 group-hover:opacity-75 transition-opacity" />
            Brokerage
          </Link>
        )}
        {secondaryNavItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'group flex items-center gap-2.5 py-[7px] pr-3 rounded-xl text-sm font-medium transition-all duration-200 pl-3',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon
                size={15}
                className={cn(
                  'flex-shrink-0 transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-45 group-hover:opacity-75'
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* User card */}
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border/40">
        <Link
          href={`${base}/profile`}
          className="group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 hover:bg-sidebar-accent transition-colors"
        >
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={displayName}
              className="w-8 h-8 rounded-full flex-shrink-0 object-cover ring-2 ring-sidebar-border/60"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground leading-tight truncate">
              {displayName}
            </p>
            {email && (
              <p className="text-[11px] text-muted-foreground/55 truncate mt-0.5">{email}</p>
            )}
          </div>
          <ChevronRight
            size={13}
            className="text-muted-foreground/35 flex-shrink-0 group-hover:text-muted-foreground/65 transition-colors"
          />
        </Link>
      </div>
    </aside>
  );
}
