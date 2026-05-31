'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { realtorNavItems, realtorMoreNavItems } from '@/lib/nav-items';
import type { NavItem, NavChild } from '@/lib/nav-items';
import { SECTION_LABEL } from '@/lib/typography';
import { SIDEBAR_WIDTH, SIDEBAR_COLLAPSED } from '@/lib/geometry';
import {
  SidebarCollapseProvider,
  CollapsedTooltip,
  useSidebarCollapsed,
} from '@/components/dashboard/sidebar-collapse';
import { SidebarNavItem } from '@/components/dashboard/sidebar-nav-item';
import { SidebarConversations } from '@/components/dashboard/sidebar-conversations';
import { SidebarFavorites } from '@/components/dashboard/sidebar-favorites';
import { SidebarWhatsNew } from '@/components/dashboard/sidebar-whats-new';
import { SidebarUserMenu } from '@/components/dashboard/sidebar-user-menu';
import { PulseNumber } from '@/components/ui/pulse-number';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCircle,
  Mail,
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
  Upload,
  ArrowLeft,
  Settings,
  Key,
  Shuffle,
  GitBranch,
  CreditCard,
  Plus,
  Check,
  Search,
  Flag,
  History,
  SquarePen,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  slug: string;
  spaceName: string;
  unreadLeadCount: number;
  pendingDraftCount?: number;
  overdueFollowUpCount?: number;
  activePropertyCount?: number;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
  brokerageMemberships?: { id: string; name: string; role: string }[];
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
// Settings sub-pages (form-builder, tracking, MCP, auto-assignment, routing
// rules) live behind /broker/settings's own in-page tab strip.
const brokerAdminNavSections = [
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
      { href: '/broker/chippi', label: 'Chippi', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker', label: 'Team', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false, adminOnly: false },
      { href: '/broker/pipeline', label: 'Pipeline', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/reviews', label: 'Reviews', icon: Flag, exact: false, adminOnly: false },
      { href: '/broker/agent-activity', label: 'Agent activity', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/settings', label: 'Settings', icon: SlidersHorizontal, exact: false, adminOnly: true },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/broker/members', label: 'Members', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team chat', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
      { href: '/broker/analytics', label: 'Analytics', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/import-export', label: 'Import / export', icon: Upload, exact: false, adminOnly: true },
    ],
  },
];

// Phase 7 — realtor-members of a brokerage see their own work first.
// Team-wide tools live one glance below in the More section; routes are
// unchanged.
const brokerMemberNavSections = [
  {
    label: '',
    items: [
      { href: '/broker', label: 'My day', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/my-leads', label: 'My leads', icon: PhoneIncoming, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team chat', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
    ],
  },
];

const brokerSettingsNavSections = [
  {
    label: 'Brokerage',
    items: [
      { href: '/broker/settings', label: 'General', icon: Settings, exact: true },
      { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
      { href: '/broker/settings/mcp', label: 'MCP', icon: Key, exact: false },
    ],
  },
  {
    label: 'Lead Management',
    items: [
      { href: '/broker/settings/auto-assignment', label: 'Auto-Assignment', icon: Shuffle, exact: false },
      { href: '/broker/settings/routing-rules', label: 'Routing rules', icon: GitBranch, exact: false },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/broker/billing', label: 'Billing', icon: CreditCard, exact: false },
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
    // Exact match: pathname matches AND no filter query params present
    const currentParams = new URLSearchParams(searchParams || '');
    const hasFilterParams = currentParams.has('type') || currentParams.has('tier') || currentParams.has('sort');
    return pathname === fullHref && !hasFilterParams;
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
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  isActive: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // 36px row instead of 44px — desktop-mouse driven, not mobile-touch.
        // Tighter row reads as "list of decisions" not "list of items".
        'group relative flex items-center gap-2.5 h-9 pl-3 pr-2.5 rounded-md text-[13px] transition-colors duration-150',
        isActive
          ? 'bg-foreground/[0.045] text-foreground font-medium'
          : 'text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground',
      )}
    >
      {/* Active accent bar — 2px on the left, foreground tone, rounded
          corner on the inner edge. The signature distinguishing active
          from hover beyond the background tint. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground"
        />
      )}
      <Icon
        size={15}
        strokeWidth={isActive ? 2.25 : 1.75}
        className={cn(
          'flex-shrink-0 transition-colors',
          isActive ? 'text-foreground' : 'text-foreground/55 group-hover:text-foreground',
        )}
      />
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
          className="mx-auto flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors duration-150"
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
      className="mx-3 flex items-center gap-2 h-9 pl-3 pr-1.5 rounded-md text-[13px] text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025] transition-colors duration-150 group"
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
    { href: `${base}/contacts/new`, label: 'New contact' },
    { href: `${base}/deals`, label: 'New deal' },
    { href: `${base}/properties/new`, label: 'New property' },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Quick create"
          className="flex-shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
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

function WorkspaceSwitcher({
  currentName,
  currentSubtitle,
  currentIcon: Icon,
  slug,
  spaceName,
  brokerageMemberships,
  isOnBrokerPage,
  collapsed = false,
  showQuickCreate = false,
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
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const base = `/s/${slug}`;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Hide the switcher chevron when there's nothing to switch to. Most solo
  // realtors won't have a brokerage; in that case the workspace identity
  // reads as a quiet label, not a teasing dropdown.
  const hasSwitchTargets = brokerageMemberships.length > 0;

  return (
    <div ref={ref} className={cn('relative', collapsed ? 'flex justify-center' : 'mx-3')}>
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-1')}>
      <CollapsedTooltip
        enabled={collapsed && !open}
        label={hasSwitchTargets ? `${currentName} · Switch workspace` : currentName}
      >
        <button
          onClick={() => hasSwitchTargets && setOpen(!open)}
          disabled={!hasSwitchTargets}
          className={cn(
            'rounded-md text-left transition-colors',
            collapsed
              ? 'flex items-center justify-center w-9 h-9'
              : 'flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5',
            hasSwitchTargets ? 'hover:bg-foreground/[0.025] cursor-pointer' : 'cursor-default',
          )}
          aria-label={collapsed ? currentName : undefined}
        >
          <div
            className={cn(
              'rounded-md bg-foreground/[0.06] flex items-center justify-center flex-shrink-0',
              collapsed ? 'w-6 h-6' : 'w-6 h-6',
            )}
          >
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
              {hasSwitchTargets && (
                <ChevronsUpDown size={11} className="text-muted-foreground/40 flex-shrink-0" />
              )}
            </>
          )}
        </button>
      </CollapsedTooltip>
      {!collapsed && showQuickCreate && (
        <QuickCreateMenu slug={slug} />
      )}
      </div>

      {open && (
        <div
          className={cn(
            'z-50 rounded-lg border bg-popover shadow-lg overflow-hidden',
            collapsed
              ? 'absolute left-full top-0 ml-2 w-64'
              : 'absolute left-0 right-0 top-full mt-1',
          )}
        >
          {slug && (
            <Link
              href={base}
              onClick={() => setOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors',
                !isOnBrokerPage && 'bg-accent',
              )}
            >
              <Briefcase size={14} className="text-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{spaceName}</p>
                <p className="text-[10px] text-muted-foreground">My workspace</p>
              </div>
              {!isOnBrokerPage && (
                <Check size={14} className="text-foreground flex-shrink-0" />
              )}
            </Link>
          )}

          {brokerageMemberships.length > 0 && (
            <>
              <div className="border-t border-border" />
              <p className={`${SECTION_LABEL} px-3 pt-2 pb-1`}>
                Brokerages
              </p>
              {brokerageMemberships.map((b) => (
                <Link
                  key={b.id}
                  href="/broker"
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-accent transition-colors',
                    isOnBrokerPage && 'bg-accent',
                  )}
                >
                  <Building2 size={14} className="text-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {b.role === 'broker_owner'
                        ? 'Owner'
                        : b.role === 'broker_admin'
                          ? 'Admin'
                          : 'Member'}
                    </p>
                  </div>
                  {isOnBrokerPage && (
                    <Check size={14} className="text-foreground flex-shrink-0" />
                  )}
                </Link>
              ))}
            </>
          )}

          {brokerageMemberships.length === 0 && !isOnBrokerPage && (
            <>
              <div className="border-t border-border" />
              <Link
                href="/brokerage"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <Plus size={14} className="flex-shrink-0" />
                <span>Create or join a brokerage</span>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
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
// Realtor nav — 3 sections: AI at top, Workspace in middle, Settings at bottom
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Edge-handle collapse toggle — a small chevron button that sticks half-off the
// right edge of the realtor sidebar. Discoverable on hover (idle = ghosted,
// rail-hover = solid). Mirrors the Linear / VS Code resize-handle pattern.
// ═══════════════════════════════════════════════════════════════════════════════

function EdgeCollapseHandle() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const Icon = collapsed ? ChevronRight : ChevronLeft;
  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        // Position: vertical centre of the rail, half-off the right edge.
        'absolute top-1/2 -right-3 z-30 -translate-y-1/2',
        // Shape: small square with hairline ring + bg matching the page.
        'flex items-center justify-center w-6 h-6 rounded-full',
        'border border-border/70 bg-background text-muted-foreground/70',
        // Visibility: faded by default; full on rail-hover or self-hover.
        'opacity-0 group-hover/rail:opacity-100 hover:opacity-100',
        'hover:text-foreground hover:bg-foreground/[0.04]',
        'transition-opacity duration-150 active:scale-[0.94]',
        // Subtle shadow so the handle reads as on top of the rail edge.
        'shadow-sm shadow-foreground/[0.04]',
      )}
    >
      <Icon size={12} strokeWidth={2} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section groupings — sit BETWEEN the existing nav items as small-caps
// headers. The realtor nav is one flat list in `lib/nav-items.ts` (so any
// route addition picks up shared chrome); the groupings are an inline
// rendering concern here. Adding a header means picking which existing items
// belong to which bucket — not a new feature, just a calmer read.
//
// The buckets, top → bottom:
//   • Chippi   → no header (top-pinned, AI)
//   • WORKSPACE → daily work (People, Deals, Calendar, Communication, Properties, Studio, Files)
//   • SETUP    → once-and-done (Profile, Intake form)
//   • Settings → no header (bottom-pinned)
// ─────────────────────────────────────────────────────────────────────────────

const WORKSPACE_HREFS = new Set<string>([
  '/contacts',
  '/deals',
  '/calendar',
  '/communication',
  '/properties',
  '/studio',
  '/files',
]);
const SETUP_HREFS = new Set<string>([
  '/profile-page',
  '/intake',
]);

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

function RealtorNav({
  slug,
  base,
  pathname,
  searchParamsString,
  unreadLeadCount,
  overdueFollowUpCount,
  pendingDraftCount,
  activePropertyCount,
}: {
  slug: string;
  base: string;
  pathname: string;
  searchParamsString: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
  pendingDraftCount: number;
  activePropertyCount: number;
}) {
  const { collapsed } = useSidebarCollapsed();
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
  // Workspace bucket — daily work surfaces (gets the WORKSPACE small-caps
  // header above it). Filtered through the canonical realtorNavItems order
  // so route additions inherit the order without touching this file.
  const workspaceItems = realtorNavItems.filter(
    (item) => !item.isAI && WORKSPACE_HREFS.has(item.href),
  );
  // Setup bucket — once-and-done surfaces (gets the SETUP small-caps header).
  const setupItems = realtorNavItems.filter(
    (item) => !item.isAI && SETUP_HREFS.has(item.href),
  );
  // Any leaf the buckets above didn't claim — kept appended (no header) so
  // a new route added to `lib/nav-items.ts` still renders. The set-based
  // filter makes the bucketing additive, not exhaustive.
  const otherItems = realtorNavItems.filter(
    (item) =>
      !item.isAI &&
      item.href !== '/settings' &&
      !WORKSPACE_HREFS.has(item.href) &&
      !SETUP_HREFS.has(item.href),
  );

  // Route IS the signal for which nav mode this sidebar is in. On
  // /chippi/* the main links cross-fade out and the conversation history
  // slides in their place; off Chippi, the reverse.
  const onChippi = pathname.startsWith(`/s/${slug}/chippi`);

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

  return (
    <nav
      className={cn(
        'flex-1 py-2 overflow-y-auto space-y-3',
        collapsed ? 'px-1' : 'px-3',
      )}
    >
      {/* Two-mode sidebar: on /chippi the conversation history slides in
          below the main nav. The main destinations (People, Deals,
          Calendar…) stay visible the whole time — the realtor must always
          have a door out of Chippi, not just a door in. The Chippi nav
          item itself stays pinned at the top regardless so the door in is
          always there too. Settings stays pinned at the bottom.

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

        {/* FAVORITES — collapsible, realtor-curated quick links. v1 stores
            in localStorage per-slug; no DB, no API. Hidden in collapsed
            rail mode. Sits between Chippi (AI top) and Records to match
            the inspiration: the agent up top, the realtor's personal
            shortlist next, then the canonical record types. */}
        <SidebarFavorites slug={slug} base={base} collapsed={collapsed} />

        {/* RECORDS — daily work surfaces (the realtor's book of business:
            People, Deals, Properties, etc.). Labeled to match the
            inspiration's "Records" group above the existing workspace nav
            items — no restructuring of `lib/nav-items.ts`, just a calmer
            small-caps header above the same routes. Hidden in collapsed
            rail mode (no horizontal room). */}
        {workspaceItems.length > 0 && (
          <>
            {!collapsed && (
              <p className={cn(SECTION_LABEL, 'px-3 pt-4 pb-1.5 select-none')}>
                Records
              </p>
            )}
            {workspaceItems.map(renderItem)}
          </>
        )}

        {/* SETUP — once-and-done surfaces (Profile, Intake form). Same
            collapse rule as WORKSPACE. */}
        {setupItems.length > 0 && (
          <>
            {!collapsed && (
              <p className={cn(SECTION_LABEL, 'px-3 pt-4 pb-1.5 select-none')}>
                Setup
              </p>
            )}
            {setupItems.map(renderItem)}
          </>
        )}

        {/* Anything the buckets above didn't claim — appended without a
            header so a new `lib/nav-items.ts` route stays renderable
            without forcing an edit to this file. */}
        {otherItems.map(renderItem)}
      </div>

      {/* Context-aware second section. Route IS the signal:
            - On /chippi/* → CHAT HISTORY label + recent conversation list
              (expanded) or History icon link (collapsed rail). Bounded to
              6 conversations + "See all →" link into the existing in-chat
              history drawer. Animates in/out with the app's standard
              [0.22, 1, 0.36, 1] curve.
            - Elsewhere → render `realtorMoreNavItems` if it has anything.
              It's intentionally empty today, but kept as the slot for
              future secondary nav without re-plumbing the layout. */}
      <AnimatePresence initial={false} mode="wait">
        {onChippi && (
          <motion.div
            key="chippi-history"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {collapsed ? (
              <>
                <div className="my-2 mx-2 h-px bg-border/60" aria-hidden />
                <CollapsedTooltip enabled label="Conversations">
                  <Link
                    href={`/s/${slug}/chippi?view=history`}
                    aria-label="Conversation history"
                    className="group relative flex items-center justify-center w-10 h-10 mx-auto rounded-md text-foreground/65 hover:bg-foreground/[0.025] hover:text-foreground transition-colors duration-150"
                  >
                    <History size={15} strokeWidth={1.75} />
                  </Link>
                </CollapsedTooltip>
              </>
            ) : (
              <>
                {/* Hairline divider — the only thing separating primary
                    nav from chat history. No card, no shadow. */}
                <div className="mx-3 mt-1 mb-2 h-px bg-border/60" aria-hidden />
                <SidebarConversations slug={slug} limit={6} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* realtorMoreNavItems — the secondary slot for non-Chippi pages.
          Empty today; kept so future additions don't require a layout
          replumb. Only renders when the array has items AND we're not on
          Chippi (the Chippi state owns this region). */}
      {realtorMoreNavItems.length > 0 && !onChippi && (
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
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Sidebar export
// ═══════════════════════════════════════════════════════════════════════════════

export function Sidebar({
  slug,
  spaceName,
  unreadLeadCount,
  pendingDraftCount = 0,
  overdueFollowUpCount = 0,
  activePropertyCount = 0,
  isBroker = false,
  isBrokerOnly = false,
  brokerageName = null,
  brokerageRole = null,
  brokerageMemberships = [],
}: SidebarProps) {
  const pathname = usePathname();
  // Read search params and keep in sync with URL changes
  const [searchParamsString, setSearchParamsString] = useState('');
  useEffect(() => {
    const updateParams = () => {
      setSearchParamsString(window.location.search.replace('?', ''));
    };
    updateParams();
    // Listen for popstate (back/forward) and custom pushState/replaceState
    window.addEventListener('popstate', updateParams);
    // Poll briefly to catch Next.js soft navigations that change query params
    const interval = setInterval(updateParams, 300);
    return () => {
      window.removeEventListener('popstate', updateParams);
      clearInterval(interval);
    };
  }, [pathname]);
  const base = `/s/${slug}`;
  const { user } = useUser();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'My Account'
    : 'My Account';
  // Primary email — used as the muted subtitle in the user footer chip.
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  const isOnBrokerPage = pathname.startsWith('/broker');
  const isOnBrokerSettings = pathname.startsWith('/broker/settings');

  // ── Broker settings sub-nav ──────────────────────────────────────────────
  if (isBroker && (isOnBrokerPage || isBrokerOnly) && isOnBrokerSettings) {
    return (
      <aside data-dashboard-sidebar className={cn('hidden md:flex flex-col h-full bg-sidebar border-r border-border/70 shrink-0', SIDEBAR_WIDTH)}>
        <div className="px-4 pt-5 pb-3">
          <BrandLogo className="h-5" alt="Chippi" />
        </div>

        <div className="px-3 pb-1">
          <Link
            href="/broker"
            className="group flex items-center gap-2 h-9 px-2.5 rounded-md text-[13px] font-medium transition-colors duration-150 text-muted-foreground hover:bg-foreground/[0.025] hover:text-foreground"
          >
            <ArrowLeft size={13} strokeWidth={1.75} className="flex-shrink-0" />
            <span>Back to team</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
          {brokerSettingsNavSections.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              {section.items.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <FlatNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={isActive}
                  />
                );
              })}
            </div>
          ))}
        </nav>

        <div className="mx-4 border-t border-border" />
        <UserFooter
          href={slug ? `${base}/profile` : '/broker/settings'}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </aside>
    );
  }

  // ── Broker sidebar ───────────────────────────────────────────────────────
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return (
      <aside data-dashboard-sidebar className={cn('relative hidden md:flex flex-col h-full bg-sidebar border-r border-border/70 shrink-0 overflow-hidden', SIDEBAR_WIDTH)}>
        {/* Same brand-warm tint as the realtor sidebar so brokers see the
            same identity when they switch workspaces. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent"
        />
        <div className="relative z-10 flex flex-col h-full">
          <div className="px-4 pt-5 pb-3">
            <BrandLogo className="h-5" alt="Chippi" />
          </div>

          <WorkspaceSwitcher
            currentName={brokerageName ?? 'Brokerage'}
            currentSubtitle="Brokerage"
            currentIcon={Building2}
            slug={slug}
            spaceName={spaceName}
            brokerageMemberships={brokerageMemberships}
            isOnBrokerPage={isOnBrokerPage}
          />

          <div className="mt-3">
            <SearchPill />
          </div>

          <nav className="flex-1 px-3 pb-2 mt-1 space-y-0.5 overflow-y-auto">
          {(brokerageRole === 'realtor_member'
            ? brokerMemberNavSections
            : brokerAdminNavSections
          ).map((section) => {
            const visibleItems = section.items.filter(
              (item) =>
                !item.adminOnly ||
                brokerageRole === 'broker_owner' ||
                brokerageRole === 'broker_admin',
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <SectionLabel>{section.label}</SectionLabel>
                {visibleItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  const highlightBadge =
                    'highlight' in item &&
                    (item as any).highlight &&
                    !isActive ? (
                      <span className="inline-flex h-2 w-2 rounded-full bg-lead-hot shrink-0" />
                    ) : undefined;
                  return (
                    <FlatNavItem
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      isActive={isActive}
                      badge={highlightBadge}
                    />
                  );
                })}
              </div>
            );
          })}
        </nav>

          <div className="border-t border-border/50" />
          <UserFooter
            href={slug ? `${base}/profile` : '/broker/settings'}
            displayName={displayName}
            imageUrl={user?.imageUrl}
          />
        </div>
      </aside>
    );
  }

  // ── Realtor workspace sidebar ────────────────────────────────────────────
  return (
    <SidebarCollapseProvider>
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
        brokerageMemberships={brokerageMemberships}
        isOnBrokerPage={isOnBrokerPage}
        displayName={displayName}
        imageUrl={user?.imageUrl}
        email={userEmail}
      />
    </SidebarCollapseProvider>
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
  brokerageMemberships,
  isOnBrokerPage,
  displayName,
  imageUrl,
  email,
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
  brokerageMemberships: { id: string; name: string; role: string }[];
  isOnBrokerPage: boolean;
  displayName: string;
  imageUrl?: string | null;
  email?: string | null;
}) {
  const { collapsed, toggle } = useSidebarCollapsed();

  return (
    <aside
      data-dashboard-sidebar
      className={cn(
        'group/rail relative hidden md:flex flex-col h-full bg-sidebar border-r border-border/70 shrink-0',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH,
      )}
    >
      {/* Edge-handle collapse toggle — sticks half-off the right edge of the
          rail so it's discoverable without crowding the nav. Idle = nearly
          invisible (subtle ring), on rail-hover = visible. Click flips
          collapsed state via the existing context. */}
      <EdgeCollapseHandle />
      {/* Brand-warm tint at top — clip width follows the rail so the orange
          wash doesn't hint at content beyond the visible edge. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-orange-50/60 via-orange-50/20 to-transparent dark:from-orange-500/[0.04] dark:via-transparent"
      />

      <div className="relative z-10 flex flex-col h-full">
        {/* Brand mark — small, monochrome, sets identity without dominating.
            In collapsed mode the BrandLogo doubles as the expand affordance:
            tapping the mark flips the rail open. The EdgeCollapseHandle is
            a thin slice on the right edge; the logo is the big, obvious
            target you'd reach for anyway. */}
        <div
          className={cn(
            'pt-5 pb-3',
            collapsed ? 'flex justify-center px-2' : 'px-4',
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggle}
              aria-label="Expand sidebar"
              className="flex items-center justify-center w-10 h-10 rounded-md transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <BrandLogo className="h-5" alt="Chippi" />
            </button>
          ) : (
            <BrandLogo className="h-5" alt="Chippi" />
          )}
        </div>

        {/* Workspace identity (with switcher when there's somewhere to go).
            The SquarePen quick-create button sits inline on the right when
            the sidebar is expanded — a small dropdown of "new contact / new
            deal / new property" shortcuts. Hidden in collapsed rail mode
            because the row is the workspace identity at that width. */}
        <WorkspaceSwitcher
          currentName={spaceName}
          currentSubtitle="Solo realtor"
          currentIcon={Briefcase}
          slug={slug}
          spaceName={spaceName}
          brokerageMemberships={brokerageMemberships}
          isOnBrokerPage={isOnBrokerPage}
          collapsed={collapsed}
          showQuickCreate
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

        {/* User footer pinned at bottom, separated by a hairline. The chip
            opens an account-menu popover (Themes, Settings, Notifications,
            Hotkeys, Apps, Referrals, Plans, Help, Trash, Log out). The
            collapse toggle lives as an edge-handle on the right rail
            (see EdgeCollapseHandle above) — discoverable on hover. */}
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
