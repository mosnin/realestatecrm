'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  PhoneIncoming,
  Bot,
  User,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';

const navItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/ai', label: 'AI Assistant', icon: Bot },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings }
];

interface SidebarProps {
  subdomain: string;
  spaceName: string;
  spaceEmoji: string;
  unreadLeadCount: number;
}

export function Sidebar({
  subdomain,
  spaceName,
  spaceEmoji,
  unreadLeadCount
}: SidebarProps) {
  const pathname = usePathname();
  const base = `/s/${subdomain}`;

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-sidebar border-r border-sidebar-border">
      {/* Logo / Space name */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <span className="text-2xl">{spaceEmoji}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate text-sidebar-foreground">
            {spaceName}
          </p>
          <p className="text-xs text-muted-foreground truncate">{subdomain}</p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const href = `${base}${item.href}`;
          const isActive =
            item.href === ''
              ? pathname === base
              : pathname.startsWith(`${base}${item.href}`);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <item.icon size={18} />
              <span className="flex items-center gap-2">
                {item.label}
                {item.href === '/leads' && unreadLeadCount > 0 ? (
                  <span className="inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                    {unreadLeadCount > 99 ? '99+' : unreadLeadCount}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <BrandLogo className="h-4" alt="Chippi" />
        </div>
      </div>
    </aside>
  );
}
