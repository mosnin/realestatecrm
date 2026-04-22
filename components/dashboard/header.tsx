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
import { Building2, LayoutDashboard, UserCircle, Users, Mail, ArrowLeftRight, Briefcase, ChevronRight, ChevronDown, ArrowLeft, User, Bell, Plug, Palette, FileText, ListChecks, CreditCard, Shield, Settings, Check } from 'lucide-react';
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

const brokerMobileNavSections = [
  {
    title: 'Overview',
    items: [
      { href: '/broker', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/broker/leads', label: 'Leads', icon: Briefcase, exact: false },
      { href: '/broker/pipeline', label: 'Pipeline', icon: ListChecks, exact: false },
    ],
  },
  {
    title: 'Team',
    items: [
      { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Users, exact: false },
      { href: '/broker/members', label: 'Members', icon: Users, exact: false },
      { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
    ],
  },
  {
    title: 'Tools',
    items: [
      { href: '/broker/analytics', label: 'Analytics', icon: Briefcase, exact: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false },
      { href: '/broker/chat', label: 'Team Chat', icon: Bell, exact: false },
      { href: '/broker/announcements', label: 'Announcements', icon: Plug, exact: false },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/broker/import-export', label: 'Import / Export', icon: ArrowLeftRight, exact: false },
      { href: '/broker/settings', label: 'Settings', icon: Settings, exact: false },
    ],
  },
];

interface HeaderProps {
  slug: string;
  spaceName: string;
  title: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
}

export function Header({ slug, spaceName, title, isBroker = false, isBrokerOnly = false, brokerageName = null, brokerageRole = null }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [mobileSwitcherOpen, setMobileSwitcherOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();
  const isOnBrokerPage = pathname.startsWith('/broker');
  const showBrokerMobileNavOnly = isBroker && isOnBrokerPage;

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-40 shadow-[0_1px_0_0_var(--border)]">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden">
            <MenuToggleIcon open={open} className="size-5 text-muted-foreground" duration={400} />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border flex flex-col overflow-hidden">
            <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                <BrandLogo className="h-5" alt="Chippi" />
              </SheetTitle>
              {/* Workspace switcher dropdown */}
              <div className="mt-2">
                {isBroker && !isBrokerOnly ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMobileSwitcherOpen(!mobileSwitcherOpen)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-border bg-card hover:bg-accent transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                        {pathname.startsWith('/broker') ? <Building2 size={16} className="text-foreground" /> : <Briefcase size={16} className="text-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{pathname.startsWith('/broker') ? (brokerageName ?? 'Brokerage') : spaceName}</p>
                        <p className="text-[10px] text-muted-foreground">{pathname.startsWith('/broker') ? 'Brokerage view' : 'My workspace'}</p>
                      </div>
                      <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', mobileSwitcherOpen && 'rotate-180')} />
                    </button>
                    {mobileSwitcherOpen && (
                      <div className="absolute left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg z-50 overflow-hidden">
                        <Link
                          href={base}
                          onClick={() => { setMobileSwitcherOpen(false); setOpen(false); }}
                          className={cn(
                            'flex items-center gap-2.5 px-3 py-2.5 transition-colors',
                            !pathname.startsWith('/broker') ? 'bg-accent' : 'hover:bg-accent'
                          )}
                        >
                          <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                            <Briefcase size={16} className="text-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{spaceName}</p>
                            <p className="text-[10px] text-muted-foreground">My workspace</p>
                          </div>
                          {!pathname.startsWith('/broker') && <Check size={14} className="text-foreground flex-shrink-0" />}
                        </Link>
                        <div className="border-t border-border">
                          <p className="px-3 pt-2 pb-1 text-[10px] font-medium text-muted-foreground">Brokerages</p>
                          <Link
                            href="/broker"
                            onClick={() => { setMobileSwitcherOpen(false); setOpen(false); }}
                            className={cn(
                              'flex items-center gap-2.5 px-3 py-2.5 transition-colors',
                              pathname.startsWith('/broker') ? 'bg-accent' : 'hover:bg-accent'
                            )}
                          >
                            <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                              <Building2 size={16} className="text-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{brokerageName ?? 'Brokerage'}</p>
                              <p className="text-[10px] text-muted-foreground">{brokerageRole === 'broker_owner' ? 'Owner' : brokerageRole === 'broker_admin' ? 'Admin' : 'Member'}</p>
                            </div>
                            {pathname.startsWith('/broker') && <Check size={14} className="text-foreground flex-shrink-0" />}
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-card">
                    <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                      <Briefcase size={16} className="text-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{spaceName}</p>
                      <p className="text-[10px] text-muted-foreground">My workspace</p>
                    </div>
                  </div>
                )}
              </div>
            </SheetHeader>
            <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-2 space-y-0.5">
              {!isBrokerOnly && !showBrokerMobileNavOnly && (
                <>
                  <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground">
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
                          'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
              {isBroker && showBrokerMobileNavOnly && (
                <>
                  {brokerMobileNavSections.map((section) => (
                    <div key={section.title} className="pb-2">
                      <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground">
                        {section.title}
                      </p>
                      {section.items.map((item) => {
                        const isActive = item.exact
                          ? pathname === item.href
                          : pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                              isActive
                                ? 'bg-accent text-foreground font-medium'
                                : 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
                            )}
                          >
                            <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </nav>
            {isBroker && !showBrokerMobileNavOnly && (
              <div className="px-3 pb-2 space-y-0.5 border-t border-sidebar-border pt-3">
                <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground">
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
                        'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                        isActive
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
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
              {!showBrokerMobileNavOnly && ((pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/billing`)) ? (
                <>
                  <Link
                    href={base}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    <ArrowLeft size={14} /> Back to dashboard
                  </Link>
                  {[
                    { label: 'Settings', items: [
                      { href: `${base}/settings`, label: 'General', icon: Settings },
                      { href: `${base}/settings/profile`, label: 'Profile', icon: User },
                      { href: `${base}/settings/notifications`, label: 'Notifications', icon: Bell },
                      { href: `${base}/settings/integrations`, label: 'Integrations', icon: Plug },
                      { href: `${base}/settings/legal`, label: 'Legal', icon: Shield },
                    ]},
                    { label: 'Intake Form', items: [
                      { href: `${base}/settings/appearance`, label: 'Appearance', icon: Palette },
                      { href: `${base}/settings/content`, label: 'Content', icon: FileText },
                      { href: `${base}/settings/form-fields`, label: 'Form Fields', icon: ListChecks },
                    ]},
                    { label: 'Account', items: [
                      { href: `${base}/billing`, label: 'Billing', icon: CreditCard },
                    ]},
                  ].map((section) => (
                    <div key={section.label}>
                      <p className="px-3 pb-1 pt-2 text-[10px] font-medium text-muted-foreground">{section.label}</p>
                      {section.items.map((item) => {
                        const isActive = item.href === `${base}/settings` ? pathname === item.href : pathname.startsWith(item.href);
                        return (
                          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                            className={cn('group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                              isActive ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
                            )}>
                            <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <p className="px-3 pb-1.5 text-[10px] font-medium text-muted-foreground">
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
                          'group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-muted-foreground font-normal hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              ))}
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
              {/* Quick switch to workspace */}
              {!isBrokerOnly && slug && (
                <Link
                  href={base}
                  className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                  title={`Switch to ${spaceName}`}
                >
                  <ArrowLeftRight size={11} />
                  {spaceName}
                </Link>
              )}
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
              {/* Quick switch to brokerage */}
              {isBroker && brokerageName && (
                <Link
                  href="/broker"
                  className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border hover:bg-accent transition-colors"
                  title={`Switch to ${brokerageName}`}
                >
                  <ArrowLeftRight size={11} />
                  {brokerageName}
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {slug && <GlobalSearch slug={slug} />}
        {slug && <NotificationCenter slug={slug} />}
        {isBroker && <BrokerHelpGuide />}
        {isBrokerOnly && !slug && <NotificationBell />}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
        <div className="[&_.cl-userButtonTrigger]:rounded-full">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
