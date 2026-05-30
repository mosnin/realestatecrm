'use client';

import { UserButton } from '@clerk/nextjs';
import { Sun, Moon, X } from 'lucide-react';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { useTheme } from '@/components/theme-provider';
import { AnimatePresence, motion } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import { secondaryNavItems, realtorNavItems } from '@/lib/nav-items';
import type { NavChild, NavItem } from '@/lib/nav-items';
import { SECTION_LABEL } from '@/lib/typography';
import { SidebarConversations } from '@/components/dashboard/sidebar-conversations';
import { SidebarNavItem } from '@/components/dashboard/sidebar-nav-item';
import { Building2, LayoutDashboard, UserCircle, Users, Mail, ArrowLeftRight, Briefcase, ChevronDown, ArrowLeft, Bell, Plug, FileText, ListChecks, CreditCard, Settings, Check, MessageCircle, Calendar, BarChart2, ClipboardList, Wallet, FolderOpen } from 'lucide-react';
import { NotificationCenter } from './notification-center';
import { NotificationBell } from '@/components/broker/notification-bell';
import { BrokerHelpGuide } from '@/components/broker/help-guide';
import { ShareLinksMenu } from './share-links-menu';
import { ChippiPowerToggle } from '@/components/chippi/chippi-power-toggle';
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
  /** Owning Space.id — threaded through to NotificationCenter so its
   *  Realtime subscriptions can filter by spaceId. Without this, a
   *  permissive RLS regression would deliver cross-tenant rows. */
  spaceId?: string;
  spaceName: string;
  title: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
}

/** Returns true if the pathname belongs to this item or any of its children.
 *  Mirrors the desktop sidebar's helper so accordion auto-expansion is
 *  computed the same way on both viewports. */
function doesItemOwnPath(item: NavItem, pathname: string, base: string): boolean {
  if (item.children?.length) {
    const childOwns = item.children.some((child) => {
      const childPath = child.href.split('?')[0];
      const fullChildPath = `${base}${childPath}`;
      return child.exact
        ? pathname === fullChildPath
        : pathname.startsWith(fullChildPath);
    });
    if (childOwns) return true;
  }
  return pathname.startsWith(`${base}${item.href}`);
}

/** Lightweight child-active match for the mobile drawer. Realtor children
 *  today don't carry query params, so the desktop's query-string branch
 *  isn't needed here. If that changes, swap this for the shared helper. */
function isMobileChildActive(child: NavChild, pathname: string, base: string): boolean {
  const fullHref = `${base}${child.href.split('?')[0]}`;
  if (child.exact) return pathname === fullHref;
  return pathname === fullHref || pathname.startsWith(`${fullHref}/`);
}

