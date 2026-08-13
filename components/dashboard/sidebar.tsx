'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { triggerAccountSwitch } from '@/components/dashboard/account-switch';
import { BrandLogo } from '@/components/brand-logo';
import { realtorNavItems, realtorMoreNavItems } from '@/lib/nav-items';
import type { NavItem, NavChild } from '@/lib/nav-items';
import { SECTION_LABEL } from '@/lib/typography';
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED } from '@/lib/geometry';
import {
  CollapsedTooltip,
  useSidebarCollapsed,
} from '@/components/dashboard/sidebar-collapse';
import { SidebarNavItem } from '@/components/dashboard/sidebar-nav-item';
import { SidebarConversations } from '@/components/dashboard/sidebar-conversations';
import {
  chippiSidebarPanelMotion,
  useChippiSidebarView,
} from '@/components/dashboard/chippi-sidebar-experience';
import { SidebarWhatsNew } from '@/components/dashboard/sidebar-whats-new';
import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { PulseNumber } from '@/components/ui/pulse-number';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  UserCircle,
  LayoutDashboard,
  SlidersHorizontal,
  Briefcase,
  ChevronsUpDown,
  PhoneIncoming,
  BarChart3,
  Trophy,
  FileText,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Radar,
  Activity,
  Upload,
  ArrowLeft,
  Plus,
  Check,
  Search,
  Flag,
  History,
  SquarePen,
  Shield,
  Contact,
  Handshake,
  Plug,
  Gauge,
  TrendingUp,
  Coins,
  CalendarClock,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  slug: string;
  spaceName: string;
  /** The realtor's name from their Chippi profile (DB User.name), set during
   *  onboarding. Preferred over the Clerk identity for display so it doesn't
   *  fall back to the Google/Gmail name on the account. */
  accountName?: string | null;
  unreadLeadCount: number;
  pendingDraftCount?: number;
  overdueFollowUpCount?: number;
  activePropertyCount?: number;
  activeWorkflowCount?: number;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
  brokerageMemberships?: { id: string; name: string; role: string }[];
  isPlatformAdmin?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Broker nav definitions (unchanged structure)
// ═══════════════════════════════════════════════════════════════════════════════

// Phase 7 — broker admin sidebar collapses from 14 entries across 5 labeled
// sections to 5 primary items + a quiet "More" section for the rest.
//
// Primary (daily): Team · Leads · Pipeline · Members · Settings.
// More (one glance below — the routes that have existing users but don't
// earn daily prominence): Realtors, Templates, Team Chat, Announcements,
// Leaderboard, Analytics, Import/Export. Invitations folds into Members.
// Settings sub-pages live behind the shared Settings accordion. Keeping them
// in this tree lets the expanded sidebar, compact rail, and mobile drawer all
// expose the same role-filtered destinations.
// Broker nav items extend the shared NavItem with the broker-only
// `adminOnly` flag. Rendered through the shared SidebarNavItem accordion
// (base=""), so children/exact behave exactly like the realtor nav.
type BrokerNavItem = NavItem & { adminOnly?: boolean };
type BrokerNavSection = { label: string; items: BrokerNavItem[] };

