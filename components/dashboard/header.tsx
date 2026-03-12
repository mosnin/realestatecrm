'use client';

import { UserButton } from '@clerk/nextjs';
import { Menu, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { primaryNavItems, secondaryNavItems } from '@/lib/nav-items';

const allNavItems = [...primaryNavItems, ...secondaryNavItems];

interface HeaderProps {
  slug: string;
  spaceName: string;
  title: string;
}

export function Header({ slug, spaceName, title }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-40 shadow-[0_1px_0_0_var(--border)]">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden">
            <Menu size={20} className="text-muted-foreground" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
            <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                <BrandLogo className="h-5" alt="Chippi" />
                <span className="text-sm font-semibold">{spaceName}</span>
              </SheetTitle>
            </SheetHeader>
            <nav className="px-3 py-4 space-y-0.5">
              {allNavItems.map((item) => {
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
                      'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon size={16} className={cn('flex-shrink-0', !isActive && 'opacity-55')} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <span className="font-semibold text-sm md:hidden flex items-center gap-2">
          <BrandLogo className="h-5" alt="Chippi" />
        </span>

        {/* Desktop: page title breadcrumb */}
        <div className="hidden md:flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">{title}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
        <UserButton />
      </div>
    </header>
  );
}
