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

// ─── Charcoal palette ─────────────────────────────────────────────────────────
const BAR_FILL = '#1a1a1c';
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
            ? 'bg-white/[0.08] text-white'
            : 'text-white/70 hover:text-white',
        )}
      >
        <Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
      </span>
    </Link>
  );
}

// ─── Center Chippi tab — flush inside the bar ─────────────────────────────────
//
// Sits flat in the bar like the other four icons. The chip avatar + subtle
// ring carries the focal weight; the raised notch design is gone.

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
            ? 'ring-2 ring-white/40 bg-white/[0.05]'
            : 'ring-1 ring-white/15 hover:ring-white/30',
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

// ─── Bar shell — flat charcoal pill, no notch ─────────────────────────────────

function BarShell({ children }: { children: React.ReactNode }) {
  return (
    <nav
      data-dashboard-mobile-nav
      className="md:hidden fixed left-3 right-3 z-50"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      aria-label="Primary"
    >
      <div
        className="rounded-full ring-1 ring-white/[0.06] flex items-stretch"
        style={{
          height: BAR_HEIGHT,
          backgroundColor: BAR_FILL,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        {children}
      </div>
    </nav>
  );
}

// ─── Broker variant ───────────────────────────────────────────────────────────

function BrokerMobileNav({ pathname, slug, isBrokerOnly }: { pathname: string; slug: string; isBrokerOnly: boolean }) {
  const base = `/s/${slug}`;
  return (
    <nav
      data-dashboard-mobile-nav
      className="md:hidden fixed left-3 right-3 z-50"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      aria-label="Brokerage"
    >
      <div
        className="rounded-full ring-1 ring-white/[0.06] flex items-stretch"
        style={{
          height: BAR_HEIGHT,
          backgroundColor: BAR_FILL,
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        {!isBrokerOnly && slug && (
          <Link
            href={base}
            aria-label="Workspace"
            className="flex-1 flex items-center justify-center min-h-[44px] text-white/70 hover:text-white"
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
                  isActive ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:text-white',
                )}
              >
                <item.icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />
              </span>
            </Link>
          );
        })}
      </div>
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
