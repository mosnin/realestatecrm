'use client';

import { UserButton, useUser } from '@clerk/nextjs';
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { useTheme } from '@/components/theme-provider';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import { secondaryNavItems, realtorNavItems } from '@/lib/nav-items';
import type { NavItem } from '@/lib/nav-items';
import {
  isNavChildActive,
  isNavItemActive,
  navItemOwnsMatch,
  resolveNavActive,
} from '@/lib/nav-active';
import { SECTION_LABEL } from '@/lib/typography';
import { SidebarConversations } from '@/components/dashboard/sidebar-conversations';
import { SidebarNavItem } from '@/components/dashboard/sidebar-nav-item';
import {
  SearchPill,
  WorkspaceSwitcher,
  BrokerSidebarConversations,
  brokerAdminNavSections,
  brokerMemberNavSections,
} from '@/components/dashboard/sidebar';
import {
  CHIPPI_SIDEBAR_REVEAL_EVENT,
  chippiSidebarPanelMotion,
  useChippiSidebarView,
} from '@/components/dashboard/chippi-sidebar-experience';
import { triggerAccountSwitch } from '@/components/dashboard/account-switch';
import { SidebarWhatsNew } from '@/components/dashboard/sidebar-whats-new';
import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { Building2, ArrowLeftRight, Briefcase, ChevronDown, ArrowLeft, Bell, CreditCard, Settings, Check, Calendar, BarChart2, ClipboardList, Wallet, FolderOpen, Shield } from 'lucide-react';
import { NotificationCenter } from './notification-center';
import { NotificationBell } from '@/components/broker/notification-bell';
import { ShareLinksMenu } from './share-links-menu';
import { getBreadcrumbLabel } from '@/lib/breadcrumb-routes';

// Broker mobile nav is sourced from the SINGLE source of truth shared with the
// desktop sidebar — `brokerAdminNavSections` / `brokerMemberNavSections` from
// components/dashboard/sidebar.tsx — and rendered through the same
// `SidebarNavItem` accordion. No separate flat copy here (that drifted: it lost
// the Chippi chip + Brief/Inbox/History dropdown and used different icons).

interface HeaderProps {
  slug: string;
  /** Owning Space.id — threaded through to NotificationCenter so its
   *  Realtime subscriptions can filter by spaceId. Without this, a
   *  permissive RLS regression would deliver cross-tenant rows. */
  spaceId?: string;
  spaceName: string;
  title: string;
  /** Chippi profile name (DB User.name) — preferred over the Clerk/Gmail name. */
  accountName?: string | null;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
  isPlatformAdmin?: boolean;
}

