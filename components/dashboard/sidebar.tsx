'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { primaryNavItems, secondaryNavItems } from '@/lib/nav-items';
import {
  Building2,
  ChevronRight,
  Users,
  UserCircle,
  Mail,
  LayoutDashboard,
  SlidersHorizontal,
  Briefcase,
} from 'lucide-react';

interface SidebarProps {
  slug: string;
  spaceName: string;
  spaceEmoji: string;
  unreadLeadCount: number;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
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

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon
        size={15}
        className={cn(
          'flex-shrink-0',
          isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

export function Sidebar({
  slug,
  spaceName,
  unreadLeadCount,
  isBroker = false,
  isBrokerOnly = false,
  brokerageName = null,
  brokerageRole = null,
}: SidebarProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { user } = useUser();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'My Account'
    : 'My Account';

  const isOnBrokerPage = pathname.startsWith('/broker');

  // ── Broker sidebar (when on /broker/* pages or broker-only account) ──
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return (
      <aside className="hidden md:flex flex-col w-[220px] h-full bg-sidebar border-r border-border shrink-0">
        <div className="px-4 pt-4 pb-3">
          <BrandLogo className="h-4" alt="Chippi" />
        </div>

        {/* Context: Brokerage */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 size={13} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate text-foreground leading-tight">
                {brokerageName}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {brokerageRole === 'broker_owner' ? 'Owner' : 'Manager'}
              </p>
            </div>
          </div>
        </div>

        <div className="mx-3 border-t border-border" />

        {/* Team nav */}
        <nav className="flex-1 px-3 pt-3 pb-2 space-y-0.5 overflow-y-auto">
          {brokerTeamNavItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <NavItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActive}
              />
            );
          })}
        </nav>

        {/* Switch to personal workspace */}
        {!isBrokerOnly && slug && (
          <>
            <div className="mx-3 border-t border-border" />
            <div className="px-3 py-2">
              <Link
                href={base}
                className="group flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Briefcase
                  size={15}
                  className="flex-shrink-0 text-muted-foreground/70 group-hover:text-foreground"
                />
                <span className="flex-1 truncate">{spaceName}</span>
                <ChevronRight size={12} className="text-muted-foreground/40" />
              </Link>
            </div>
          </>
        )}

        {/* User */}
        <div className="mx-3 border-t border-border" />
        <div className="px-3 py-3">
          <Link
            href={slug ? `${base}/profile` : '/broker/settings'}
            className="group flex items-center gap-2.5 px-2 py-1 rounded-md hover:bg-muted transition-colors"
          >
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={displayName}
                className="w-6 h-6 rounded-full flex-shrink-0 object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium text-xs flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[13px] font-medium text-foreground truncate">
              {displayName}
            </span>
          </Link>
        </div>
      </aside>
    );
  }

  // ── Standard workspace sidebar ──
  return (
    <aside className="hidden md:flex flex-col w-[220px] h-full bg-sidebar border-r border-border shrink-0">
      <div className="px-4 pt-4 pb-3">
        <BrandLogo className="h-4" alt="Chippi" />
      </div>

      {/* Context: Workspace */}
      <div className="px-3 pb-2">
        <Link
          href={`${base}/settings`}
          className="group flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
        >
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Briefcase size={13} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold truncate text-foreground leading-tight">
              {spaceName}
            </p>
          </div>
          <ChevronRight
            size={12}
            className="text-muted-foreground/40 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </Link>
      </div>

      <div className="mx-3 border-t border-border" />

      {/* Primary nav */}
      <nav className="flex-1 px-3 pt-3 pb-2 space-y-0.5 overflow-y-auto">
        {primaryNavItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive =
            item.href === '' ? pathname === base : pathname.startsWith(`${base}${item.href}`);

          let badge: React.ReactNode = undefined;
          if (item.href === '/leads' && unreadLeadCount > 0) {
            badge = (
              <span
                className={cn(
                  'inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums flex-shrink-0',
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'bg-primary text-primary-foreground'
                )}
              >
                {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
              </span>
            );
          }

          return (
            <NavItem
              key={item.href}
              href={href}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
              badge={badge}
            />
          );
        })}

        {/* Switch to brokerage dashboard */}
        {isBroker && (
          <>
            <div className="mx-0 my-2 border-t border-border" />
            <Link
              href="/broker"
              className="group flex items-center gap-2.5 h-8 px-2 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Building2
                size={15}
                className="flex-shrink-0 text-muted-foreground/70 group-hover:text-foreground"
              />
              <span className="flex-1 truncate">{brokerageName}</span>
              <ChevronRight size={12} className="text-muted-foreground/40" />
            </Link>
          </>
        )}
      </nav>

      {/* Join a team (realtors without a brokerage) */}
      {!brokerageName && (
        <div className="px-3 pb-1">
          <NavItem
            href="/brokerage"
            label="Join a team"
            icon={Building2}
            isActive={false}
          />
        </div>
      )}

      {/* Secondary nav */}
      <div className="mx-3 border-t border-border" />
      <div className="px-3 py-2 space-y-0.5">
        {secondaryNavItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive = pathname.startsWith(href);
          return (
            <NavItem
              key={item.href}
              href={href}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
            />
          );
        })}
      </div>

      {/* User */}
      <div className="mx-3 border-t border-border" />
      <div className="px-3 py-3">
        <Link
          href={`${base}/profile`}
          className="group flex items-center gap-2.5 px-2 py-1 rounded-md hover:bg-muted transition-colors"
        >
          {user?.imageUrl ? (
            <img
              src={user.imageUrl}
              alt={displayName}
              className="w-6 h-6 rounded-full flex-shrink-0 object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium text-xs flex-shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-[13px] font-medium text-foreground truncate">
            {displayName}
          </span>
        </Link>
      </div>
    </aside>
  );
}
