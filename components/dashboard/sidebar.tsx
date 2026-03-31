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
  ChevronsUpDown,
  ArrowLeftRight,
  PhoneIncoming,
  BarChart3,
  Clock,
  Trophy,
  FileText,
  Megaphone,
  MessageCircle,
  DollarSign,
  ArrowLeft,
  Settings,
  User,
  Bell,
  Puzzle,
  Palette,
  Type,
  ListChecks,
  CreditCard,
  Key,
  Shuffle,
} from 'lucide-react';

interface SidebarProps {
  slug: string;
  spaceName: string;
  unreadLeadCount: number;
  overdueFollowUpCount?: number;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
  brokerageRole?: string | null;
}

const brokerNavSections = [
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
      { href: '/broker/response-times', label: 'Response', icon: Clock, exact: false, adminOnly: false },
      { href: '/broker/members', label: 'Members', icon: Users, exact: false, adminOnly: false },
      { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false, adminOnly: true, highlight: true },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/broker/analytics', label: 'Analytics', icon: BarChart3, exact: false, adminOnly: false },
      { href: '/broker/commissions', label: 'Commissions', icon: DollarSign, exact: false, adminOnly: false },
      { href: '/broker/templates', label: 'Templates', icon: FileText, exact: false, adminOnly: false },
      { href: '/broker/chat', label: 'Team Chat', icon: MessageCircle, exact: false, adminOnly: false },
      { href: '/broker/announcements', label: 'Announcements', icon: Megaphone, exact: false, adminOnly: false },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/broker/settings', label: 'Settings', icon: SlidersHorizontal, exact: false, adminOnly: true },
    ],
  },
];
// Flat list for backward compat
const brokerTeamNavItems = brokerNavSections.flatMap(s => s.items);

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
      { href: '/broker/commissions', label: 'Commission Rates', icon: DollarSign, exact: false },
    ],
  },
];

// ── Section label ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
      {children}
    </p>
  );
}

// ── Nav item with left accent bar ──────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  badge,
  isAI,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  badge?: React.ReactNode;
  isAI?: boolean;
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
      {/* Active indicator — 2px left bar */}
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
          isAI && !isActive && 'text-primary/50',
        )}
      />
      <span className={cn('flex-1 truncate', isAI && !isActive && 'text-foreground/80')}>
        {label}
      </span>
      {badge}
    </Link>
  );
}

// ── Workspace switcher ─────────────────────────────────────────────────────

function WorkspaceSwitcher({
  href,
  name,
  icon: Icon,
  subtitle,
}: {
  href: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  subtitle?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 mx-3 px-2.5 py-2 rounded-md border border-border/60 bg-muted/30 hover:bg-muted hover:border-border transition-all"
    >
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate text-foreground leading-tight">
          {name}
        </p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
        )}
      </div>
      <ChevronsUpDown
        size={13}
        className="text-muted-foreground/40 flex-shrink-0 group-hover:text-muted-foreground transition-colors"
      />
    </Link>
  );
}

// ── User footer ────────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════════════════════════════════════════