export function Header({ slug, spaceId, spaceName, title, isBroker = false, isBrokerOnly = false, brokerageName = null, brokerageRole = null }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const [mobileSwitcherOpen, setMobileSwitcherOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();
  const isOnBrokerPage = pathname.startsWith('/broker');
  const showBrokerMobileNavOnly = isBroker && isOnBrokerPage;
  const isOnChippi = pathname.startsWith(`${base}/chippi`);

  // Accordion expansion state for the mobile drawer — same contract as the
  // desktop sidebar: at most one parent open at a time, auto-expand the
  // parent that owns the current route. Closing the drawer doesn't reset
  // this; reopening reflects whatever route the realtor is on now.
  const findActiveParentKey = (): string | null => {
    for (const item of realtorNavItems) {
      if (item.children?.length && doesItemOwnPath(item, pathname, base)) {
        return item.href;
      }
    }
    return null;
  };
  const [expandedKey, setExpandedKey] = useState<string | null>(findActiveParentKey);

  useEffect(() => {
    const next = findActiveParentKey();
    if (next) setExpandedKey(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, base]);

  const handleToggle = (key: string) => () =>
    setExpandedKey((prev) => (prev === key ? null : key));
  const closeDrawer = () => setOpen(false);

  return (
    <header data-dashboard-header className="h-14 border-b border-border/70 flex items-center justify-between px-4 md:px-6 bg-background sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger — explicit 44×44 tap target with proper hover
            state, not a bare SVG. Radix's Trigger wraps whatever child you
            give it; without dimensions the click area is just the icon. */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 -ml-2 rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 active:scale-[0.98]"
            >
              <MenuToggleIcon open={open} className="size-5" duration={400} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-screen max-w-none sm:max-w-none p-0 border-0 bg-sidebar text-sidebar-foreground flex flex-col overflow-hidden"
          >
            {/* 44x44 close affordance, top-right, plain X — Radix wires the
                close behaviour. Solid background (no translucent overlay)
                because the drawer is full-screen — the realtor is in nav
                mode, not peeking through. */}
            <SheetClose asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="absolute top-2 right-2 z-20 inline-flex items-center justify-center w-11 h-11 rounded-md text-muted-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 active:scale-[0.98]"
              >
                <X className="size-5" strokeWidth={1.75} />
              </button>
            </SheetClose>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent z-0" />
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
                  {/* Primary nav ALWAYS renders. The realtor must be able to
                      reach any destination from any route — the previous
                      drawer hid the nav entirely on /chippi, which left them
                      stranded with only chat history.

                      Uses the SAME SidebarNavItem the desktop sidebar
                      renders, so accordion behaviour, chevron affordance,
                      and motion params are identical across viewports.
                      Default state: every parent COLLAPSED. The parent of
                      the active route auto-expands; tapping a different
                      parent's chevron closes the previous one (one open at
                      a time). Tapping a link closes the drawer. */}
                  <div className="space-y-0.5">
                    {realtorNavItems.map((item) => {
                      const hasChildren = !!item.children?.length;
                      return (
                        <SidebarNavItem
                          key={item.href}
                          item={item}
                          base={base}
                          isActive={doesItemOwnPath(item, pathname, base)}
                          isExpanded={hasChildren && expandedKey === item.href}
                          isChildActive={(child) => isMobileChildActive(child, pathname, base)}
                          onToggle={handleToggle(item.href)}
                          onNavigate={closeDrawer}
                        />
                      );
                    })}
                  </div>

                  {/* Chat history — animates in/out below the primary nav
                      when the route enters/leaves /chippi. Same motion
                      params as the desktop sidebar's chippi section so the
                      app feels coherent across viewports. */}
                  <AnimatePresence initial={false} mode="wait">
                    {isOnChippi && (
                      <motion.div
                        key="mobile-chippi-history"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                        className="pt-2"
                      >
                        <div className="mx-3 mb-2 h-px bg-border/60" aria-hidden />
                        <SidebarConversations
                          slug={slug}
                          limit={6}
                          onSelect={() => setOpen(false)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
              {isBroker && showBrokerMobileNavOnly && (
                <>
                  {brokerMobileNavSections.map((section) => (
                    <div key={section.title} className="pb-2">
                      <p className={`${SECTION_LABEL} px-3 pb-1.5`}>
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
                <p className={`${SECTION_LABEL} px-3 pb-1.5`}>
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
                      { href: `${base}/settings`, label: 'Settings', icon: Settings },
                    ]},
                    { label: 'Account', items: [
                      { href: `${base}/billing`, label: 'Billing', icon: CreditCard },
                    ]},
                  ].map((section) => (
                    <div key={section.label}>
                      <p className={`${SECTION_LABEL} px-3 pb-1 pt-2`}>{section.label}</p>
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
                  <p className={`${SECTION_LABEL} px-3 pb-1.5`}>
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

        {/* Desktop breadcrumb — small, monospaced separator, no chunky pills.
            The current section reads as the focal label; the workspace name
            is quiet context. Quick-switch is a borderless link, not a chip. */}
        <div className="hidden md:flex items-center gap-2 text-[13px]">
          {(pathname.startsWith('/broker') || isBrokerOnly) && brokerageName ? (
            <>
              <span className="text-muted-foreground/70 truncate max-w-[160px]">{brokerageName}</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="font-medium text-foreground">
                {getBreadcrumbLabel(pathname)}
              </span>
              {!isBrokerOnly && slug && (
                <Link
                  href={base}
                  className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
                  title={`Switch to ${spaceName}`}
                >
                  <ArrowLeftRight size={10} />
                  {spaceName}
                </Link>
              )}
            </>
          ) : (
            <>
              <span className="text-muted-foreground/70 truncate max-w-[160px]">{title}</span>
              <span className="text-muted-foreground/30">/</span>
              <span className="font-medium text-foreground">
                {getBreadcrumbLabel(pathname, base)}
              </span>
              {isBroker && brokerageName && (
                <Link
                  href="/broker"
                  className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors"
                  title={`Switch to ${brokerageName}`}
                >
                  <ArrowLeftRight size={10} />
                  {brokerageName}
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right cluster — quiet icon row in the new sidebar language. Search
          lives on the sidebar's pill (and ⌘K) so the header doesn't carry a
          duplicate trigger. */}
      <div className="flex items-center gap-0.5">
        {slug && !isOnBrokerPage && <ChippiPowerToggle />}
        {slug && !isOnBrokerPage && <ShareLinksMenu slug={slug} />}
        {slug && <NotificationCenter slug={slug} spaceId={spaceId} />}
        {isBroker && <BrokerHelpGuide />}
        {isBrokerOnly && !slug && <NotificationBell />}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors"
        >
          {theme === 'dark' ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
        </button>
        <div className="[&_.cl-userButtonTrigger]:rounded-full">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
