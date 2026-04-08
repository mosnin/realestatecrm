'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';
import { realtorNavItems } from '@/lib/nav-items';
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
  CreditCard,
  Plus,
  Check,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SidebarProps {
  slug: string;
  spaceName: string;
  unreadLeadCount: number;
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

const brokerAdminNavSections = [
  {
    label: 'Overview',
    items: [
      { href: '/broker', label: 'Dashboard', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false, adminOnly: false },
      { href: '/broker/pipeline', label: 'Pipeline', icon: BarChart3, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false, adminOnly: false },
      { href: '/broker/leaderboard', label: 'Leaderboard', icon: Trophy, exact: false, adminOnly: false },
      { href: '/broker/members', label: 'Members', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false, adminOnly: true, highlight: true },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/broker/analytics', label: 'Analytics', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team Chat', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'Intake Form',
    items: [
      { href: '/broker/settings/form-builder', label: 'Customize', icon: FileText, exact: false, adminOnly: true },
      { href: '/broker/settings/tracking', label: 'Tracking', icon: BarChart3, exact: false, adminOnly: true },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/broker/import-export', label: 'Import / Export', icon: Upload, exact: false, adminOnly: true },
      { href: '/broker/settings', label: 'Settings', icon: SlidersHorizontal, exact: false, adminOnly: true },
    ],
  },
];

const brokerMemberNavSections = [
  {
    label: 'My Work',
    items: [
      { href: '/broker', label: 'My Dashboard', icon: LayoutDashboard, exact: true, adminOnly: false },
      { href: '/broker/my-leads', label: 'My Leads', icon: PhoneIncoming, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'Team',
    items: [
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team Chat', icon: MessageCircle, exact: false, adminOnly: false },
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
    const hasFilterParams = currentParams.has('type') || currentParams.has('tier');
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

function ShopifyNavItem({
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
          'group relative flex items-center gap-2.5 min-h-[44px] h-11 px-2.5 rounded-lg text-sm transition-colors',
          isParentActive
            ? 'bg-primary/10 text-foreground font-semibold'
            : 'text-muted-foreground font-medium hover:bg-muted hover:text-foreground',
        )}
      >
        {/* Active indicator bar */}
        {isParentActive && (
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
        )}

        {item.isAI ? (
          <img
            src="/chip-avatar.png"
            alt="Chip"
            className="w-[18px] h-[18px] rounded-full flex-shrink-0"
          />
        ) : (
          <Icon
            size={18}
            className={cn(
              'flex-shrink-0 transition-colors',
              isParentActive
                ? 'text-primary'
                : 'text-muted-foreground/60 group-hover:text-foreground',
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
                      ? 'text-primary font-medium bg-primary/5'
                      : 'text-muted-foreground font-normal hover:text-foreground hover:bg-muted/50',
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
  return (
    <p className="px-2 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
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
        'group relative flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary" />
      )}
      <Icon
        size={16}
        className={cn(
          'flex-shrink-0 transition-colors',
          isActive
            ? 'text-primary'
            : 'text-muted-foreground/60 group-hover:text-foreground',
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
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border/60 bg-muted/30 hover:bg-muted hover:border-border transition-all text-left"
      >
        <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon size={14} className="text-primary" />
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
                'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted transition-colors',
                !isOnBrokerPage && 'bg-primary/5',
              )}
            >
              <Briefcase size={14} className="text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{spaceName}</p>
                <p className="text-[10px] text-muted-foreground">Realtor Dashboard</p>
              </div>
              {!isOnBrokerPage && (
                <Check size={14} className="text-primary flex-shrink-0" />
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
                    'flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted transition-colors',
                    isOnBrokerPage && 'bg-primary/5',
                  )}
                >
                  <Building2 size={14} className="text-primary flex-shrink-0" />
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
                    <Check size={14} className="text-primary flex-shrink-0" />
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
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
        className="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={displayName}
            className="w-7 h-7 rounded-full flex-shrink-0 object-cover ring-1 ring-border"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
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
// Shopify-style realtor nav — accordion (one section expanded at a time)
// ═══════════════════════════════════════════════════════════════════════════════

function RealtorShopifyNav({
  base,
  pathname,
  unreadLeadCount,
  overdueFollowUpCount,
}: {
  base: string;
  pathname: string;
  unreadLeadCount: number;
  overdueFollowUpCount: number;
}) {
  // Determine which section should be initially expanded based on current route
  const initialExpanded = useMemo(() => {
    for (const item of realtorNavItems) {
      if (item.children && doesItemOwnPath(item, pathname, base)) {
        return item.href;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only compute on mount

  const [expandedKey, setExpandedKey] = useState<string | null>(initialExpanded);

  // Auto-expand when navigating to a child route
  useEffect(() => {
    for (const item of realtorNavItems) {
      if (item.children && doesItemOwnPath(item, pathname, base)) {
        setExpandedKey(item.href);
        return;
      }
    }
  }, [pathname, base]);

  const handleToggle = useCallback((key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  return (
    <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
      {realtorNavItems.map((item) => {
        let badge: React.ReactNode = undefined;
        const isParentActive = doesItemOwnPath(item, pathname, base);

        if (item.badgeKey === 'leads' && unreadLeadCount > 0) {
          badge = (
            <span
              className={cn(
                'inline-flex min-w-[20px] h-5 px-1.5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums flex-shrink-0',
                isParentActive
                  ? 'bg-primary/20 text-primary'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
            </span>
          );
        }

        return (
          <ShopifyNavItem
            key={item.href}
            item={item}
            base={base}
            pathname={pathname}
            searchParams={searchParamsString}
            isExpanded={expandedKey === item.href}
            onToggle={() => handleToggle(item.href)}
            badge={badge}
          />
        );
      })}
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
  overdueFollowUpCount = 0,
  isBroker = false,
  isBrokerOnly = false,
  brokerageName = null,
  brokerageRole = null,
  brokerageMemberships = [],
}: SidebarProps) {
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();
  const searchParamsString = currentSearchParams?.toString() ?? '';
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
            className="group flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
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
          currentSubtitle="Brokerage Dashboard"
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
                      <span className="inline-flex h-2 w-2 rounded-full bg-primary shrink-0" />
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

  // ── Realtor workspace sidebar (Shopify-style) ────────────────────────────
  return (
    <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <BrandLogo className="h-7" alt="Chippi" />
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher
        currentName={spaceName}
        currentSubtitle="Realtor Dashboard"
        currentIcon={Briefcase}
        slug={slug}
        spaceName={spaceName}
        brokerageMemberships={brokerageMemberships}
        isOnBrokerPage={isOnBrokerPage}
      />

      {/* Shopify-style nav — all items with inline collapsible children */}
      <RealtorShopifyNav
        base={base}
        pathname={pathname}
        unreadLeadCount={unreadLeadCount}
        overdueFollowUpCount={overdueFollowUpCount}
      />

      {/* User footer */}
      <div className="mx-4 border-t border-border" />
      <UserFooter
        href={`${base}/settings/profile`}
        displayName={displayName}
        imageUrl={user?.imageUrl}
      />
    </aside>
  );
}
