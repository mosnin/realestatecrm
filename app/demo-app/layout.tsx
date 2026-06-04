'use client';

/**
 * /demo-app — backend-free walkthrough of the Chippi dashboard.
 *
 * This layout is the shell chrome (sidebar + header). Each surface under it
 * (/demo-app/chippi, /people, /deals, /inbox, /calendar) is a CLONE of the
 * real dashboard page with the auth/Supabase data layer replaced by hardcoded
 * dummy data, so the UI is pixel-identical to the product but never touches a
 * backend. Public route (not matched by isProtectedRoute in middleware).
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageCircle,
  Users,
  KanbanSquare,
  Mail,
  CalendarDays,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandLogo } from '@/components/brand-logo';

const NAV = [
  { href: '/demo-app/chippi', label: 'Chippi', icon: MessageCircle },
  { href: '/demo-app/people', label: 'People', icon: Users },
  { href: '/demo-app/deals', label: 'Deals', icon: KanbanSquare },
  { href: '/demo-app/inbox', label: 'Inbox', icon: Mail },
  { href: '/demo-app/calendar', label: 'Calendar', icon: CalendarDays },
];

export default function DemoAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-border/70 bg-sidebar md:flex">
        <div className="flex h-14 items-center px-4">
          <BrandLogo className="h-5" alt="Chippi" />
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'relative flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-foreground/[0.04] font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-foreground" />
                )}
                <Icon size={16} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2.5 border-t border-border/60 px-4 py-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/[0.06] text-[12px] font-medium text-foreground">
            JR
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-foreground">Jordan Rivera</p>
            <p className="truncate text-[11px] text-muted-foreground">Rivera Residential</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center border-b border-border/70 px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <BrandLogo className="h-5" alt="Chippi" />
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.04] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Demo
          </span>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
