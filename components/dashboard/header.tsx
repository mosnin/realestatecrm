'use client';

import { UserButton } from '@clerk/nextjs';
import { Sun, Moon } from 'lucide-react';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { BrandLogo } from '@/components/brand-logo';
import { primaryNavItems, secondaryNavItems } from '@/lib/nav-items';
import { Building2, LayoutDashboard, UserCircle, Users, Mail } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { NotificationCenter } from './notification-center';
import { NotificationBell } from '@/components/broker/notification-bell';
import { BrokerHelpGuide } from '@/components/broker/help-guide';

const brokerMobileNavItems = [
  { href: '/broker', label: 'Team Overview', icon: LayoutDashboard, exact: true },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
  { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
];

interface HeaderProps {
  slug: string;
  spaceName: string;
  title: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
}

export function Header({ slug, spaceName, title, isBroker = false, isBrokerOnly = false, brokerageName = null }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-40 shadow-[0_1px_0_0_var(--border)]">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden">
            <MenuToggleIcon open={open} className="size-5 text-muted-foreground" duration={400} />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
            <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                <BrandLogo className="h-5" alt="Chippi" />
                <span className="text-sm font-semibold">{spaceName}</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5">
              {!isBrokerOnly && (
                <>
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Workspace
                  </p>
                  {primaryNavItems.map((item) => {
                    const href = `${base}${item.href}`;
                    const isActive =
                      item.href === ''
                        ? pathname === base
                        : pathname.startsWith(`${base}${item.href}`);
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>
            {isBroker && (
              <div className="px-3 pb-2 space-y-0.5 border-t border-sidebar-border pt-3">
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Team
                </p>
                {brokerMobileNavItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="px-3 pb-4 space-y-0.5 border-t border-sidebar-border pt-3">
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Account
              </p>
              {secondaryNavItems.map((item) => {
                const href = `${base}${item.href}`;
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                    {item.label}
                  </Link>
                );
              })}
              <div className="flex items-center gap-2 px-3 pt-3">
                <BrandLogo className="h-4" alt="Chippi" />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <span className="font-semibold text-sm md:hidden flex items-center gap-2">
          <BrandLogo className="h-5" alt="Chippi" />
        </span>

        {/* Desktop: breadcrumb */}
        <div className="hidden md:flex items-center gap-1.5 text-sm">
          {(pathname.startsWith('/broker') || isBrokerOnly) && brokerageName ? (
            <>
              <span className="text-muted-foreground">{brokerageName}</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-medium text-foreground">
                {pathname === '/broker' ? 'Overview' :
                 pathname.startsWith('/broker/realtors') ? 'Realtors' :
                 pathname.startsWith('/broker/members') ? 'Members' :
                 pathname.startsWith('/broker/invitations') ? 'Invitations' :
                 pathname.startsWith('/broker/settings') ? 'Settings' : 'Team'}
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{title}</span>
              {(() => {
                const allItems = [...primaryNavItems, ...secondaryNavItems];
                const match = allItems
                  .filter((item) => item.href !== '')
                  .find((item) => pathname.startsWith(`${base}${item.href}`));
                return match ? (
                  <>
                    <span className="text-muted-foreground/40">/</span>
                    <span className="font-medium text-foreground">{match.label}</span>
                  </>
                ) : (
                  <><span className="text-muted-foreground/40">/</span><span className="font-medium text-foreground">Overview</span></>
                );
              })()}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {!isBrokerOnly && slug && <GlobalSearch slug={slug} />}
        {!isBrokerOnly && slug && <NotificationCenter slug={slug} />}
        {isBroker && <BrokerHelpGuide />}
        {isBroker && <NotificationBell />}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
        <UserButton />
      </div>
    </header>
  );
}
