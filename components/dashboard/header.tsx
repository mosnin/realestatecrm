'use client';

import { UserButton } from '@clerk/nextjs';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Bot,
  User,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';

const navItems = [
  { href: '', label: 'Overview', icon: LayoutDashboard },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/ai', label: 'AI Assistant', icon: Bot },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings }
];

interface HeaderProps {
  subdomain: string;
  spaceName: string;
  spaceEmoji: string;
  title: string;
}

export function Header({ subdomain, spaceName, spaceEmoji, title }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${subdomain}`;

  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-4 md:px-6 bg-[#0a0a0a] sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden">
            <Menu size={20} className="text-neutral-400" />
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0 bg-[#0a0a0a] border-white/10">
            <SheetHeader className="px-5 py-5 border-b border-white/10">
              <SheetTitle className="flex items-center gap-3 text-white">
                <span className="text-2xl">{spaceEmoji}</span>
                <span className="text-sm font-semibold">{spaceName}</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="px-3 py-4 space-y-1">
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
                    onClick={() => setOpen(false)}
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
          </SheetContent>
        </Sheet>

        <span className="font-semibold text-sm md:hidden text-white">{spaceEmoji} {spaceName}</span>
        <h1 className="font-semibold text-sm hidden md:block text-white">{title}</h1>
      </div>

      <UserButton />
    </header>
  );
}