export const brokerAdminNavSections: BrokerNavSection[] = [
  {
    label: '',
    items: [
      // Chippi-for-Brokers Phase 1 — pinned at the top, mirroring the
      // realtor sidebar's top-pinned Chippi entry. Same icon (chip avatar
      // is rendered by the broker nav via FlatNavItem; MessageCircle is the
      // fallback used elsewhere in the broker nav). The existing
      // /broker/agent-activity entry was previously also labelled "Chippi"
      // — that one is the activity feed, not the chat surface; renamed
      // to "Agent activity" below to avoid two nav rows with the same name.
      {
        href: '/broker/chippi',
        label: 'Chippi',
        icon: MessageCircle,
        exact: true,
        adminOnly: false,
        isAI: true,
        // Mirrors the realtor Chippi dropdown (Brief / Inbox / History).
        // Brief and Reviews are real broker routes; "History" points at the
        // chat home (/broker), where the conversation-history drawer lives.
        children: [
          { href: '/broker/brief', label: 'Today' },
          { href: '/broker/reviews', label: 'Inbox' },
          { href: '/broker/chippi', label: 'History', exact: true },
        ],
      },
      // The Floor — the single command view (who's reachable, what's waiting,
      // what's stalled, who's asking for judgement). First stop of the day;
      // every deeper surface is one link away from it or one disclosure down.
      { href: '/broker/floor', label: 'The Floor', icon: Radar, exact: false, adminOnly: false },
      { href: '/broker/brief', label: 'Today', icon: LayoutDashboard, exact: false, adminOnly: false },
      { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false, adminOnly: false },
      { href: '/broker/deals', label: 'Deals', icon: Briefcase, exact: false, adminOnly: false },
      { href: '/broker/pipeline', label: 'Pipeline', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/messages', label: 'Messages', icon: MessagesSquare, exact: false, adminOnly: false },
      {
        href: '/broker/settings',
        label: 'Settings',
        icon: SlidersHorizontal,
        exact: false,
        adminOnly: true,
        // Union of the former settings-only sidebar and the main Settings
        // accordion. General is the parent route; every other destination is
        // a child so no link disappears when settings uses the shared shell.
        children: [
          { href: '/broker/settings/profile', label: 'Profile' },
          { href: '/broker/invitations', label: 'Invitations' },
          { href: '/broker/settings/form-builder', label: 'Form builder' },
          { href: '/broker/settings/auto-assignment', label: 'Auto-assignment' },
          { href: '/broker/settings/routing-rules', label: 'Routing rules' },
          { href: '/broker/settings/mcp', label: 'MCP' },
          { href: '/broker/billing', label: 'Billing' },
        ],
      },
    ],
  },
  {
    label: 'More',
    items: [
      // Command surfaces demoted from the main rail by the Focus Update —
      // still one disclosure away; the Floor's KPI tiles deep-link into the
      // daily ones (Reviews, Leads, Deals) so the rail stays five-ish rows.
      { href: '/broker/people', label: 'People', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/forecast', label: 'Forecast', icon: TrendingUp, exact: false, adminOnly: false },
      { href: '/broker/properties', label: 'Properties', icon: Building2, exact: false, adminOnly: false },
      { href: '/broker/reviews', label: 'Reviews', icon: Flag, exact: false, adminOnly: false },
      { href: '/broker/agent-activity', label: 'Agent activity', icon: Activity, exact: false, adminOnly: false },
      { href: '/broker/activity', label: 'Audit log', icon: Shield, exact: false, adminOnly: true },
      { href: '/broker/integrations', label: 'Plugins', icon: Plug, exact: false, adminOnly: false },
      { href: '/broker/routines', label: 'Routines', icon: CalendarClock, exact: false, adminOnly: true },
      { href: '/broker/members', label: 'Members', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/realtors', label: 'Real estate agents', icon: UserCircle, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
      { href: '/broker/analytics', label: 'Analytics', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/profitability', label: 'Profitability', icon: Coins, exact: false, adminOnly: false },
      { href: '/broker/usage', label: 'Usage', icon: Gauge, exact: false, adminOnly: false },
      { href: '/broker/import-export', label: 'Import / export', icon: Upload, exact: false, adminOnly: true },
    ],
  },
];

// Phase 7 — realtor-members of a brokerage see their own work first.
// Team-wide tools live one glance below in the More section; routes are
// unchanged.
export const brokerMemberNavSections: BrokerNavSection[] = [
  {
    label: '',
    items: [
      { href: '/broker/brief', label: 'Today', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/my-leads', label: 'My leads', icon: PhoneIncoming, exact: false, adminOnly: false },
      { href: '/broker/messages', label: 'Messages', icon: MessagesSquare, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers: determine active state for nav items and children
// ═══════════════════════════════════════════════════════════════════════════════

function isChildActive(child: NavChild, pathname: string, base: string, searchParams?: string): boolean {
  const [childPath, childQuery] = child.href.split('?');
  const fullHref = `${base}${childPath}`;

  // If the child has query params, match both pathname AND query params
  if (childQuery) {
    if (pathname !== fullHref && !pathname.startsWith(fullHref + '/')) return false;
    // Compare query params
    const childParams = new URLSearchParams(childQuery);
    const currentParams = new URLSearchParams(searchParams || '');
    for (const [key, value] of childParams.entries()) {
      if (currentParams.get(key) !== value) return false;
    }
    return true;
  }

  // No query params — use path matching
  if (child.exact) {
    return pathname === fullHref && !searchParams;
  }
  return pathname.startsWith(fullHref);
}

/** Returns true if the current pathname belongs to this item or any of its children. */
function doesItemOwnPath(item: NavItem, pathname: string, base: string): boolean {
  if (item.href === '') {
    return pathname === base;
  }
  if (item.children) {
    // Check children first — some children like /form-analytics don't share the parent prefix
    const childMatch = item.children.some((child) => {
      const childPath = child.href.split('?')[0];
      const fullChildPath = `${base}${childPath}`;
      return child.exact
        ? pathname === fullChildPath
        : pathname.startsWith(fullChildPath);
    });
    if (childMatch) return true;
  }
  // An `exact` parent only owns its own exact route — used by the broker
  // Chippi entry (/broker), whose href is a prefix of every other broker
  // route. Without this, a prefix match would light up Chippi on every
  // broker page.
  if (item.exact) {
    return pathname === `${base}${item.href}`;
  }
  // A sub-route promoted to its own nav row (Today at /chippi/brief) is
  // disclaimed by the parent so the two rows never light up together.
  if (item.excludePaths?.some((p) => pathname.startsWith(`${base}${p}`))) {
    return false;
  }
  return pathname.startsWith(`${base}${item.href}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section label (used in broker nav)
// ═══════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  // Empty labels hide entirely so a "label-less" section renders flush.
  if (!children) return null;
  // Uses the canonical SECTION_LABEL token + sidebar-specific spacing so every
  // small-caps grouping label across the app shares one type treatment.
  return (
    <p className={`${SECTION_LABEL} px-3 pt-6 pb-2 select-none`}>
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Flat nav item (for broker nav, settings sub-pages)
// ═══════════════════════════════════════════════════════════════════════════════

function FlatNavItem({
  href,
  label,
  icon: Icon,
  isActive,
  badge,
  isAI = false,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  isActive: boolean;
  badge?: React.ReactNode;
  /**
   * When true the item renders the chip avatar (chip-avatar.png) instead of
   * the icon — matches the realtor sidebar's top-pinned Chippi treatment.
   * Use for the broker's Chippi nav entry only.
   */
  isAI?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // h-9 row, same height as the realtor nav rows and canonical button
        // default so every row in the sidebar aligns optically.
        'group relative flex items-center gap-2.5 h-9 pl-3 pr-2.5 rounded-md text-[13px]',
        'transition-[background-color,color,transform] duration-150 hover:translate-x-[1.5px]',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium ring-1 ring-inset ring-sidebar-border/70'
          : 'text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground',
      )}
      style={{ willChange: 'transform' }}
    >
      {isAI ? (
        /* Chip avatar — same 16×16 rounded-full as the realtor Chippi row */
        <img
          src="/chip-avatar.png"
          alt=""
          className="w-[16px] h-[16px] rounded-full flex-shrink-0 ring-1 ring-border/40"
        />
      ) : (
        <Icon
          size={15}
          strokeWidth={isActive ? 2.25 : 1.75}
          className={cn(
            'flex-shrink-0 transition-colors',
            isActive
              ? 'text-sidebar-accent-foreground'
              : 'text-foreground/55 group-hover:text-foreground',
          )}
        />
      )}
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Search pill — opens the existing CommandPalette
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Quiet "Search · ⌘K" pill below the workspace identity. The CommandPalette
 * (mounted at the layout level) listens for cmd+k / ctrl+k globally; the
 * pill triggers it via a synthetic KeyboardEvent so we don't need to plumb
 * a context. Detects platform for the kbd hint.
 */
export function SearchPill({ collapsed = false }: { collapsed?: boolean }) {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.userAgent));
  }, []);

  function open() {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: false, bubbles: true }),
    );
  }

  if (collapsed) {
    return (
      <CollapsedTooltip enabled label="Search">
        <button
          type="button"
          onClick={open}
          className="mx-auto flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] hover:scale-[1.05] transition-[background-color,color,transform] duration-150"
          aria-label="Open command palette"
        >
          <Search size={15} className="flex-shrink-0" strokeWidth={1.75} />
        </button>
      </CollapsedTooltip>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="mx-3 flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-md text-[13px] text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] hover:translate-x-[1.5px] transition-[background-color,color,transform] duration-150 group"
      aria-label="Open command palette"
    >
      <Search size={13} className="flex-shrink-0" strokeWidth={1.75} />
      <span className="flex-1 text-left">Search</span>
      <kbd className="text-[10px] tabular-nums bg-foreground/[0.04] group-hover:bg-foreground/[0.06] text-muted-foreground px-1.5 py-0.5 rounded font-mono transition-colors">
        {isMac ? '⌘' : 'Ctrl+'}K
      </kbd>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Quick-create — SquarePen icon button beside the workspace switcher. Opens a
// small dropdown of "new record" shortcuts. The list deliberately stays short:
// new contact, new deal, new property. Anything else lives behind a full menu
// or the command palette.
// ═══════════════════════════════════════════════════════════════════════════════

function QuickCreateMenu({ slug }: { slug: string }) {
  const base = `/s/${slug}`;
  const items: { href: string; label: string }[] = [
    { href: `${base}/contacts?new=contact`, label: 'New contact' },
    { href: `${base}/deals/new`, label: 'New deal' },
    { href: `${base}/properties/new`, label: 'New property' },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Quick create"
          className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] hover:scale-[1.08] active:scale-95 transition-[background-color,color,transform] duration-150"
        >
          <SquarePen size={13} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href}>{item.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Workspace switcher
// ═══════════════════════════════════════════════════════════════════════════════

export function WorkspaceSwitcher({
  currentName,
  currentSubtitle,
  currentIcon: Icon,
  slug,
  spaceName,
  brokerageMemberships,
  isOnBrokerPage,
  collapsed = false,
  showQuickCreate = false,
  userEmail = null,
  inDrawer = false,
}: {
  currentName: string;
  currentSubtitle: string;
  currentIcon: React.ComponentType<{ size?: number; className?: string }>;
  slug: string;
  spaceName: string;
  brokerageMemberships: { id: string; name: string; role: string }[];
  isOnBrokerPage: boolean;
  collapsed?: boolean;
  /** Render the SquarePen "new" quick-create dropdown next to the switcher. */
  showQuickCreate?: boolean;
  /** Current user's email, rendered as the popover header. */
  userEmail?: string | null;
  /**
   * Mobile-drawer mode — expands the workspace list inline below the chip
   * instead of opening a Radix Popover. Radix Popover content inside a
   * modal Sheet ends up pointer-events-blocked because it portals as a
   * body sibling and the Sheet's modal disables siblings.
   */
  inDrawer?: boolean;
}) {
  const base = `/s/${slug}`;
  const [drawerExpanded, setDrawerExpanded] = useState(false);

  // Build the workspace list. The realtor's own workspace is always first;
  // brokerage memberships follow. Each gets a ⌘1/⌘2/⌘3… shortcut so the
  // popover doubles as a keyboard switcher — same shape as the inspiration.
  const workspaces: {
    key: string;
    name: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    isCurrent: boolean;
  }[] = [];
  if (slug) {
    workspaces.push({
      key: 'solo',
      name: spaceName,
      href: base,
      icon: Briefcase,
      isCurrent: !isOnBrokerPage,
    });
  }
  for (const b of brokerageMemberships) {
    workspaces.push({
      key: b.id,
      name: b.name,
      href: '/broker',
      icon: Building2,
      isCurrent: isOnBrokerPage,
    });
  }

  if (inDrawer) {
    // Inline-expand inside the mobile drawer. Same rich content as the
    // popover (email header, ⌘1/⌘2/⌘3, "+ New") just stacked vertically
    // below the chip instead of in a Popover portal.
    return (
      <div className="mx-3">
        <button
          type="button"
          onClick={() => setDrawerExpanded((v) => !v)}
          aria-expanded={drawerExpanded}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors hover:bg-foreground/[0.025]"
        >
          <div className="rounded-md bg-foreground/[0.06] flex items-center justify-center flex-shrink-0 w-6 h-6">
            <Icon size={12} className="text-foreground/80" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate text-foreground leading-tight">
              {currentName}
            </p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.08em] leading-tight mt-0.5">
              {currentSubtitle}
            </p>
          </div>
          <ChevronsUpDown size={11} className="text-muted-foreground/40 flex-shrink-0" />
        </button>
        {drawerExpanded && (
          <div className="mt-1 pt-1 border-t border-border/40 space-y-0.5">
            <WorkspaceSwitcherRows
              workspaces={workspaces}
              userEmail={userEmail}
              hasTeam={brokerageMemberships.length > 0}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(collapsed ? 'flex justify-center' : 'mx-3')}>
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-1')}>
        <Popover>
          <CollapsedTooltip enabled={collapsed} label={`${currentName} · Switch workspace`}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'group/switcher rounded-md text-left transition-colors hover:bg-foreground/[0.025] cursor-pointer',
                  collapsed
                    ? 'flex items-center justify-center w-9 h-9'
                    : 'flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5',
                )}
                aria-label={collapsed ? `${currentName} — switch workspace` : undefined}
              >
                <div className="rounded-md bg-foreground/[0.06] flex items-center justify-center flex-shrink-0 w-6 h-6 transition-transform duration-150 group-hover/switcher:scale-[1.08]">
                  <Icon size={12} className="text-foreground/80" />
                </div>
                {!collapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate text-foreground leading-tight">
                        {currentName}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.08em] leading-tight mt-0.5">
                        {currentSubtitle}
                      </p>
                    </div>
                    <ChevronsUpDown size={11} className="text-muted-foreground/40 flex-shrink-0" />
                  </>
                )}
              </button>
            </PopoverTrigger>
          </CollapsedTooltip>
          <WorkspaceSwitcherPopoverContent
            workspaces={workspaces}
            userEmail={userEmail}
            hasTeam={brokerageMemberships.length > 0}
            collapsed={collapsed}
          />
        </Popover>
        {!collapsed && showQuickCreate && (
          <QuickCreateMenu slug={slug} />
        )}
      </div>
    </div>
  );
}

function WorkspaceSwitcherRows({
  workspaces,
  userEmail,
  hasTeam,
}: {
  workspaces: {
    key: string;
    name: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    isCurrent: boolean;
  }[];
  userEmail: string | null;
  hasTeam: boolean;
}) {
  return (
    <>
      {userEmail && (
        <div className="flex items-center gap-2 px-2.5 py-2">
          <span className="flex-1 truncate text-[12px] text-foreground/85">
            {userEmail}
          </span>
          <ChevronsUpDown
            size={12}
            strokeWidth={1.75}
            className="text-muted-foreground/60 flex-shrink-0"
          />
        </div>
      )}
      {userEmail && <div className="my-1 mx-1 h-px bg-border/60" />}
      {workspaces.map((w, idx) => {
        const WIcon = w.icon;
        const shortcut = `⌘${idx + 1}`;
        return (
          <Link
            key={w.key}
            href={w.href}
            onClick={() => { if (!w.isCurrent && w.href === '/broker') triggerAccountSwitch(); }}
            className={cn(
              'group flex items-center gap-2.5 h-9 px-2 rounded-md text-[12px] transition-colors duration-150',
              w.isCurrent
                ? 'bg-foreground/[0.04] text-foreground'
                : 'text-foreground/85 hover:bg-foreground/[0.05] hover:text-foreground',
            )}
          >
            <div className="w-6 h-6 rounded-md bg-foreground/[0.06] flex items-center justify-center flex-shrink-0">
              <WIcon size={12} className="text-foreground/80" />
            </div>
            <span className="flex-1 truncate font-medium">{w.name}</span>
            {w.isCurrent ? (
              <Check size={13} strokeWidth={2} className="text-foreground flex-shrink-0" />
            ) : (
              <kbd className="text-[10px] tabular-nums bg-foreground/[0.04] text-muted-foreground px-1.5 py-0.5 rounded font-mono">
                {shortcut}
              </kbd>
            )}
          </Link>
        );
      })}
      <div className="my-1 mx-1 h-px bg-border/60" />
      <Link
        href="/brokerage"
        className="group flex items-center gap-2 h-9 px-2 rounded-md text-[12px] text-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground transition-colors duration-150"
      >
        <Plus size={13} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="flex-1 text-left">
          {hasTeam ? 'New team' : 'Create or join a team'}
        </span>
        <kbd className="text-[10px] tabular-nums bg-foreground/[0.04] text-muted-foreground px-1.5 py-0.5 rounded font-mono">
          ⌘A
        </kbd>
      </Link>
    </>
  );
}

function WorkspaceSwitcherPopoverContent({
  workspaces,
  userEmail,
  hasTeam,
  collapsed,
}: {
  workspaces: {
    key: string;
    name: string;
    href: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    isCurrent: boolean;
  }[];
  userEmail: string | null;
  hasTeam: boolean;
  collapsed: boolean;
}) {
  return (
    <PopoverContent
      side={collapsed ? 'right' : 'bottom'}
      align="start"
      sideOffset={8}
      className="w-72 p-1 rounded-xl border border-border/70"
    >
      <WorkspaceSwitcherRows
        workspaces={workspaces}
        userEmail={userEmail}
        hasTeam={hasTeam}
      />
    </PopoverContent>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// User footer
// ═══════════════════════════════════════════════════════════════════════════════

function UserFooter({
  href,
  displayName,
  imageUrl,
  collapsed = false,
}: {
  href: string;
  displayName: string;
  imageUrl?: string | null;
  collapsed?: boolean;
}) {
  // Quiet user identity pinned to the bottom. Mirrors the sidebar's flat row
  // language (h-9, 13px text, subtle hover, foreground left tint on press)
  // so the chip doesn't read as a different surface.
  if (collapsed) {
    return (
      <div className="p-2 flex justify-center">
        <CollapsedTooltip enabled label={displayName}>
          <Link
            href={href}
            className="group flex items-center justify-center w-9 h-9 rounded-md hover:bg-foreground/[0.025] transition-colors duration-150"
            aria-label={displayName}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                className="w-7 h-7 rounded-full flex-shrink-0 object-cover ring-1 ring-border/50"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-foreground/80 font-semibold text-[11px] flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
        </CollapsedTooltip>
      </div>
    );
  }

  return (
    <div className="p-2">
      <Link
        href={href}
        className="group flex items-center gap-2.5 h-9 pl-1 pr-2.5 rounded-md hover:bg-foreground/[0.025] transition-colors duration-150"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-7 h-7 rounded-full flex-shrink-0 object-cover ring-1 ring-border/50"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-foreground/80 font-semibold text-[11px] flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate leading-tight">
            {displayName}
          </p>
        </div>
        <ChevronRight
          size={11}
          className="flex-shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/60 transition-colors"
        />
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BrokerSidebarConversations — slim broker conversation history rendered when
// on the broker Chippi page (/broker). Mirrors the realtor SidebarConversations
// structure (New button + recent list + active rail) but calls the broker-
// scoped conversations API and links into /broker?conversationId=… instead of
// /s/[slug]/chippi. Client state and rendered rows are capped at 50.
// ═══════════════════════════════════════════════════════════════════════════════

interface BrokerSidebarConversationsProps {
  limit?: number;
  hideLabel?: boolean;
  onSelect?: () => void;
}

export function BrokerSidebarConversations({
  limit = 50,
  hideLabel = false,
  onSelect,
}: BrokerSidebarConversationsProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<
    { id: string; title: string; preview?: string | null; updatedAt: string }[] | null
  >(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/broker-conversations');
      if (!res.ok) { setConversations([]); return; }
      const data = await res.json();
      const boundedLimit = Math.max(1, Math.min(limit, 50));
      setConversations(Array.isArray(data) ? data.slice(0, boundedLimit) : []);
    } catch {
      setConversations([]);
    }
  }, [limit]);

  useEffect(() => { void fetchConversations(); }, [fetchConversations]);

  const handleNew = useCallback(async () => {
    const res = await fetch('/api/ai/broker-conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) return;
    const conv = await res.json();
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    setConversations((prev) => (prev ? [conv, ...prev].slice(0, boundedLimit) : [conv]));
    router.push(`/broker/chippi?conversationId=${conv.id}`);
    onSelect?.();
  }, [limit, onSelect, router]);

  function timeAgo(date: string): string {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-1">
      {!hideLabel && (
        <p className={cn(SECTION_LABEL, 'px-3 pt-1 pb-1.5 select-none')}>
          Chat history
        </p>
      )}

      <button
        type="button"
        onClick={() => void handleNew()}
        className="group w-full flex items-center gap-2 h-8 px-2.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
      >
        <Plus size={13} strokeWidth={1.75} className="flex-shrink-0" />
        <span className="flex-1 text-left">New conversation</span>
      </button>

      <div className="pt-1">
        {conversations === null ? (
          <div className="space-y-1 px-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-md bg-foreground/[0.04] animate-pulse" aria-hidden />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 px-3 py-4 leading-snug">
            No chats yet. Say something below.
          </p>
        ) : (
          <ul className="space-y-px">
            {conversations.map((conv) => {
              const isActive = activeId === conv.id;
              return (
                <li key={conv.id} className="relative">
                  {isActive && (
                    <motion.span
                      layoutId="broker-conv-active-rail"
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground"
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )}
                  <div
                    className={cn(
                      'group/row flex items-center gap-1 rounded-md transition-[background-color,transform] duration-150 hover:translate-x-[1.5px]',
                      isActive ? 'bg-foreground/[0.045]' : 'hover:bg-foreground/[0.04]',
                    )}
                  >
                    <Link
                      href={`/broker/chippi?conversationId=${conv.id}`}
                      onClick={() => onSelect?.()}
                      className="flex-1 min-w-0 pl-2.5 pr-1 py-1.5"
                    >
                      <p
                        className={cn(
                          'text-[13px] truncate leading-tight',
                          isActive ? 'font-medium text-foreground' : 'text-foreground/80',
                        )}
                        title={conv.title}
                      >
                        {conv.title.length > 24 ? conv.title.slice(0, 23).trimEnd() + '…' : conv.title}
                      </p>
                      {conv.preview ? (
                        <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5 leading-tight">
                          {conv.preview}
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5 leading-tight">
                          No messages yet
                        </p>
                      )}
                      <p className="text-[11px] tabular-nums text-muted-foreground/60 leading-tight mt-0.5">
                        {timeAgo(conv.updatedAt)}
                      </p>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Realtor nav — 3 sections: AI at top, Workspace in middle, Settings at bottom
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// ─────────────────────────────────────────────────────────────────────────────
// Section groupings — sit BETWEEN the existing nav items as small-caps
// headers. The realtor nav is one flat list in `lib/nav-items.ts` (so any
// route addition picks up shared chrome); the groupings are an inline
// rendering concern here. Adding a header means picking which existing items
// belong to which bucket — not a new feature, just a calmer read.
//
// The buckets, top → bottom:
//   • Chippi   → no header (top-pinned, AI)
//   • WORKSPACE → daily work (People, Deals, Calendar, Mailbox, Properties, Studio, Files)
//   • SETUP    → once-and-done (Profile, Intake form)
//   • Settings → no header (bottom-pinned)
// ─────────────────────────────────────────────────────────────────────────────

// The Focus Update: the sidebar is CORE + MORE, nothing else.
//   • CORE — the five doors an agent actually opens daily: Chippi (pinned AI
//     row), Today, People, Deals, and Messages (brokerage members). Every
//     capability outside these is reachable by asking Chippi or in context.
//   • MORE — everything else, one collapsed disclosure below the core.
//     Collapsed by default; auto-opens when the active route lives inside it;
//     the user's manual choice is remembered (localStorage).
const CORE_HREFS = new Set<string>(['/chippi/brief', '/contacts', '/deals']);
const MORE_STORAGE_KEY = 'sidebar:more-open';

// ─────────────────────────────────────────────────────────────────────────────
// Notification slot — reserved space that sits between the scroll area
// (RealtorNav, including conversation history on /chippi) and the pinned
// user footer. The inspiration the realtor shared shows a small
// "Update available →" card here; we don't have a real notification feed
// yet, so the slot renders nothing today. Shipping a fake "update card"
// here would be product theatre — Jobs rule: configuration is failure to
// decide, and decorative copy is failure to be honest.
//
// The slot is a function (not a JSX block) so the call site reads as
// `<SidebarNotificationSlot />` and the empty-today contract is visible
// at the render point. When the feed exists, replace `return null` with
// the card render and the layout will absorb it without re-plumbing.
// ─────────────────────────────────────────────────────────────────────────────

function SidebarNotificationSlot({ collapsed = false }: { collapsed?: boolean }) {
  // Rail-mode collapses the slot entirely — no horizontal room for a card
  // and we don't want a half-card hint in the icon strip.
  if (collapsed) return null;
  // v1: no notification feed, so render nothing. Reserved so future work
  // (e.g. "new release notes", "billing nudge") slots in without moving
  // the user footer up/down.
  return null;
}

type SidebarRailLink = {
  href: string;
  label: string;
  icon: NavItem['icon'];
  isActive: boolean;
  badgeText?: string;
};

/** Preserve the first occurrence so parent/child aliases never duplicate a
 * destination inside the compact rail's single More menu. */
export function dedupeSidebarRailLinks<T extends { href: string }>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function RailMoreMenu({ links }: { links: SidebarRailLink[] }) {
  const items = dedupeSidebarRailLinks(links);
  if (items.length === 0) return null;

  const isActive = items.some((item) => item.isActive);
  const hasBadge = items.some((item) => item.badgeText);

  return (
    <DropdownMenu>
      <CollapsedTooltip
        enabled
        label={hasBadge ? 'More navigation · updates' : 'More navigation'}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="More navigation"
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'group relative mx-auto flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-150',
              isActive
                ? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-inset ring-sidebar-border/70'
                : 'text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground',
            )}
          >
            <MoreHorizontal size={16} strokeWidth={1.75} />
            {hasBadge && (
              <span
                aria-hidden
                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar"
              />
            )}
          </button>
        </DropdownMenuTrigger>
      </CollapsedTooltip>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-64 max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))]"
      >
        <DropdownMenuLabel className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          More
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5',
                  item.isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                )}
              >
                <Icon size={14} strokeWidth={item.isActive ? 2.25 : 1.75} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badgeText && (
                  <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-foreground/[0.06] px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {item.badgeText}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin console link — platform-admin only. Sits just above the user-footer
// divider, separated by a hairline. Reads as "leave the realtor app to the
// internal console" — same nav-row vocabulary (h-9, 13px, subtle hover) but
// tonally quieter than a CTA: muted-foreground at rest, foreground on hover.
// Renders in all three sidebar states: expanded, collapsed rail, and footer.
// ─────────────────────────────────────────────────────────────────────────────

function AdminConsoleLink({ collapsed = false }: { collapsed?: boolean }) {
  if (collapsed) {
    return (
      <div className="px-1 pb-1">
        <CollapsedTooltip enabled label="Admin">
          <Link
            href="/admin"
            aria-label="Admin console"
            className={cn(
              'group relative flex items-center justify-center w-9 h-9 mx-auto rounded-md',
              'transition-[background-color,color,transform] duration-150 hover:scale-[1.04]',
              'text-muted-foreground/70 hover:bg-foreground/[0.025] hover:text-foreground',
            )}
          >
            <Shield
              size={15}
              strokeWidth={1.75}
              className="flex-shrink-0 transition-colors text-muted-foreground/55 group-hover:text-foreground"
            />
          </Link>
        </CollapsedTooltip>
      </div>
    );
  }

  return (
    <div className="px-2 py-1">
      <Link
        href="/admin"
        className={cn(
          'group relative flex items-center gap-2.5 h-9 pl-3 pr-2.5 rounded-md text-[13px]',
          'transition-[background-color,color,transform] duration-150 hover:translate-x-[1.5px]',
          'text-muted-foreground/70 hover:bg-foreground/[0.025] hover:text-foreground',
        )}
      >
        <Shield
          size={15}
          strokeWidth={1.75}
          className="flex-shrink-0 transition-colors text-muted-foreground/55 group-hover:text-foreground"
        />
        <span className="flex-1 truncate">Admin</span>
      </Link>
    </div>
  );
}

function RealtorNav({
  slug,
  base,
  pathname,
  searchParamsString,
  unreadLeadCount,
  overdueFollowUpCount,
  pendingDraftCount,
  activePropertyCount,
  activeWorkflowCount,
  isBrokerageMember,
}: {
  slug: string;
  base: string;
  pathname: string;
  searchParamsString: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
  pendingDraftCount: number;
  activePropertyCount: number;
  activeWorkflowCount: number;
  /**
   * True when this realtor belongs to at least one brokerage. Gates the
   * "Reviews" row: deal-reviews are broker feedback on deals the agent
   * flagged, so a solo realtor (no broker) has no reviews to see. Threaded
   * from RealtorSidebarShell, which already receives brokerageMemberships.
   */
  isBrokerageMember: boolean;
}) {
  const { collapsed, toggle } = useSidebarCollapsed();
  const reducedMotion = useReducedMotion() ?? false;
  const settingsItem = realtorNavItems.find((item) => item.href === '/settings')!;

  // Accordion: at most one parent is expanded at a time. The parent that
  // owns the active route auto-expands; if no parent owns it, everyone
  // stays collapsed. Computed from pathname so route changes (incl. soft
  // navigations) keep the open section in sync without a separate effect.
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
    // Only auto-set if the route actually maps to a parent. If the user
    // navigates to a leaf that lives outside any parent (e.g. /contacts),
    // leave whatever they last opened alone — closing it on every nav
    // would feel hostile.
    if (next) setExpandedKey(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, base]);

  // AI-related items always sit at the top
  const aiItems = realtorNavItems.filter((item) => item.isAI);
  // CORE — the daily doors, in canonical lib/nav-items.ts order: Today,
  // People, Deals (+ Messages for brokerage members, appended below).
  const coreItems = realtorNavItems.filter(
    (item) => !item.isAI && CORE_HREFS.has(item.href),
  );
  // Team messaging — real-time DMs + channels with the brokerage. Defined
  // here (not lib/nav-items.ts) because that file can't gate by brokerage
  // membership; a solo realtor has no team to message.
  if (isBrokerageMember) {
    coreItems.push({
      href: '/messages',
      label: 'Messages',
      icon: MessagesSquare,
    });
  }
  // MORE — every capability that isn't a daily door. Nothing is removed:
  // Automations, Calendar, Mailbox, Properties, Studio, Files, Profile,
  // Intake all live here, one disclosure down. Canonical order preserved.
  const moreItems = realtorNavItems.filter(
    (item) =>
      !item.isAI &&
      item.href !== '/settings' &&
      !CORE_HREFS.has(item.href),
  );
  // Reviews — broker feedback on deals the agent flagged. Brokerage members
  // only (same gate as Messages); occasional, so it lives in More.
  if (isBrokerageMember) {
    moreItems.push({
      href: '/reviews',
      label: 'Reviews',
      icon: Flag,
    });
  }

  // More disclosure state: closed by default (the whole point), auto-open
  // when the active route lives inside it, manual choice remembered.
  const moreOwnsPath = moreItems.some((item) => doesItemOwnPath(item, pathname, base));
  // The server cannot see localStorage. Reading it in the state initializer
  // made the server render More collapsed while a returning browser rendered
  // it expanded on the first client pass, forcing every realtor route through
  // React hydration recovery. Start identically closed, then restore the
  // preference after hydration.
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(MORE_STORAGE_KEY) === '1') {
        setMoreOpen(true);
      }
    } catch {
      /* private mode — session-only state is fine */
    }
  }, []);
  const moreVisible = moreOpen || moreOwnsPath;
  const toggleMore = () => {
    setMoreOpen((prev) => {
      const next = !(prev || moreOwnsPath);
      try {
        window.localStorage.setItem(MORE_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — session-only state is fine */
      }
      return next;
    });
  };

  const chippiRoot = `/s/${slug}/chippi`;
  const onChippi = pathname === chippiRoot;
  const [sidebarView, setSidebarView] = useChippiSidebarView(pathname, chippiRoot);
  // A 56px rail cannot communicate conversation titles. Preserve the user's
  // collapsed preference and keep the icon menu visible; the History icon is
  // an explicit request to expand into the shared history surface.
  const renderedSidebarView = collapsed ? 'menu' : sidebarView;

  // Badge vocabulary, two tiers:
  //   • Calm count (leads, properties) — muted pill, rounded-md, small.
  //     Sits to the right of the label like the inspiration's "Messages 16".
  //     `bg-foreground/[0.05]` keeps it inside the paper-flat hairline
  //     vocabulary; no `bg-secondary` blue, no harsh accent.
  //   • Action count (pendingDrafts) — foreground pill, rounded-full.
  //     Reserved for "you owe this" per STYLESHEET §Visual hierarchy —
  //     the only badge that should pull the eye.
  const calmBadgeClasses =
    'inline-flex h-[18px] items-center justify-center rounded-md px-1.5 ' +
    'text-[11px] font-medium tabular-nums flex-shrink-0 ' +
    'bg-foreground/[0.05] text-muted-foreground';
  const loudBadgeClasses =
    'inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center ' +
    'rounded-full text-[11px] font-semibold tabular-nums flex-shrink-0 ' +
    'bg-primary text-primary-foreground';

  const getBadge = (item: NavItem): React.ReactNode => {
    if (item.badgeKey === 'leads' && unreadLeadCount > 0) {
      return (
        <span className={calmBadgeClasses}>
          <PulseNumber value={unreadLeadCount > 99 ? '99+' : unreadLeadCount} />
        </span>
      );
    }
    if (item.badgeKey === 'pendingDrafts' && pendingDraftCount > 0) {
      return (
        <span className={loudBadgeClasses}>
          <PulseNumber value={pendingDraftCount > 99 ? '99+' : pendingDraftCount} />
        </span>
      );
    }
    if (item.badgeKey === 'properties' && activePropertyCount > 0) {
      return (
        <span className={calmBadgeClasses}>
          <PulseNumber value={activePropertyCount > 99 ? '99+' : activePropertyCount} />
        </span>
      );
    }
    if (item.badgeKey === 'activeWorkflows' && activeWorkflowCount > 0) {
      return (
        <span className={calmBadgeClasses}>
          <PulseNumber value={activeWorkflowCount > 99 ? '99+' : activeWorkflowCount} />
        </span>
      );
    }
    return undefined;
  };

  const getBadgeText = (item: NavItem): string | undefined => {
    if (item.badgeKey === 'leads' && unreadLeadCount > 0) {
      return unreadLeadCount > 99 ? '99+' : String(unreadLeadCount);
    }
    if (item.badgeKey === 'pendingDrafts' && pendingDraftCount > 0) {
      return pendingDraftCount > 99 ? '99+' : String(pendingDraftCount);
    }
    if (item.badgeKey === 'properties' && activePropertyCount > 0) {
      return activePropertyCount > 99 ? '99+' : String(activePropertyCount);
    }
    if (item.badgeKey === 'activeWorkflows' && activeWorkflowCount > 0) {
      return activeWorkflowCount > 99 ? '99+' : String(activeWorkflowCount);
    }
    return undefined;
  };

  // Accordion handler: opening any parent closes the previously-open one.
  // The shared SidebarNavItem fires onToggle when the user taps the chevron;
  // we own the single source of expansion state here, so the contract is
  // naturally "one open at a time" without per-item bookkeeping.
  const handleToggle = (key: string) => () =>
    setExpandedKey((prev) => (prev === key ? null : key));

  const renderItem = (item: NavItem) => {
    const hasChildren = !!(item.children && item.children.length > 0);
    return (
      <SidebarNavItem
        key={item.href}
        item={item}
        base={base}
        isActive={doesItemOwnPath(item, pathname, base)}
        isExpanded={hasChildren && expandedKey === item.href}
        isChildActive={(child) => isChildActive(child, pathname, base, searchParamsString)}
        onToggle={handleToggle(item.href)}
        badge={getBadge(item)}
        badgeText={getBadgeText(item)}
        collapsed={collapsed}
      />
    );
  };

  const childRailLinks = (item: NavItem): SidebarRailLink[] =>
    (item.children ?? []).map((child) => ({
      href: `${base}${child.href}`,
      label: `${item.label} · ${child.label}`,
      icon: item.icon,
      isActive: isChildActive(child, pathname, base, searchParamsString),
    }));
  const hiddenRailItems = [...moreItems, ...realtorMoreNavItems];
  const railMoreLinks: SidebarRailLink[] = [
    ...[...aiItems, ...coreItems].flatMap(childRailLinks),
    ...hiddenRailItems.flatMap((item) => [
      {
        href: `${base}${item.href}`,
        label: item.label,
        icon: item.icon,
        isActive: doesItemOwnPath(item, pathname, base),
        badgeText: getBadgeText(item),
      },
      ...childRailLinks(item),
    ]),
  ];

  return (
    <nav
      className={cn(
        'flex-1 py-2 overflow-y-auto',
        collapsed ? 'px-1' : 'px-3',
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={renderedSidebarView}
          {...chippiSidebarPanelMotion(renderedSidebarView, reducedMotion)}
          className="space-y-3"
        >
      {renderedSidebarView === 'history' && onChippi ? (
        <div>
          <button
            type="button"
            onClick={() => setSidebarView('menu')}
            className="mb-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Back to menu
          </button>
          <SidebarConversations slug={slug} limit={50} hideLabel />
        </div>
      ) : (
        <>
          {onChippi && (
            collapsed ? (
              <CollapsedTooltip enabled label="Conversation history">
                <button
                  type="button"
                  onClick={() => {
                    setSidebarView('history');
                    toggle();
                  }}
                  aria-label="Conversation history"
                  className="group relative flex h-10 w-10 items-center justify-center mx-auto rounded-md text-foreground/65 transition-colors duration-150 hover:bg-foreground/[0.025] hover:text-foreground"
                >
                  <History size={15} strokeWidth={1.75} />
                </button>
              </CollapsedTooltip>
            ) : (
              <button
                type="button"
                onClick={() => setSidebarView('history')}
                className="inline-flex h-8 items-center rounded-md px-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
              >
                Conversation history
              </button>
            )
          )}
      {/* One navigation surface, two views. The exact Chippi root defaults to
          conversation history. "Back to menu" swaps in every product link;
          the menu's quiet "Conversation history" control swaps back without
          adding another rail or covering the chat.

          The visual polish pass (PR: sidebar-jobs-polish) introduced two
          small-caps headers — WORKSPACE above the daily-work rows, SETUP
          above the once-and-done rows — to give a 7-row flat list a
          calmer read without changing what's in it. `lib/nav-items.ts`
          stays the canonical order; the headers are an inline rendering
          choice here. In collapsed-rail mode the labels disappear (no
          horizontal room) and the rows render flush. */}
      <div className="space-y-0.5">
        {/* Always visible — top-pinned AI items (Chippi + future AI rows).
            No header above this bucket: Chippi is the brand mark; it
            doesn't need a category to belong to. */}
        {aiItems.map(renderItem)}

        {/* CORE — the daily doors: Today, People, Deals (+ Messages for
            brokerage members). No section header; five rows don't need a
            category. This IS the sidebar; everything below is disclosure. */}
        {coreItems.map(renderItem)}

        {/* MORE — every other capability, one disclosure down. Nothing was
            removed from the product; it just stopped being a decision the
            agent makes on every glance. Closed by default, auto-opens when
            the active route lives inside, choice remembered. In collapsed
            rail mode the header has no room — render the rows flat (the
            rail is already an opt-in power view). */}
        {collapsed ? (
          <RailMoreMenu links={railMoreLinks} />
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMore}
              aria-expanded={moreVisible}
              className={cn(
                SECTION_LABEL,
                'flex w-full items-center gap-1 px-3 pt-4 pb-1.5 select-none',
                'cursor-pointer transition-colors hover:text-foreground',
              )}
            >
              More
              <ChevronDown
                size={12}
                strokeWidth={2}
                className={cn(
                  'transition-transform duration-200',
                  moreVisible ? 'rotate-0' : '-rotate-90',
                )}
              />
            </button>
            {moreVisible && moreItems.map(renderItem)}
          </>
        )}
      </div>

      {/* realtorMoreNavItems — the secondary slot for non-Chippi pages.
          Empty today; kept so future additions don't require a layout
          replumb. Only renders when the array has items AND we're not on
          Chippi (the Chippi state owns this region). */}
      {realtorMoreNavItems.length > 0 && !collapsed && !onChippi && (
        <div>
          <div className="space-y-0.5">{realtorMoreNavItems.map(renderItem)}</div>
        </div>
      )}

      {/* Settings — pinned at bottom of scroll area. No children today; the
          shared row handles the no-children case as a plain link with no
          chevron, so this stays in lockstep with the rest of the nav. */}
      <div className="pt-1">
        <SidebarNavItem
          item={settingsItem}
          base={base}
          isActive={doesItemOwnPath(settingsItem, pathname, base)}
          isExpanded={false}
          isChildActive={(child) => isChildActive(child, pathname, base, searchParamsString)}
          onToggle={handleToggle(settingsItem.href)}
          collapsed={collapsed}
        />
      </div>
        </>
      )}
        </motion.div>
      </AnimatePresence>
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Sidebar export
// ═══════════════════════════════════════════════════════════════════════════════

export function Sidebar({
  slug,
  spaceName,
  accountName = null,
  unreadLeadCount,
  pendingDraftCount = 0,
  overdueFollowUpCount = 0,
  activePropertyCount = 0,
  activeWorkflowCount = 0,
  isBroker = false,
  isBrokerOnly = false,
  brokerageName = null,
  brokerageRole = null,
  brokerageMemberships = [],
  isPlatformAdmin = false,
}: SidebarProps) {
  const pathname = usePathname();
  // Query-param string, reactive to soft navigations. Previously this polled
  // window.location.search every 300ms forever (a state-compare 3×/sec on every
  // page); useSearchParams() already re-renders on param changes — no interval.
  const searchParamsString = useSearchParams().toString();
  const base = `/s/${slug}`;
  const { user } = useUser();
  // Shared collapse state (provided by the layout). The broker branch below
  // uses it to rail like the realtor sidebar; the header panel toggle drives it.
  const { collapsed: brokerCollapsed, toggle: brokerToggle } = useSidebarCollapsed();
  const brokerReducedMotion = useReducedMotion() ?? false;
  const [brokerSidebarView, setBrokerSidebarView] = useChippiSidebarView(
    pathname,
    '/broker/chippi',
  );
  const renderedBrokerSidebarView = brokerCollapsed ? 'menu' : brokerSidebarView;

  // Broker nav accordion — one parent expanded at a time, same contract as
  // RealtorNav. Declared here (not inside the broker branch) because that
  // branch returns early and hooks must not live after a conditional return.
  // base is "" for the broker nav (its hrefs are already absolute, e.g.
  // /broker/leads), so doesItemOwnPath is called with base "" below.
  const brokerSections =
    brokerageRole === 'realtor_member'
      ? brokerMemberNavSections
      : brokerAdminNavSections;
  const findBrokerActiveParentKey = (): string | null => {
    for (const section of brokerSections) {
      for (const item of section.items) {
        if (item.children?.length && doesItemOwnPath(item, pathname, '')) {
          return item.href;
        }
      }
    }
    return null;
  };
  const [brokerExpandedKey, setBrokerExpandedKey] = useState<string | null>(
    findBrokerActiveParentKey,
  );
  useEffect(() => {
    const next = findBrokerActiveParentKey();
    // Same as RealtorNav: only auto-open when the route maps to a parent.
    // Navigating to a leaf outside any parent leaves the user's last-opened
    // section alone rather than collapsing it on every navigation.
    if (next) setBrokerExpandedKey(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, brokerageRole]);
  const handleBrokerToggle = (key: string) => () =>
    setBrokerExpandedKey((prev) => (prev === key ? null : key));
  const canManageBrokerage =
    brokerageRole === 'broker_owner' || brokerageRole === 'broker_admin';
  const isVisibleBrokerItem = (item: BrokerNavItem) =>
    !item.adminOnly || canManageBrokerage;
  const brokerPrimaryItems = (brokerSections[0]?.items ?? []).filter(isVisibleBrokerItem);
  const brokerSettingsItem = brokerPrimaryItems.find(
    (item) => item.href === '/broker/settings',
  );
  const brokerCoreItems = brokerPrimaryItems.filter(
    (item) => item.href !== '/broker/settings',
  );
  const brokerSecondaryItems = brokerSections
    .slice(1)
    .flatMap((section) => section.items)
    .filter(isVisibleBrokerItem);
  const brokerRailVisibleHrefs = new Set([
    ...brokerCoreItems.map((item) => item.href),
    ...(brokerSettingsItem ? [brokerSettingsItem.href] : []),
  ]);
  const brokerChildRailLinks = (item: BrokerNavItem): SidebarRailLink[] =>
    (item.children ?? [])
      .filter((child) => !brokerRailVisibleHrefs.has(child.href))
      .map((child) => ({
        href: child.href,
        label: `${item.label} · ${child.label}`,
        icon: item.icon,
        isActive: isChildActive(child, pathname, '', searchParamsString),
      }));
  const brokerRailMoreLinks: SidebarRailLink[] = [
    ...brokerCoreItems.flatMap(brokerChildRailLinks),
    ...brokerSecondaryItems.flatMap((item) => [
      {
        href: item.href,
        label: item.label,
        icon: item.icon,
        isActive: doesItemOwnPath(item, pathname, ''),
      },
      ...brokerChildRailLinks(item),
    ]),
    ...(brokerSettingsItem ? brokerChildRailLinks(brokerSettingsItem) : []),
  ];

  // Admin console link visibility. The server passes isPlatformAdmin from the
  // DB platformRole; we OR it with the Clerk publicMetadata.role so an admin
  // set via the Clerk Dashboard (before the DB role propagates) still sees the
  // link. Rendered in every shell — realtor AND broker — because a platform
  // admin is often also a broker/owner and would otherwise never see it.
  const showAdminLink =
    isPlatformAdmin ||
    (user?.publicMetadata as { role?: string } | undefined)?.role === 'admin';

  // Prefer the Chippi profile name (DB, chosen at onboarding) over the Clerk
  // identity, which is seeded from the Google/Gmail account and isn't what the
  // realtor picked. Fall back to Clerk, then to a neutral label.
  const clerkName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ')
    : '';
  const displayName = (accountName ?? '').trim() || clerkName || 'My Account';
  // Primary email — used as the muted subtitle in the user footer chip.
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const isOnBrokerPage = pathname.startsWith('/broker');

  // ── Broker sidebar ───────────────────────────────────────────────────────
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return (
      <aside data-dashboard-sidebar className={cn('group/rail relative hidden md:flex flex-col bg-sidebar border border-border/85 rounded-2xl shrink-0 overflow-hidden transition-[width] duration-200 ease-out m-3 shadow-[0_1px_1px_rgb(17_17_19/0.025),0_6px_18px_-16px_rgb(17_17_19/0.2)]', brokerCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH)}>
        {/* Same brand-warm tint as the realtor sidebar so brokers see the
            same identity when they switch workspaces. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-gradient-to-b from-foreground/[0.03] to-transparent"
        />
        <div className="relative z-10 flex flex-col h-full">
          {/* Brand mark — in collapsed rail mode it doubles as the expand
              affordance, mirroring the realtor sidebar. */}
          <div className={cn('pt-5 pb-3', brokerCollapsed ? 'flex justify-center px-2' : 'flex items-center justify-between px-4')}>
            {brokerCollapsed ? (
              <button
                type="button"
                onClick={brokerToggle}
                aria-label="Expand sidebar"
                title="Expand sidebar"
                className="flex items-center justify-center w-10 h-10 rounded-md text-muted-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <PanelLeftOpen size={18} strokeWidth={1.75} />
              </button>
            ) : (
              <>
                <BrandLogo className="h-5" alt="Chippi" />
                <button
                  type="button"
                  onClick={brokerToggle}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <PanelLeftClose size={16} strokeWidth={1.75} />
                </button>
              </>
            )}
          </div>

          <WorkspaceSwitcher
            currentName={brokerageName ?? 'Team'}
            currentSubtitle="Team"
            currentIcon={Building2}
            slug={slug}
            spaceName={spaceName}
            brokerageMemberships={brokerageMemberships}
            isOnBrokerPage={isOnBrokerPage}
            collapsed={brokerCollapsed}
            userEmail={userEmail}
          />

          <div className="mt-3">
            <SearchPill collapsed={brokerCollapsed} />
          </div>

          {/* Broker primary nav — same structural vocabulary as RealtorNav:
              py-2 vertical breathing, space-y-3 between section groups,
              overflow-y-auto so deep section lists don't push the footer off. */}
          <nav
            className={cn(
              'flex-1 py-2 mt-1 overflow-y-auto',
              brokerCollapsed ? 'px-1' : 'px-3',
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={renderedBrokerSidebarView}
                {...chippiSidebarPanelMotion(renderedBrokerSidebarView, brokerReducedMotion)}
                className="space-y-3"
              >
            {renderedBrokerSidebarView === 'history' && pathname === '/broker/chippi' ? (
              <div>
                <button
                  type="button"
                  onClick={() => setBrokerSidebarView('menu')}
                  className="mb-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
                >
                  <ArrowLeft size={13} strokeWidth={1.75} />
                  Back to menu
                </button>
                <BrokerSidebarConversations limit={50} hideLabel />
              </div>
            ) : (
              <>
                {pathname === '/broker/chippi' && (
                  brokerCollapsed ? (
                    <CollapsedTooltip enabled label="Conversation history">
                      <button
                        type="button"
                        onClick={() => {
                          setBrokerSidebarView('history');
                          brokerToggle();
                        }}
                        aria-label="Conversation history"
                        className="group relative flex h-10 w-10 items-center justify-center mx-auto rounded-md text-foreground/65 transition-colors duration-150 hover:bg-foreground/[0.025] hover:text-foreground"
                      >
                        <History size={15} strokeWidth={1.75} />
                      </button>
                    </CollapsedTooltip>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBrokerSidebarView('history')}
                      className="inline-flex h-8 items-center rounded-md px-2 text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      Conversation history
                    </button>
                  )
                )}
            {brokerCollapsed ? (
              <div className="space-y-0.5">
                {brokerCoreItems.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    item={item}
                    base=""
                    collapsed
                    isActive={doesItemOwnPath(item, pathname, '')}
                    isExpanded={false}
                    isChildActive={(child) =>
                      isChildActive(child, pathname, '', searchParamsString)
                    }
                    onToggle={handleBrokerToggle(item.href)}
                  />
                ))}
                <RailMoreMenu links={brokerRailMoreLinks} />
                {brokerSettingsItem && (
                  <SidebarNavItem
                    item={brokerSettingsItem}
                    base=""
                    collapsed
                    isActive={doesItemOwnPath(brokerSettingsItem, pathname, '')}
                    isExpanded={false}
                    isChildActive={(child) =>
                      isChildActive(child, pathname, '', searchParamsString)
                    }
                    onToggle={handleBrokerToggle(brokerSettingsItem.href)}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {brokerSections.map((section) => {
                  const visibleItems = section.items.filter(isVisibleBrokerItem);
                  if (visibleItems.length === 0) return null;
                  return (
                    <div key={section.label}>
                      <SectionLabel>{section.label}</SectionLabel>
                      {visibleItems.map((item) => {
                        const isActive = doesItemOwnPath(item, pathname, '');
                        const hasChildren = !!item.children?.length;
                        return (
                          <SidebarNavItem
                            key={item.href}
                            item={item}
                            base=""
                            isActive={isActive}
                            isExpanded={hasChildren && brokerExpandedKey === item.href}
                            isChildActive={(child) =>
                              isChildActive(child, pathname, '', searchParamsString)
                            }
                            onToggle={handleBrokerToggle(item.href)}
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

          {/* What's New card — same slot as the realtor sidebar. Broker users
              see the same release notes. Collapses to an icon in rail mode,
              matching the realtor shell. */}
          <SidebarWhatsNew collapsed={brokerCollapsed} />

          {showAdminLink && (
            <>
              <div className="border-t border-border/60" />
              <AdminConsoleLink collapsed={brokerCollapsed} />
            </>
          )}
          {/* User footer — matches the realtor's SidebarUserMenu chip (avatar +
              name + email + popover with themes/settings/logout). The old
              UserFooter was a plain link with no popover — swapped for parity. */}
          <div className="border-t border-border/50" />
          <SidebarUserMenu
            slug={slug}
            displayName={displayName}
            email={userEmail}
            imageUrl={user?.imageUrl}
            collapsed={brokerCollapsed}
          />
        </div>
      </aside>
    );
  }

  // ── Realtor workspace sidebar ────────────────────────────────────────────
  // The SidebarCollapseProvider now lives in the layout (wrapping both this
  // sidebar and the header), so the header's panel toggle and the sidebar
  // share one collapse state.
  return (
    <RealtorSidebarShell
      slug={slug}
      spaceName={spaceName}
      base={base}
      pathname={pathname}
      searchParamsString={searchParamsString}
      unreadLeadCount={unreadLeadCount}
      overdueFollowUpCount={overdueFollowUpCount}
      pendingDraftCount={pendingDraftCount}
      activePropertyCount={activePropertyCount}
      activeWorkflowCount={activeWorkflowCount}
      brokerageMemberships={brokerageMemberships}
      isOnBrokerPage={isOnBrokerPage}
      displayName={displayName}
      imageUrl={user?.imageUrl}
      email={userEmail}
      isPlatformAdmin={showAdminLink}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Realtor sidebar shell — consumes the collapse context so all subcomponents
// can react to width changes via `useSidebarCollapsed()`. The aside container
// transitions width only on user-toggle (not on initial hydration).
// ═══════════════════════════════════════════════════════════════════════════════

function RealtorSidebarShell({
  slug,
  spaceName,
  base,
  pathname,
  searchParamsString,
  unreadLeadCount,
  overdueFollowUpCount,
  pendingDraftCount,
  activePropertyCount,
  activeWorkflowCount = 0,
  brokerageMemberships,
  isOnBrokerPage,
  displayName,
  imageUrl,
  email,
  isPlatformAdmin = false,
}: {
  slug: string;
  spaceName: string;
  base: string;
  pathname: string;
  searchParamsString: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
  pendingDraftCount: number;
  activePropertyCount: number;
  activeWorkflowCount?: number;
  brokerageMemberships: { id: string; name: string; role: string }[];
  isOnBrokerPage: boolean;
  displayName: string;
  imageUrl?: string | null;
  email?: string | null;
  isPlatformAdmin?: boolean;
}) {
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <aside
      data-dashboard-sidebar
      className={cn(
        'group/rail relative hidden md:flex flex-col bg-sidebar border border-border/85 rounded-2xl shrink-0 m-3 shadow-[0_1px_1px_rgb(17_17_19/0.025),0_6px_18px_-16px_rgb(17_17_19/0.2)]',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH,
      )}
    >
      {/* Brand-warm tint at top — clip width follows the rail so the orange
          wash doesn't hint at content beyond the visible edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 rounded-t-2xl bg-gradient-to-b from-foreground/[0.03] to-transparent"
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* Brand mark — small, monochrome, sets identity without dominating.
            Expanded: the logo sits at the left with a panel-collapse button
            on the right. Collapsed: the logo gives way to an open-panel icon
            that expands the rail. */}
        <div
          className={cn(
            'pt-5 pb-3',
            collapsed ? 'flex justify-center px-2' : 'flex items-center justify-between px-4',
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggle}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="flex items-center justify-center w-10 h-10 rounded-md text-muted-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            </button>
          ) : (
            <>
              <BrandLogo className="h-5" alt="Chippi" />
              <button
                type="button"
                onClick={toggle}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <PanelLeftClose size={16} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>

        {/* Workspace identity (with switcher when there's somewhere to go).
            The SquarePen quick-create button sits inline on the right when
            the sidebar is expanded — a small dropdown of "new contact / new
            deal / new property" shortcuts. Hidden in collapsed rail mode
            because the row is the workspace identity at that width. */}
        <WorkspaceSwitcher
          currentName={spaceName}
          currentSubtitle="Solo real estate agent"
          currentIcon={Briefcase}
          slug={slug}
          spaceName={spaceName}
          // List the realtor's brokerage(s) in the switcher so a brokerage
          // owner/member can jump to the brokerage dashboard straight from the
          // dropdown. Previously this was hard-coded to [] and the only path
          // was the header "Switch to {brokerage}" link — owners opened the
          // dropdown to pick their brokerage, didn't find it, and reported the
          // switcher as broken. The header link stays as a second affordance.
          brokerageMemberships={brokerageMemberships}
          isOnBrokerPage={isOnBrokerPage}
          collapsed={collapsed}
          showQuickCreate
          userEmail={email}
        />

        {/* Search */}
        <div className="mt-3">
          <SearchPill collapsed={collapsed} />
        </div>

        {/* Primary nav + More + Settings */}
        <RealtorNav
          slug={slug}
          base={base}
          pathname={pathname}
          searchParamsString={searchParamsString}
          unreadLeadCount={unreadLeadCount}
          overdueFollowUpCount={overdueFollowUpCount}
          pendingDraftCount={pendingDraftCount}
          activePropertyCount={activePropertyCount}
          activeWorkflowCount={activeWorkflowCount}
          isBrokerageMember={brokerageMemberships.length > 0}
        />

        {/* Notification card slot — reserved space the inspiration the
            realtor sent shows as an "Update available →" card. We don't
            have a notification feed yet; the slot returns null today so
            the layout doesn't shift when it's added later. */}
        <SidebarNotificationSlot collapsed={collapsed} />

        {/* What's new card — small paper-flat update card pinned just above
            the user footer. Dismissed state lives in localStorage with a
            `v1` suffix so future bumps re-show. Hidden entirely in
            collapsed rail mode (no horizontal room). */}
        <SidebarWhatsNew collapsed={collapsed} />

        {/* Platform-admin console link — only rendered for isPlatformAdmin
            accounts. Separated from the user footer by a hairline so it
            reads as "this exits the realtor app." Calm; no CTA weight. */}
        {isPlatformAdmin && (
          <>
            <div className="border-t border-border/60" />
            <AdminConsoleLink collapsed={collapsed} />
          </>
        )}

        {/* User footer pinned at bottom, separated by a hairline. The chip
            opens an account-menu popover (Themes, Settings, Notifications,
            Hotkeys, Apps, Referrals, Plans, Help, Trash, Log out). The
            collapse toggle is the panel button in the header. */}
        <div className="border-t border-border/50" />
        <SidebarUserMenu
          slug={slug}
          displayName={displayName}
          email={email}
          imageUrl={imageUrl}
          collapsed={collapsed}
        />
      </div>
    </aside>
  );
}
