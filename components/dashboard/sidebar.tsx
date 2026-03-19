'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { primaryNavItems, secondaryNavItems } from '@/lib/nav-items';
import { Building2, Settings, ChevronRight, Sparkles, Users, UserCircle, Mail, LayoutDashboard, SlidersHorizontal, Briefcase, ArrowLeftRight } from 'lucide-react';

interface SidebarProps {
  slug: string;
  spaceName: string;
  spaceEmoji: string;
  unreadLeadCount: number;
  isBroker?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
}

const brokerTeamNavItems = [
  { href: '/broker', label: 'Team Overview', icon: LayoutDashboard, exact: true },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
  { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
  { href: '/broker/settings', label: 'Settings', icon: SlidersHorizontal, exact: false },
];

export function Sidebar({ slug, spaceName, spaceEmoji, unreadLeadCount, isBroker = false, brokerageName = null, brokerageRole = null }: SidebarProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { user } = useUser();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'My Account'
    : 'My Account';
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';

  const isMemberOfBrokerage = !!brokerageName;
  const isOnBrokerPage = pathname.startsWith('/broker');

  // ── Broker-focused sidebar (when on /broker/* pages) ──
  if (isBroker && isOnBrokerPage) {
    return (
      <aside className="hidden md:flex flex-col w-60 h-full bg-sidebar border-r border-sidebar-border shrink-0">
        {/* ── Brand ── */}
        <div className="px-5 pt-5 pb-4 flex items-center">
          <BrandLogo className="h-4" alt="Chippi" />
        </div>

        {/* ── Brokerage context card ── */}
        <div className="px-3 pb-3">
          <Link
            href="/broker/settings"
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 bg-primary/5 hover:bg-primary/10 border border-primary/15 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">
                {brokerageName}
              </p>
              <p className="text-[11px] text-primary/60 truncate mt-0.5">
                Brokerage · {brokerageRole === 'broker_owner' ? 'Owner' : 'Manager'}
              </p>
            </div>
            <Settings
              size={13}
              className="text-muted-foreground/40 flex-shrink-0 group-hover:text-muted-foreground/70 transition-colors"
            />
          </Link>
        </div>

        <div className="mx-4 border-t border-sidebar-border/50 mb-1" />

        {/* ── Team nav (primary when on broker pages) ── */}
        <nav className="flex-1 px-3 pt-2 pb-2 space-y-0.5 overflow-y-auto">
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45">
            Team
          </p>
          {brokerTeamNavItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-2.5 py-[7px] pr-3 rounded-lg text-sm font-medium transition-all duration-150 border-l-[3px] pl-[9px]',
                  isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon
                  size={15}
                  className={cn(
                    'flex-shrink-0 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-45 group-hover:opacity-75'
                  )}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ── Switch to workspace ── */}
        <div className="px-3 pb-2 border-t border-sidebar-border/50 pt-3">
          <Link
            href={base}
            className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent border border-sidebar-border/40 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-sm flex-shrink-0">
              {spaceEmoji}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{spaceName}</p>
              <p className="text-[10px] text-muted-foreground/50">My workspace</p>
            </div>
            <ArrowLeftRight
              size={11}
              className="text-muted-foreground/35 flex-shrink-0 group-hover:text-muted-foreground/65 transition-colors"
            />
          </Link>
        </div>

        {/* ── User card ── */}
        <div className="px-3 pb-4 pt-2 border-t border-sidebar-border/50">
          <Link
            href={`${base}/profile`}
            className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent transition-colors"
          >
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={displayName}
                className="w-8 h-8 rounded-full flex-shrink-0 object-cover ring-2 ring-sidebar-border"
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

  // ── Standard workspace sidebar ──
  return (
    <aside className="hidden md:flex flex-col w-60 h-full bg-sidebar border-r border-sidebar-border shrink-0">

      {/* ── Brand ── */}
      <div className="px-5 pt-5 pb-4 flex items-center">
        <BrandLogo className="h-4" alt="Chippi" />
      </div>

      {/* ── Workspace card ── */}
      <div className="px-3 pb-3">
        <Link
          href={`${base}/settings`}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 bg-sidebar-accent/60 hover:bg-sidebar-accent border border-sidebar-border/60 transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-lg flex-shrink-0 shadow-inner">
            {spaceEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight truncate text-sidebar-foreground">
              {spaceName}
            </p>
            {isMemberOfBrokerage ? (
              <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 flex items-center gap-1">
                <Building2 size={9} className="flex-shrink-0" />
                {brokerageName}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">{slug}</p>
            )}
          </div>
          <Settings
            size={13}
            className="text-muted-foreground/40 flex-shrink-0 group-hover:text-muted-foreground/70 transition-colors"
          />
        </Link>
      </div>

      <div className="mx-4 border-t border-sidebar-border/50 mb-1" />

      {/* ── Primary nav ── */}
      <nav className="flex-1 px-3 pt-2 pb-2 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45">
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
                'group flex items-center gap-2.5 py-[7px] pr-3 rounded-lg text-sm font-medium transition-all duration-150 border-l-[3px] pl-[9px]',
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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
                {/* Unread leads badge */}
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
                {/* AI badge */}
                {item.href === '/ai' && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400 flex-shrink-0 leading-none">
                    <Sparkles size={8} />
                    AI
                  </span>
                )}
              </span>
            </Link>
          );
        })}

        {/* ── Team section (broker only — compact link to switch to broker dashboard) ── */}
        {isBroker && (
          <>
            <div className="mx-1 my-2 border-t border-sidebar-border/50" />
            <Link
              href="/broker"
              className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent border border-sidebar-border/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                <Building2 size={14} className="text-primary/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{brokerageName}</p>
                <p className="text-[10px] text-muted-foreground/50">Team dashboard</p>
              </div>
              <ArrowLeftRight
                size={11}
                className="text-muted-foreground/35 flex-shrink-0 group-hover:text-muted-foreground/65 transition-colors"
              />
            </Link>
          </>
        )}
      </nav>

      {/* ── Join a team (realtors without a brokerage) ── */}
      {!isMemberOfBrokerage && (
        <div className="px-3 pb-1">
          <Link
            href="/brokerage"
            className="group flex items-center gap-2.5 py-[7px] pr-3 rounded-lg text-sm font-medium transition-all duration-150 border-l-[3px] border-transparent pl-[9px] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Building2
              size={15}
              className="flex-shrink-0 opacity-45 group-hover:opacity-75 transition-opacity"
            />
            <span className="truncate">Join a team</span>
          </Link>
        </div>
      )}

      {/* ── Secondary nav ── */}
      <div className="px-3 pb-2 border-t border-sidebar-border/50 pt-3 space-y-0.5">
        <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/45">
          Account
        </p>
        {secondaryNavItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'group flex items-center gap-2.5 py-[7px] pr-3 rounded-lg text-sm font-medium transition-all duration-150 border-l-[3px] pl-[9px]',
                isActive
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
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

      {/* ── User card ── */}
      <div className="px-3 pb-4 pt-2 border-t border-sidebar-border/50">
        <Link
          href={`${base}/profile`}
          className="group flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-sidebar-accent transition-colors"
        >
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={displayName}
              className="w-8 h-8 rounded-full flex-shrink-0 object-cover ring-2 ring-sidebar-border"
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
