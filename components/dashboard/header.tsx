'use client';

import { UserButton } from '@clerk/nextjs';
import { Menu, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  PhoneIncoming,
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
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { BrandLogo } from '@/components/brand-logo';

const navItems = [
  { href: '', label: 'Overview', icon: LayoutDashboard },
  { href: '/contacts', label: 'Clients', icon: Users },
  { href: '/leads', label: 'Leads', icon: PhoneIncoming },
  { href: '/deals', label: 'Deals', icon: Briefcase },
  { href: '/ai', label: 'AI Assistant', icon: Bot },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings }
];

interface HeaderProps {
  subdomain: string;
  spaceName: string;
  title: string;
}

export function Header({ subdomain, spaceName, title }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${subdomain}`;
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden">
            <Menu size={20} className="text-muted-foreground" />
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0 bg-sidebar border-sidebar-border">
            <SheetHeader className="px-5 py-5 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-3 text-sidebar-foreground">
                <BrandLogo className="h-6" alt="Chippi" />
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
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
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

        <span className="font-semibold text-sm md:hidden flex items-center gap-2">
          <BrandLogo className="h-5" alt="Chippi" />
          {spaceName}
        </span>
        <h1 className="font-semibold text-sm hidden md:block">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </Button>
        <UserButton />
      </div>
    </header>
  );
}
