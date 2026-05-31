'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { mobileNavItems } from '@/lib/nav-items';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  UserCircle,
  Users,
  Briefcase,
  PhoneIncoming,
} from 'lucide-react';

const brokerMobileItems = [
  { href: '/broker', label: 'Team', icon: LayoutDashboard, exact: true },
  { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming, exact: false },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
];

interface MobileNavProps {
  slug: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
}

// ─── Geometry ─────────────────────────────────────────────────────────────────
//
// The bar uses semantic CSS-variable backgrounds (`bg-card`, `border-border`,
// `text-foreground`) so it follows the active theme automatically. In light
// mode it reads as a near-white pill with hairline border + dark icons;
// in dark mode it reads as charcoal with light icons. One component, two
// looks, no theme prop.

const BAR_HEIGHT = 64;

// ─── Side tab cell ────────────────────────────────────────────────────────────

function SideTab({
  href,
  label,
  icon: Icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="relative flex-1 flex items-center justify-center h-full min-h-[44px] focus-visible:outline-none"
    >
      <span
        className={cn(
          'inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-150',
          isActive
            ? 'bg-foreground/[0.08] text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
      </span>
    </Link>
  );
}

// ─── Center Chippi tab — flush inside the bar ─────────────────────────────────

function ChippiTab({ href, isActive }: { href: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      aria-label="Chippi"
      aria-current={isActive ? 'page' : undefined}
      className="relative flex-1 flex items-center justify-center h-full min-h-[44px] focus-visible:outline-none"
    >
      <span
        className={cn(
          'inline-flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150',
          isActive
            ? 'ring-2 ring-foreground/40 bg-foreground/[0.05]'
            : 'ring-1 ring-border hover:ring-foreground/30',
        )}
      >
        <img
          src="/chip-avatar.png"
          alt=""
          className="w-7 h-7 rounded-full object-cover"
        />
      </span>
    </Link>
  );
}

// ─── Bar shell — flat themed pill ─────────────────────────────────────────────

function BarShell({ children }: { children: React.ReactNode }) {
  return (
    <nav
      data-dashboard-mobile-nav
      className={cn(
        'md:hidden fixed left-3 right-3 z-50',
        'rounded-full flex items-stretch',
        'bg-card border border-border',
        'shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]',
      )}
      style={{
        height: BAR_HEIGHT,
        bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      aria-label="Primary"
    >
      {children}
    </nav>
  );
}

// ─── Broker variant ───────────────────────────────────────────────────────────

function BrokerMobileNav({ pathname, slug, isBrokerOnly }: { pathname: string; slug: string; isBrokerOnly: boolean }) {
  const base = `/s/${slug}`;
  return (
    <nav
      data-dashboard-mobile-nav
      className={cn(
        'md:hidden fixed left-3 right-3 z-50',
        'rounded-full flex items-stretch',
        'bg-card border border-border',
        'shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4)]',
      )}
      style={{
        height: BAR_HEIGHT,
        bottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      aria-label="Team"
    >
      {!isBrokerOnly && slug && (
        <Link
          href={base}
          aria-label="Workspace"
          className="flex-1 flex items-center justify-center min-h-[44px] text-muted-foreground hover:text-foreground"
        >
          <Briefcase size={22} strokeWidth={1.75} />
        </Link>
      )}
      {brokerMobileItems.map((item) => {
        const isActive = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className="relative flex-1 flex items-center justify-center min-h-[44px] focus-visible:outline-none"
          >
            <span
              className={cn(
                'inline-flex items-center justify-center w-10 h-10 rounded-full transition-colors duration-150',
                isActive ? 'bg-foreground/[0.08] text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <item.icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MobileNav({ slug, isBroker = false, isBrokerOnly = false }: MobileNavProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;

  // Chippi workspace owns its own bottom area (sticky composer). Hide the bar there.
  if (pathname?.startsWith(`${base}/chippi`)) return null;

  const isOnBrokerPage = pathname.startsWith('/broker');
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return <BrokerMobileNav pathname={pathname} slug={slug} isBrokerOnly={isBrokerOnly} />;
  }

  // Visual order: People · Deals · Chippi · Calendar · Settings.
  // Source of truth is `mobileNavItems` (Chippi · People · Deals · Calendar
  // · Settings) — we re-order by href lookup for display, the data stays
  // canonical for sidebar parity.
  const byHref = Object.fromEntries(
    mobileNavItems.map((item) => [item.href, item]),
  );
  const chippiItem = byHref['/chippi'];
  const sideOrder = ['/contacts', '/deals', '/calendar', '/settings'] as const;
  const sideItems = sideOrder.map((href) => byHref[href]).filter(Boolean);

  const isActive = (href: string) => pathname.startsWith(`${base}${href}`);

  return (
    <BarShell>
      {sideItems.slice(0, 2).map((item) => (
        <SideTab
          key={item.href}
          href={`${base}${item.href}`}
          label={item.label}
          icon={item.icon}
          isActive={isActive(item.href)}
        />
      ))}
      {chippiItem && (
        <ChippiTab
          href={`${base}${chippiItem.href}`}
          isActive={isActive(chippiItem.href)}
        />
      )}
      {sideItems.slice(2).map((item) => (
        <SideTab
          key={item.href}
          href={`${base}${item.href}`}
          label={item.label}
          icon={item.icon}
          isActive={isActive(item.href)}
        />
      ))}
    </BarShell>
  );
}
