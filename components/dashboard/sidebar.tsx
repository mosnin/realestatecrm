'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Bot,
  User,
  Settings,
  Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/ai', label: 'AI Assistant', icon: Bot },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings }
];

interface SidebarProps {
  subdomain: string;
  spaceName: string;
  spaceEmoji: string;
}

export function Sidebar({ subdomain, spaceName, spaceEmoji }: SidebarProps) {
  const pathname = usePathname();
  const base = `/s/${subdomain}`;

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-[#0a0a0a] border-r border-white/10">
      {/* Logo / Space name */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <span className="text-2xl">{spaceEmoji}</span>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate text-white">
            {spaceName}
          </p>
          <p className="text-xs text-neutral-500 truncate">{subdomain}</p>
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
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-white'
              )}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-neutral-600">
          <Building2 size={14} />
          <span>WorkflowRouting</span>
        </div>
      </div>
    </aside>
  );
}
