'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  PhoneIncoming,
  Bot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '', label: 'Home', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/ai', label: 'AI', icon: Bot },
];

interface MobileNavProps {
  slug: string;
}

export function MobileNav({ slug }: MobileNavProps) {
  const pathname = usePathname();
  const base = `/s/${slug}`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex safe-area-bottom">
      {navItems.map((item) => {
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
                'w-9 h-6 rounded-full flex items-center justify-center transition-colors',
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
