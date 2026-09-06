'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { mobileNavItems } from '@/lib/nav-items';
import {
  Sun,
  Users,
  Briefcase,
  PhoneIncoming,
  MessageCircle,
} from 'lucide-react';

const brokerItems = [
  { href: '/broker/brief', label: 'Today', icon: Sun },
  { href: '/broker/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/broker/realtors', label: 'Team', icon: Users },
  { href: '/broker/deals', label: 'Deals', icon: Briefcase },
  { href: '/broker/chippi', label: 'Chippi', icon: MessageCircle },
];

export function MobileNav({
  slug,
  isBroker = false,
  isBrokerOnly = false,
}: {
  slug: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
}) {
  const pathname = usePathname();
  const base = `/s/${slug}`;
  // Only the chat root owns its bottom composer. Today and all other child
  // pages retain navigation, so returning to the daily workspace is one tap.
  if (pathname === `${base}/chippi` || pathname === '/broker/chippi')
    return null;
  const broker = isBroker && (pathname.startsWith('/broker') || isBrokerOnly);
  const items = broker
    ? brokerItems
    : mobileNavItems.map((item) => ({ ...item, href: `${base}${item.href}` }));
  return (
    <nav
      aria-label="Primary"
      data-dashboard-mobile-nav
      className="fixed inset-x-0 bottom-0 z-50 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href ||
          (href !== `${base}/chippi/brief` && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
              active ? 'text-brand' : 'text-muted-foreground',
            )}
          >
            <Icon size={20} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
