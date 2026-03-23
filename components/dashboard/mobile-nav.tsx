'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { mobileNavItems } from '@/lib/nav-items';
import { LayoutDashboard, UserCircle, Users, Mail, Briefcase, Building2 } from 'lucide-react';

const brokerMobileItems = [
  { href: '/broker', label: 'Team', icon: LayoutDashboard, exact: true },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
  { href: '/broker/invitations', label: 'Invites', icon: Mail, exact: false },
];

interface MobileNavProps {
  slug: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
}

export function MobileNav({ slug, isBroker = false, isBrokerOnly = false }: MobileNavProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const isOnBrokerPage = pathname.startsWith('/broker');

  // When broker is on /broker/* pages (or broker-only), show team nav
  if (isBroker && (isOnBrokerPage || isBrokerOnly)) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex safe-area-bottom">
        {/* CRM workspace link (hidden for broker-only) */}
        {!isBrokerOnly && slug && (
          <Link
            href={base}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors text-muted-foreground"
          >
            <div className="w-9 h-6 rounded-md flex items-center justify-center transition-colors">
              <Briefcase size={18} />
            </div>
            <span>CRM</span>
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
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <div
                className={cn(
                  'w-9 h-6 rounded-md flex items-center justify-center transition-colors',
                  isActive ? 'bg-primary/10' : ''
                )}
              >
                <item.icon size={18} />
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // Standard workspace mobile nav
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex safe-area-bottom">
      {mobileNavItems.map((item) => {
        const href = `${base}${item.href}`;
        const isActive =
          item.href === '' ? pathname === base : pathname.startsWith(`${base}${item.href}`);
        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <div
              className={cn(
                'w-9 h-6 rounded-md flex items-center justify-center transition-colors',
                isActive ? 'bg-primary/10' : ''
              )}
            >
              <item.icon size={18} />
            </div>
            <span>{item.label}</span>
          </Link>
        );
      })}
      {/* Broker users get a quick link to brokerage */}
      {isBroker && (
        <Link
          href="/broker"
          className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors text-muted-foreground"
        >
          <div className="w-9 h-6 rounded-md flex items-center justify-center transition-colors">
            <Building2 size={18} />
          </div>
          <span>Team</span>
        </Link>
      )}
    </nav>
  );
}
