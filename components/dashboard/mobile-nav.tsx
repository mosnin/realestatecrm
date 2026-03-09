'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
];

interface MobileNavProps {
  subdomain: string;
}

export function MobileNav({ subdomain }: MobileNavProps) {
  const pathname = usePathname();
  const base = `/s/${subdomain}`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex">
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
              'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors',
              isActive ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