export function Sidebar({
  slug,
  spaceName,
  unreadLeadCount,
  overdueFollowUpCount = 0,
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

  const isOnBrokerSettings = pathname.startsWith('/broker/settings');

  // ── Broker settings sub-nav ──
  if (isBroker && (isOnBrokerPage || isBrokerOnly) && isOnBrokerSettings) {
    return (
      <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Back to dashboard */}
        <div className="px-3 pb-1">
          <Link
            href="/broker"
            className="group flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={14} className="flex-shrink-0" />
            <span>Back to dashboard</span>
          </Link>
        </div>

        {/* Settings sub-nav */}
        <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
          {brokerSettingsNavSections.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              {section.items.map((item) => {
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
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="mx-4 border-t border-border" />
        <UserFooter
          href={slug ? `${base}/profile` : '/broker/settings'}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </aside>
    );
  }

  // ── Broker sidebar ──
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return (
      <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Brokerage switcher */}
        <WorkspaceSwitcher
          href="/broker"
          name={brokerageName ?? 'Brokerage'}
          icon={Building2}
          subtitle="Brokerage Dashboard"
        />

        {/* Team nav — organized into sections */}
        <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
          {brokerNavSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.adminOnly || brokerageRole === 'broker_owner' || brokerageRole === 'broker_admin'
            );
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <SectionLabel>{section.label}</SectionLabel>
                {visibleItems.map((item) => {
                  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                  const highlightBadge = 'highlight' in item && item.highlight && !isActive ? (
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary shrink-0" />
                  ) : undefined;
                  return <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} isActive={isActive} badge={highlightBadge} />;
                })}
              </div>
            );
          })}
        </nav>

        {/* Switch to personal workspace */}
        {!isBrokerOnly && slug && (
          <>
            <div className="mx-4 border-t border-border" />
            <div className="px-3 py-1">
              <SectionLabel>Personal workspace</SectionLabel>
              <Link
                href={base}
                className="group relative flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Briefcase size={16} className="flex-shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
                <span className="flex-1 truncate">{spaceName}</span>
                <ChevronRight size={13} className="text-muted-foreground/40 flex-shrink-0" />
              </Link>
            </div>
          </>
        )}

        {/* User */}
        <div className="mx-4 border-t border-border" />
        <UserFooter
          href={slug ? `${base}/profile` : '/broker/settings'}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </aside>
    );
  }

  // ── Detect settings pages ──
  const isOnSettingsPage =
    pathname.startsWith(`${base}/settings`) ||
    pathname.startsWith(`${base}/profile`) ||
    pathname.startsWith(`${base}/configure`) ||
    pathname.startsWith(`${base}/billing`);

  const settingsNavSections = [
    {
      label: 'Settings',
      items: [
        { href: `${base}/settings`, label: 'General', icon: Settings, exact: true },
        { href: `${base}/settings/profile`, label: 'Profile', icon: User, exact: false },
        { href: `${base}/settings/notifications`, label: 'Notifications', icon: Bell, exact: false },
        { href: `${base}/settings/integrations`, label: 'Integrations', icon: Puzzle, exact: false },
      ],
    },
    {
      label: 'Intake Form',
      items: [
        { href: `${base}/settings/appearance`, label: 'Appearance', icon: Palette, exact: false },
        { href: `${base}/settings/content`, label: 'Content', icon: Type, exact: false },
        { href: `${base}/settings/form-fields`, label: 'Form Fields', icon: ListChecks, exact: false },
      ],
    },
    {
      label: 'Account',
      items: [
        { href: `${base}/billing`, label: 'Billing', icon: CreditCard, exact: false },
      ],
    },
  ];

  // ── Settings sidebar ──
  if (isOnSettingsPage) {
    return (
      <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Back to dashboard */}
        <div className="px-3 pb-1">
          <Link
            href={base}
            className="group flex items-center gap-2 h-9 px-2.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={14} className="flex-shrink-0" />
            <span>Back to dashboard</span>
          </Link>
        </div>

        {/* Settings nav */}
        <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
          {settingsNavSections.map((section) => (
            <div key={section.label}>
              <SectionLabel>{section.label}</SectionLabel>
              {section.items.map((item) => {
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
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="mx-4 mt-2 border-t border-border" />
        <UserFooter
          href={`${base}/settings/profile`}
          displayName={displayName}
          imageUrl={user?.imageUrl}
        />
      </aside>
    );
  }

  // ── Standard workspace sidebar ──
  return (
    <aside className="hidden md:flex flex-col w-[240px] h-full bg-sidebar border-r border-border shrink-0">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <BrandLogo className="h-7" alt="Chippi" />
      </div>

      {/* Workspace switcher */}
      <WorkspaceSwitcher
        href={`${base}/settings`}
        name={spaceName}
        icon={Briefcase}
        subtitle="Realtor Dashboard"
      />

      {/* Primary nav */}
      <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
        <SectionLabel>Workspace</SectionLabel>
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
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
              </span>
            );
          }
          if (item.href === '/follow-ups' && overdueFollowUpCount > 0) {
            badge = (
              <span
                className={cn(
                  'inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums flex-shrink-0',
                  isActive
                    ? 'bg-red-200/60 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    : 'bg-red-500 text-white dark:bg-red-600',
                )}
              >
                {overdueFollowUpCount > 99 ? '99+' : overdueFollowUpCount}
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
              isAI={item.label === 'Chip'}
            />
          );
        })}

        {/* Switch to brokerage dashboard */}
        {isBroker && (
          <>
            <SectionLabel>Brokerage</SectionLabel>
            <Link
              href="/broker"
              className="group relative flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Building2 size={16} className="flex-shrink-0 text-muted-foreground/60 group-hover:text-foreground" />
              <span className="flex-1 truncate">{brokerageName ?? 'Brokerage'}</span>
              <ChevronRight size={13} className="text-muted-foreground/40 flex-shrink-0" />
            </Link>
          </>
        )}
      </nav>

      {/* Join or create a brokerage */}
      {!isBroker && !brokerageName && (
        <div className="px-3 pb-1">
          <NavItem
            href="/brokerage"
            label="Join or create a team"
            icon={Building2}
            isActive={pathname.startsWith('/brokerage')}
          />
        </div>
      )}

      {/* Settings */}
      <div className="mx-4 border-t border-border" />
      <div className="px-3 space-y-0.5">
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
      <div className="mx-4 mt-2 border-t border-border" />
      <UserFooter
        href={`${base}/settings/profile`}
        displayName={displayName}
        imageUrl={user?.imageUrl}
      />
    </aside>
  );
}