export function Header({ slug, spaceId, spaceName, title, accountName = null, isBroker = false, isBrokerOnly = false, brokerageName = null, brokerageRole = null, isPlatformAdmin = false }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();
  const isOnBrokerPage = pathname.startsWith('/broker');
  const showBrokerMobileNavOnly = isBroker && isOnBrokerPage;
  const mobileChatRoot = showBrokerMobileNavOnly ? '/broker/chippi' : `${base}/chippi`;
  const isOnChatRoot = pathname === mobileChatRoot;
  const [chippiSidebarView, setChippiSidebarView] = useChippiSidebarView(
    pathname,
    mobileChatRoot,
  );
  const reducedMotion = useReducedMotion() ?? false;
  const { user } = useUser();
  // Admin console link — DB platformRole (server prop) OR Clerk metadata, so
  // an admin set either way sees it. Matches the desktop sidebar.
  const showAdminLink =
    isPlatformAdmin ||
    (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin';
  // Prefer the Chippi profile name (chosen at onboarding) over the Clerk/Gmail
  // identity; fall back to Clerk, then a neutral label.
  const clerkName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : '';
  const drawerDisplayName = (accountName ?? '').trim() || clerkName || 'My Account';
  const drawerEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  useEffect(() => {
    if (!isOnChatRoot) return;
    const revealHistory = () => {
      if (window.matchMedia('(max-width: 767px)').matches) setOpen(true);
    };
    window.addEventListener(CHIPPI_SIDEBAR_REVEAL_EVENT, revealHistory);
    return () => window.removeEventListener(CHIPPI_SIDEBAR_REVEAL_EVENT, revealHistory);
  }, [isOnChatRoot]);

  // Active nav row for the drawer — resolved through the SAME helper the
  // desktop sidebar uses, so one route selects exactly one row on both
  // viewports. The drawer has no search-param context (reading it here would
  // force a Suspense boundary on every dashboard route), so query-scoped
  // children like "New workflow" (/automations?new=1) simply don't claim the
  // selection on mobile; their parent row does.
  const navMatch = resolveNavActive(realtorNavItems, pathname, base);

  // Accordion expansion state for the mobile drawer — same contract as the
  // desktop sidebar: at most one parent open at a time, auto-expand the
  // parent that owns the current route. Closing the drawer doesn't reset
  // this; reopening reflects whatever route the realtor is on now.
  const activeParentKey =
    realtorNavItems.find((item) => item.children?.length && navItemOwnsMatch(item, navMatch))
      ?.href ?? null;
  const [expandedKey, setExpandedKey] = useState<string | null>(activeParentKey);

  useEffect(() => {
    if (activeParentKey) setExpandedKey(activeParentKey);
  }, [activeParentKey]);

  const handleToggle = (key: string) => () =>
    setExpandedKey((prev) => (prev === key ? null : key));
  const closeDrawer = () => setOpen(false);

  // Broker drawer accordion — same contract as the realtor one above, driven by
  // the shared broker nav sections (base="" since broker hrefs are absolute).
  const brokerSections =
    brokerageRole === 'realtor_member' ? brokerMemberNavSections : brokerAdminNavSections;
  const canManageBrokerage =
    brokerageRole === 'broker_owner' || brokerageRole === 'broker_admin';
  const isVisibleBrokerItem = (item: NavItem & { adminOnly?: boolean }) =>
    !item.adminOnly || canManageBrokerage;
  const brokerVisibleItems = brokerSections
    .flatMap((section) => section.items)
    .filter(isVisibleBrokerItem);
  const brokerMatch = resolveNavActive(brokerVisibleItems, pathname, '');
  const brokerActiveParentKey =
    brokerVisibleItems.find(
      (item) => item.children?.length && navItemOwnsMatch(item, brokerMatch),
    )?.href ?? null;
  const [brokerExpandedKey, setBrokerExpandedKey] = useState<string | null>(
    brokerActiveParentKey,
  );
  useEffect(() => {
    if (brokerActiveParentKey) setBrokerExpandedKey(brokerActiveParentKey);
  }, [brokerActiveParentKey]);
  const handleBrokerToggle = (key: string) => () =>
    setBrokerExpandedKey((prev) => (prev === key ? null : key));

  return (
    <header
      data-dashboard-header
      className="h-14 flex items-center justify-between border-b border-border/70 bg-background/90 px-4 shadow-[0_1px_0_rgb(17_17_19/0.015)] backdrop-blur-xl md:px-6 sticky top-0 z-40"
    >
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
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-foreground/[0.03] to-transparent z-0" />
            <div className="relative z-10 flex flex-col h-full overflow-y-auto">
            <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                <BrandLogo className="h-5" alt="Chippi" />
              </SheetTitle>
              <SheetDescription className="sr-only">
                Navigate your Chippi workspace and account.
              </SheetDescription>
              {/* Workspace switcher — uses the shared desktop component so the
                  rich popover (email header, ⌘-shortcuts, "+ New" footer) is
                  identical across viewports. Inside a Sheet the Radix Popover
                  portals to document.body so it isn't clipped by the drawer. */}
              <div className="mt-2 -mx-3">
                <WorkspaceSwitcher
                  currentName={pathname.startsWith('/broker') ? (brokerageName ?? 'Team') : spaceName}
                  currentSubtitle={pathname.startsWith('/broker') ? 'Team' : 'My workspace'}
                  currentIcon={pathname.startsWith('/broker') ? Building2 : Briefcase}
                  slug={slug}
                  spaceName={spaceName}
                  brokerageMemberships={
                    isBroker && brokerageName
                      ? [{ id: 'current', name: brokerageName, role: brokerageRole ?? 'member' }]
                      : []
                  }
                  isOnBrokerPage={pathname.startsWith('/broker')}
                  userEmail={drawerEmail}
                  inDrawer
                />
              </div>
            </SheetHeader>
            <div className="px-3 pt-3">
              <SearchPill />
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-2">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.div
                  key={isOnChatRoot ? chippiSidebarView : 'menu'}
                  {...chippiSidebarPanelMotion(
                    isOnChatRoot ? chippiSidebarView : 'menu',
                    reducedMotion,
                  )}
                  className="space-y-3"
                >
              {isOnChatRoot && chippiSidebarView === 'history' ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setChippiSidebarView('menu')}
                    className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
                  >
                    <ArrowLeft size={14} strokeWidth={1.75} />
                    Back to menu
                  </button>
                  {showBrokerMobileNavOnly ? (
                    <BrokerSidebarConversations
                      limit={50}
                      hideLabel
                      onSelect={closeDrawer}
                    />
                  ) : (
                    <SidebarConversations
                      slug={slug}
                      limit={50}
                      hideLabel
                      onSelect={closeDrawer}
                    />
                  )}
                </div>
              ) : (
                <>
                  {isOnChatRoot && (
                    <button
                      type="button"
                      onClick={() => setChippiSidebarView('history')}
                      className="inline-flex h-9 items-center rounded-md px-2 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      Conversation history
                    </button>
                  )}
              {!isBrokerOnly && !showBrokerMobileNavOnly && (
                <>
                  {/* The product menu is the alternate view of this same
                      Sheet. "Back to menu" reaches it from chat history, so
                      every destination remains one quiet transition away.

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
                      const isExpanded = hasChildren && expandedKey === item.href;
                      return (
                        <SidebarNavItem
                          key={item.href}
                          item={item}
                          base={base}
                          isActive={isNavItemActive(item, navMatch, {
                            childrenVisible: isExpanded,
                          })}
                          isExpanded={isExpanded}
                          isChildActive={(child) => isNavChildActive(item, child, navMatch)}
                          onToggle={handleToggle(item.href)}
                          onNavigate={closeDrawer}
                        />
                      );
                    })}
                  </div>

                </>
              )}
              {/* Broker drawer — renders the SAME broker nav sections as the
                  desktop sidebar through the SAME SidebarNavItem accordion, so
                  the Chippi chip, Brief/Inbox/History dropdown, icons, and
                  adminOnly gating are identical across viewports. Only shown on
                  broker pages; brokerage links never bleed into the agent
                  drawer (you switch workspaces with the switcher up top). */}
              {isBroker && showBrokerMobileNavOnly && (
                <div className="space-y-3">
                  {brokerSections.map((section) => {
                    const visibleItems = section.items.filter(isVisibleBrokerItem);
                    if (visibleItems.length === 0) return null;
                    return (
                      <div key={section.label || 'primary'} className="space-y-0.5">
                        {section.label ? (
                          <p className={`${SECTION_LABEL} px-3 pb-1.5`}>{section.label}</p>
                        ) : null}
                        {visibleItems.map((item) => {
                          const hasChildren = !!item.children?.length;
                          const isExpanded = hasChildren && brokerExpandedKey === item.href;
                          return (
                            <SidebarNavItem
                              key={item.href}
                              item={item}
                              base=""
                              isActive={isNavItemActive(item, brokerMatch, {
                                childrenVisible: isExpanded,
                              })}
                              isExpanded={isExpanded}
                              isChildActive={(child) => isNavChildActive(item, child, brokerMatch)}
                              onToggle={handleBrokerToggle(item.href)}
                              onNavigate={closeDrawer}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
                </>
              )}
                </motion.div>
              </AnimatePresence>
            </nav>
            {/* What's new + user-menu chip — same components the desktop
                sidebar uses so localStorage state is shared (dismissals,
                favorites, etc.). Only renders for the realtor workspace —
                the broker drawer keeps its existing team/account footer. */}
            {!isBrokerOnly && !showBrokerMobileNavOnly && slug && (
              <>
                <SidebarWhatsNew />
                {showAdminLink && (
                  <>
                    <div className="border-t border-sidebar-border" />
                    <Link
                      href="/admin"
                      onClick={closeDrawer}
                      className="group flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground transition-colors"
                    >
                      <Shield size={16} strokeWidth={1.75} className="flex-shrink-0 opacity-70 group-hover:opacity-100" />
                      Admin
                    </Link>
                  </>
                )}
                <div className="border-t border-sidebar-border" />
                <SidebarUserMenu
                  slug={slug}
                  displayName={drawerDisplayName}
                  email={drawerEmail}
                  imageUrl={user?.imageUrl ?? null}
                  inDrawer
                />
              </>
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
              ) : secondaryNavItems.length > 0 ? (
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
              ) : null)}
              <div className="flex items-center gap-2 px-3 pt-3">
                <BrandLogo className="h-4" alt="Chippi" />
              </div>
            </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Mobile: the Chippi mark in the top bar. On desktop the sidebar logo
            and the breadcrumb carry identity; on mobile the sidebar is hidden
            (bottom MobileNav takes over) and the top bar otherwise shows only
            the menu button — so the brand mark would be absent until the drawer
            is opened. Links to the dashboard home. */}
        <Link
          href={isOnBrokerPage ? '/broker' : base}
          className="md:hidden inline-flex items-center"
          aria-label="Chippi home"
        >
          <BrandLogo className="h-5" alt="Chippi" />
        </Link>

        {/* Chippi mark on the brokerage dashboard header — gives the broker
            surface the same brand anchor the realtor side carries. */}
        {isOnBrokerPage && (
          <Link href="/broker" className="hidden md:inline-flex items-center mr-1" aria-label="Chippi">
            <BrandLogo className="h-5" alt="Chippi" />
          </Link>
        )}

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
                  onClick={() => triggerAccountSwitch()}
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
      <div className="flex items-center gap-1.5">
        {slug && !isOnBrokerPage && <ShareLinksMenu slug={slug} />}
        {slug && <NotificationCenter slug={slug} spaceId={spaceId} />}
        {isBrokerOnly && !slug && <NotificationBell />}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          title="Toggle theme"
          className="h-8 w-8 flex items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
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
