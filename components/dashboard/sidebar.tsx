'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { realtorNavItems, realtorMoreNavItems } from '@/lib/nav-items';
import type { NavItem, NavChild } from '@/lib/nav-items';
import {
  Building2,
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
  PanelLeft,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  slug: string;
  spaceName: string;
  unreadLeadCount: number;
  pendingDraftCount?: number;
  overdueFollowUpCount?: number;
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
      { href: '/broker', label: 'Team', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false, adminOnly: false },
      { href: '/broker/pipeline', label: 'Pipeline', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/members', label: 'Members', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/settings', label: 'Settings', icon: SlidersHorizontal, exact: false, adminOnly: true },
    ],
  },
  {
    label: 'More',
    items: [
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
// Collapsible children wrapper with smooth CSS height animation
// ═══════════════════════════════════════════════════════════════════════════════

function CollapsibleChildren({
  children,
  isOpen,
}: {
  children: React.ReactNode;
  isOpen: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(isOpen ? undefined : 0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (isOpen) {
      const measured = el.scrollHeight;
      setHeight(0);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(measured);
        });
      });
    } else {
      const measured = el.scrollHeight;
      setHeight(measured);
      setIsAnimating(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0);
        });
      });
    }
  }, [isOpen]);

  const handleTransitionEnd = useCallback(() => {
    setIsAnimating(false);
    if (isOpen) {
      setHeight(undefined); // Allow natural height after opening
    }
  }, [isOpen]);

  return (
    <div
      ref={contentRef}
      style={{ height: height !== undefined ? `${height}px` : 'auto' }}
      className={cn(
        'transition-[height] duration-200 ease-in-out',
        !isOpen && !isAnimating && 'hidden',
        isAnimating && 'overflow-hidden',
      )}
      onTransitionEnd={handleTransitionEnd}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shopify-style nav item — parent with optional inline collapsible children
// ═══════════════════════════════════════════════════════════════════════════════

function CollapsibleNavItem({
  item,
  base,
  pathname,
  searchParams,
  isExpanded,
  onToggle,
  badge,
}: {
  item: NavItem;
  base: string;
  pathname: string;
  searchParams?: string;
  isExpanded: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
}) {
  const Icon = item.icon;
  const hasChildren = item.children && item.children.length > 0;
  const isParentActive = doesItemOwnPath(item, pathname, base);
  const href = `${base}${item.href}`;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (hasChildren) {
        e.preventDefault();
        onToggle();
      }
    },
    [hasChildren, onToggle],
  );

  return (
    <div>
      {/* Parent item — 44px min touch target (Apple HIG) */}
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          'group relative flex items-center gap-3 min-h-[44px] h-12 px-3 rounded-xl text-[15px] transition-colors',
          isParentActive
            ? 'bg-accent text-foreground font-medium'
            : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground',
        )}
      >
        {item.isAI ? (
          <img
            src="/chip-avatar.png"
            alt="Chip"
            className="w-[20px] h-[20px] rounded-full flex-shrink-0"
          />
        ) : (
          <Icon
            size={20}
            className={cn(
              'flex-shrink-0 transition-colors',
              isParentActive
                ? 'text-foreground'
                : 'text-foreground/70 group-hover:text-foreground',
            )}
          />
        )}

        <span className="flex-1 truncate">{item.label}</span>

        {badge}

        {hasChildren && (
          <ChevronRight
            size={14}
            className={cn(
              'flex-shrink-0 text-muted-foreground/40 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          />
        )}
      </Link>

      {/* Inline children — no icons, indented, smaller text */}
      {hasChildren && (
        <CollapsibleChildren isOpen={isExpanded}>
          <div className="ml-[18px] pl-3.5 py-1 space-y-0.5 border-l border-border/40">
            {item.children!.map((child) => {
              const childHref = `${base}${child.href}`;
              const childActive = isChildActive(child, pathname, base, searchParams);
              return (
                <Link
                  key={child.href}
                  href={childHref}
                  className={cn(
                    'flex items-center min-h-[36px] h-9 px-2.5 rounded-md text-[13px] transition-colors',
                    childActive
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground font-normal hover:text-foreground hover:bg-accent',
                  )}
                >
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </CollapsibleChildren>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section label (used in broker nav)
// ═══════════════════════════════════════════════════════════════════════════════

function SectionLabel({ children }: { children: React.ReactNode }) {
  // Empty labels hide entirely so a "label-less" section renders flush.
  if (!children) return null;
  return (
    <p className="px-2.5 pt-5 pb-2 text-[11px] font-medium text-muted-foreground select-none">
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
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-3 h-11 px-3 rounded-xl text-[15px] transition-colors',
        isActive
          ? 'bg-accent text-foreground font-medium'
          : 'text-foreground/70 font-normal hover:bg-accent hover:text-foreground',
      )}
    >
      <Icon
        size={18}
        className={cn(
          'flex-shrink-0 transition-colors',
          isActive
            ? 'text-foreground'
            : 'text-foreground/70 group-hover:text-foreground',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </Link>
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
}: {
  currentName: string;
  currentSubtitle: string;
  currentIcon: React.ComponentType<{ size?: number; className?: string }>;
  slug: string;
  spaceName: string;
  brokerageMemberships: { id: string; name: string; role: string }[];
  isOnBrokerPage: boolean;
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

  return (
    <div ref={ref} className="relative mx-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border hover:bg-accent transition-colors text-left"
      >
        <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
          <Icon size={14} className="text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate text-foreground leading-tight">
            {currentName}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {currentSubtitle}
          </p>
        </div>
        <ChevronsUpDown size={13} className="text-muted-foreground/40 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border bg-popover shadow-lg overflow-hidden">
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
              <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
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
}: {
  href: string;
  displayName: string;
  imageUrl?: string | null;
}) {
  return (
    <div className="px-3 py-3">
      <Link
        href={href}
        className="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={displayName}
            className="w-7 h-7 rounded-full flex-shrink-0 object-cover ring-1 ring-border"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-foreground font-semibold text-xs flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate leading-tight">
            {displayName}
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight">View profile</p>
        </div>
      </Link>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Realtor nav — 3 sections: AI at top, Workspace in middle, Settings at bottom
// ═══════════════════════════════════════════════════════════════════════════════

function RealtorNav({
  base,
  pathname,
  searchParamsString,
  unreadLeadCount,
  overdueFollowUpCount,
  pendingDraftCount,
}: {
  base: string;
  pathname: string;
  searchParamsString: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
  pendingDraftCount: number;
}) {
  const settingsItem = realtorNavItems.find((item) => item.href === '/settings')!;
  const isOnSettings = doesItemOwnPath(settingsItem, pathname, base);
  const [settingsExpanded, setSettingsExpanded] = useState(isOnSettings);

  // Expandable key for main items that have children (e.g. Intake form, Analytics)
  const getInitialExpandedKey = () => {
    for (const item of realtorNavItems) {
      if (item.children && item.href !== '/settings' && doesItemOwnPath(item, pathname, base)) {
        return item.href;
      }
    }
    return null;
  };
  const [expandedKey, setExpandedKey] = useState<string | null>(getInitialExpandedKey);

  useEffect(() => {
    if (isOnSettings) setSettingsExpanded(true);
  }, [isOnSettings]);

  // Auto-expand when navigating into a child route
  useEffect(() => {
    for (const item of realtorNavItems) {
      if (item.children && item.href !== '/settings' && doesItemOwnPath(item, pathname, base)) {
        setExpandedKey(item.href);
        return;
      }
    }
  }, [pathname, base]);

  // AI-related items always sit at the top
  const aiItems = realtorNavItems.filter((item) => item.isAI);
  // Everything else except AI and settings
  const mainItems = realtorNavItems.filter(
    (item) => !item.isAI && item.href !== '/settings',
  );

  const getBadge = (item: NavItem): React.ReactNode => {
    if (item.badgeKey === 'leads' && unreadLeadCount > 0) {
      return (
        <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-medium tabular-nums flex-shrink-0 bg-secondary text-muted-foreground">
          {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
        </span>
      );
    }
    if (item.badgeKey === 'pendingDrafts' && pendingDraftCount > 0) {
      return (
        <span className="inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums flex-shrink-0 bg-primary text-primary-foreground">
          {pendingDraftCount > 99 ? '99+' : pendingDraftCount}
        </span>
      );
    }
    return undefined;
  };

  const renderItem = (item: NavItem) => {
    const hasChildren = !!(item.children && item.children.length > 0);
    return (
      <CollapsibleNavItem
        key={item.href}
        item={item}
        base={base}
        pathname={pathname}
        searchParams={searchParamsString}
        isExpanded={hasChildren ? expandedKey === item.href : false}
        onToggle={hasChildren ? () => setExpandedKey((p) => (p === item.href ? null : item.href)) : () => {}}
        badge={getBadge(item)}
      />
    );
  };

  return (
    <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-3">
      {/* Primary nav — daily destinations. AI item rides up top via the
          existing renderItem treatment; no section label needed when there
          are only a handful of primaries. */}
      <div>
        <div className="space-y-0.5">
          {aiItems.map(renderItem)}
          {mainItems.map(renderItem)}
        </div>
      </div>

      {/* More — visually subordinate, but reachable in one glance. Houses
          the routes that have existing users (Tours, Calendar, Notes,
          Reviews, Intake form, Analytics) until they surface inline through
          the agent in later phases. */}
      {realtorMoreNavItems.length > 0 && (
        <div>
          <SectionLabel>More</SectionLabel>
          <div className="space-y-0.5">{realtorMoreNavItems.map(renderItem)}</div>
        </div>
      )}

      {/* Settings — collapsible, pinned at bottom of scroll area */}
      <div className="pt-1">
        <CollapsibleNavItem
          item={settingsItem}
          base={base}
          pathname={pathname}
          searchParams={searchParamsString}
          isExpanded={settingsExpanded}
          onToggle={() => setSettingsExpanded((p) => !p)}
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

  const isOnBrokerPage = pathname.startsWith('/broker');
  const isOnBrokerSettings = pathname.startsWith('/broker/settings');

  // ── Broker settings sub-nav ──────────────────────────────────────────────
  if (isBroker && (isOnBrokerPage || isBrokerOnly) && isOnBrokerSettings) {
    return (
      <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
        <div className="px-5 pt-5 pb-4">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <div className="px-3 pb-1">
          <Link
            href="/broker"
            className="group flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={14} className="flex-shrink-0" />
            <span>Back to dashboard</span>
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
      <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
        <div className="px-5 pt-5 pb-4">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <WorkspaceSwitcher
          currentName={brokerageName ?? 'Brokerage'}
          currentSubtitle="Brokerage view"
          currentIcon={Building2}
          slug={slug}
          spaceName={spaceName}
          brokerageMemberships={brokerageMemberships}
          isOnBrokerPage={isOnBrokerPage}
        />

        <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
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

        <div className="mx-4 border-t border-border" />
        <UserFooter
          href={slug ? `${base}/profile` : '/broker/settings'}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </aside>
    );
  }

  // ── Realtor workspace sidebar ────────────────────────────────────────────
  return (
    <aside className="relative hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0 overflow-hidden">
      {/* Subtle gradient tint at the top — matches reference design */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-pink-100/50 via-purple-50/20 to-transparent dark:from-purple-900/10 dark:via-transparent" />

      <div className="relative z-10 flex flex-col h-full">
        {/* Logo row with panel toggle */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4">
          <BrandLogo className="h-7" alt="Chippi" />
          <button
            type="button"
            aria-label="Toggle sidebar"
            className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
          >
            <PanelLeft size={16} />
          </button>
        </div>

        {/* Workspace switcher */}
        <WorkspaceSwitcher
          currentName={spaceName}
          currentSubtitle="My workspace"
          currentIcon={Briefcase}
          slug={slug}
          spaceName={spaceName}
          brokerageMemberships={brokerageMemberships}
          isOnBrokerPage={isOnBrokerPage}
        />

        {/* 3-section nav: AI → Workspace → Settings */}
        <RealtorNav
          base={base}
          pathname={pathname}
          searchParamsString={searchParamsString}
          unreadLeadCount={unreadLeadCount}
          overdueFollowUpCount={overdueFollowUpCount}
          pendingDraftCount={pendingDraftCount}
        />

        {/* User footer */}
        <div className="mx-4 border-t border-border" />
        <UserFooter
          href={`${base}/settings/profile`}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </div>
    </aside>
  );
}
