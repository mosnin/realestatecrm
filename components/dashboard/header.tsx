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
import { secondaryNavItems } from '@/lib/nav-items';
import { Building2, LayoutDashboard, UserCircle, Users, Mail, ArrowLeftRight, Briefcase, ChevronRight, ChevronDown, ArrowLeft, User, Bell, Plug, Palette, FileText, ListChecks, CreditCard, Shield, Settings, Check, Inbox, Sparkles, Home, CalendarDays, Calendar, Flag, BarChart2, ClipboardList } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { NotificationCenter } from './notification-center';
import { NotificationBell } from '@/components/broker/notification-bell';
import { BrokerHelpGuide } from '@/components/broker/help-guide';
import { getBreadcrumbLabel } from '@/lib/breadcrumb-routes';

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
  const [intakeExpanded, setIntakeExpanded] = useState(false);
  const [analyticsExpanded, setAnalyticsExpanded] = useState(false);
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
          <SheetContent side="left" className="w-64 p-0 border-sidebar-border flex flex-col overflow-hidden relative bg-sidebar">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-pink-100/50 via-purple-50/20 to-transparent dark:from-purple-900/10 dark:via-transparent z-0" />
            <div className="relative z-10 flex flex-col h-full overflow-y-auto">
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
                  {/* AI section */}
                  <p className="px-3 pb-2 pt-1 text-[11px] font-medium text-muted-foreground select-none">AI</p>
                  {[
                    { href: `${base}/agent`, label: 'Inbox', icon: Inbox, exact: false },
                    { href: `${base}/ai`, label: 'Assistant', icon: Sparkles, exact: false },
                  ].map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <item.icon size={20} className="flex-shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}

                  {/* Workspace section */}
                  <p className="px-3 pb-2 pt-5 text-[11px] font-medium text-muted-foreground select-none">Workspace</p>
                  {[
                    { href: '', label: 'Today', icon: Home, exact: true },
                    { href: '/contacts', label: 'People', icon: Users, exact: false },
                    { href: '/deals', label: 'Deals', icon: Briefcase, exact: false },
                    { href: '/tours', label: 'Tours', icon: CalendarDays, exact: false },
                    { href: '/calendar', label: 'Calendar', icon: Calendar, exact: false },
                    { href: '/notes', label: 'Notes', icon: FileText, exact: false },
                    { href: '/reviews', label: 'My reviews', icon: Flag, exact: false },
                  ].map((item) => {
                    const href = `${base}${item.href}`;
                    const isActive = item.exact ? pathname === base : pathname.startsWith(href);
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground'
                        )}
                      >
                        <item.icon size={20} className="flex-shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}

                  {/* Intake form — expandable */}
                  <button
                    onClick={() => setIntakeExpanded((p) => !p)}
                    className={cn(
                      'group w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-colors',
                      pathname.startsWith(`${base}/intake`) || pathname.startsWith(`${base}/settings/appearance`) || pathname.startsWith(`${base}/settings/content`)
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <ClipboardList size={20} className="flex-shrink-0" />
                    <span className="flex-1 text-left">Intake form</span>
                    <ChevronRight size={14} className={cn('text-muted-foreground/50 transition-transform duration-200', intakeExpanded && 'rotate-90')} />
                  </button>
                  {intakeExpanded && (
                    <div className="ml-[18px] pl-3.5 py-1 space-y-0.5 border-l border-border/40">
                      {[
                        { href: '/intake', label: 'Overview', exact: true },
                        { href: '/intake/customize', label: 'Customize' },
                        { href: '/settings/appearance', label: 'Appearance' },
                        { href: '/settings/content', label: 'Content' },
                        { href: '/intake/tracking', label: 'Tracking' },
                        { href: '/intake/analytics', label: 'Form analytics' },
                        { href: '/intake/share', label: 'Share' },
                      ].map((child) => {
                        const href = `${base}${child.href}`;
                        const isActive = child.exact ? pathname === href : pathname.startsWith(href);
                        return (
                          <Link
                            key={child.href}
                            href={href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'flex items-center min-h-[36px] h-9 px-2.5 rounded-md text-[13px] transition-colors',
                              isActive
                                ? 'text-foreground font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            )}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Analytics — expandable */}
                  <button
                    onClick={() => setAnalyticsExpanded((p) => !p)}
                    className={cn(
                      'group w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] transition-colors',
                      pathname.startsWith(`${base}/analytics`)
                        ? 'bg-accent text-foreground font-medium'
                        : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <BarChart2 size={20} className="flex-shrink-0" />
                    <span className="flex-1 text-left">Analytics</span>
                    <ChevronRight size={14} className={cn('text-muted-foreground/50 transition-transform duration-200', analyticsExpanded && 'rotate-90')} />
                  </button>
                  {analyticsExpanded && (
                    <div className="ml-[18px] pl-3.5 py-1 space-y-0.5 border-l border-border/40">
                      {[
                        { href: '/analytics', label: 'Overview', exact: true },
                        { href: '/analytics/leads', label: 'Leads' },
                        { href: '/analytics/clients', label: 'Clients' },
                        { href: '/analytics/tours', label: 'Tours' },
                        { href: '/analytics/pipeline', label: 'Pipeline' },
                        { href: '/analytics/form-traffic', label: 'Form traffic' },
                      ].map((child) => {
                        const href = `${base}${child.href}`;
                        const isActive = child.exact ? pathname === href : pathname.startsWith(href);
                        return (
                          <Link
                            key={child.href}
                            href={href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'flex items-center min-h-[36px] h-9 px-2.5 rounded-md text-[13px] transition-colors',
                              isActive
                                ? 'text-foreground font-medium'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            )}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Settings section — expanded flat list */}
                  <p className="px-3 pb-2 pt-5 text-[11px] font-medium text-muted-foreground select-none">Settings</p>
                  {[
                    { href: '/settings', label: 'Account', exact: true },
                    { href: '/settings/profile', label: 'Profile' },
                    { href: '/settings/notifications', label: 'Notifications' },
                    { href: '/settings/templates', label: 'Message templates' },
                    { href: '/settings/integrations', label: 'Integrations' },
                    { href: '/billing', label: 'Billing' },
                    { href: '/settings/legal', label: 'Legal' },
                  ].map((item) => {
                    const href = `${base}${item.href}`;
                    const isActive = item.exact ? pathname === href : pathname.startsWith(href);
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] transition-colors',
                          isActive
                            ? 'bg-accent text-foreground font-medium'
                            : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground'
                        )}
                      >
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
                {getBreadcrumbLabel(pathname)}
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
              <span className="text-muted-foreground/40">/</span>
              <span className="font-medium text-foreground">
                {getBreadcrumbLabel(pathname, base)}
              </span>
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
