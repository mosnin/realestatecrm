'use client';

import { UserButton } from '@clerk/nextjs';
import { Sun, Moon } from 'lucide-react';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
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
import { Building2, LayoutDashboard, UserCircle, Users, Mail, ArrowLeftRight, Briefcase, ChevronRight, ArrowLeft, User, Bell, Plug, Palette, FileText, ListChecks, CreditCard, Shield, Settings, CheckIcon } from 'lucide-react';
import { GlobalSearch } from './global-search';
import { NotificationCenter } from './notification-center';
import { NotificationBell } from '@/components/broker/notification-bell';
import { BrokerHelpGuide } from '@/components/broker/help-guide';

const brokerMobileNavItems = [
  { href: '/broker', label: 'Team Overview', icon: LayoutDashboard, exact: true },
  { href: '/broker/realtors', label: 'Realtors', icon: UserCircle, exact: false },
  { href: '/broker/members', label: 'Members', icon: Users, exact: false },
  { href: '/broker/invitations', label: 'Invitations', icon: Mail, exact: false },
];

interface HeaderProps {
  slug: string;
  spaceName: string;
  title: string;
  isBroker?: boolean;
  isBrokerOnly?: boolean;
  brokerageName?: string | null;
}

export function Header({ slug, spaceName, title, isBroker = false, isBrokerOnly = false, brokerageName = null }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const base = `/s/${slug}`;
  const { theme, toggleTheme } = useTheme();
  const isOnBrokerPage = pathname.startsWith('/broker');
  const showBrokerMobileNavOnly = isBroker && isOnBrokerPage;

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card sticky top-0 z-40 shadow-[0_1px_0_0_var(--border)]">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="md:hidden">
            <MenuToggleIcon open={open} className="size-5 text-muted-foreground" duration={400} />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border flex flex-col overflow-hidden">
            <SheetHeader className="px-4 py-5 border-b border-sidebar-border">
              <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
                <BrandLogo className="h-5" alt="Chippi" />
              </SheetTitle>
              {/* Context indicator */}
              <div className="mt-2">
                {isBroker && !isBrokerOnly ? (
                  <div className="flex items-center gap-2 text-xs">
                    <Link
                      href={base}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors font-medium',
                        !pathname.startsWith('/broker')
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'text-muted-foreground border-border hover:bg-muted'
                      )}
                    >
                      <Briefcase size={12} />
                      {spaceName}
                    </Link>
                    <Link
                      href="/broker"
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border transition-colors font-medium',
                        pathname.startsWith('/broker')
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'text-muted-foreground border-border hover:bg-muted'
                      )}
                    >
                      <Building2 size={12} />
                      {brokerageName ?? 'Brokerage'}
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground font-medium">{spaceName}</p>
                )}
              </div>
            </SheetHeader>
            <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-2 space-y-0.5">
              {!isBrokerOnly && !showBrokerMobileNavOnly && (
                <>
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Workspace
                  </p>
                  {primaryNavItems.map((item) => {
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
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
              {isBroker && showBrokerMobileNavOnly && (
                <>
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Team
                  </p>
                  {brokerMobileNavItems.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>
            {isBroker && !showBrokerMobileNavOnly && (
              <div className="px-3 pb-2 space-y-0.5 border-t border-sidebar-border pt-3">
                <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                  Team
                </p>
                {brokerMobileNavItems.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
            <div className="px-3 pb-4 space-y-0.5 border-t border-sidebar-border pt-3">
              {!showBrokerMobileNavOnly && ((pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/billing`)) ? (
                <>
                  <Link
                    href={base}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                  >
                    <ArrowLeft size={14} /> Back to dashboard
                  </Link>
                  {[
                    { label: 'Settings', items: [
                      { href: `${base}/settings`, label: 'General', icon: Settings },
                      { href: `${base}/settings/profile`, label: 'Profile', icon: User },
                      { href: `${base}/settings/notifications`, label: 'Notifications', icon: Bell },
                      { href: `${base}/settings/integrations`, label: 'Integrations', icon: Plug },
                      { href: `${base}/settings/legal`, label: 'Legal', icon: Shield },
                    ]},
                    { label: 'Intake Form', items: [
                      { href: `${base}/settings/appearance`, label: 'Appearance', icon: Palette },
                      { href: `${base}/settings/content`, label: 'Content', icon: FileText },
                      { href: `${base}/settings/form-fields`, label: 'Form Fields', icon: ListChecks },
                    ]},
                    { label: 'Account', items: [
                      { href: `${base}/billing`, label: 'Billing', icon: CreditCard },
                    ]},
                  ].map((section) => (
                    <div key={section.label}>
                      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{section.label}</p>
                      {section.items.map((item) => {
                        const isActive = item.href === `${base}/settings` ? pathname === item.href : pathname.startsWith(item.href);
                        return (
                          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                            className={cn('group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                              isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                            )}>
                            <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    Account
                  </p>
                  {secondaryNavItems.map((item) => {
                    const href = `${base}${item.href}`;
                    const isActive = pathname.startsWith(href);
                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'opacity-100' : 'opacity-55 group-hover:opacity-80')} />
                        {item.label}
                      </Link>
                    );
                  })}
                </>
              ))}
              <div className="flex items-center gap-2 px-3 pt-3">
                <BrandLogo className="h-4" alt="Chippi" />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <span className="font-semibold text-sm md:hidden flex items-center gap-2">
          <BrandLogo className="h-5" alt="Chippi" />
        </span>

        {/* Desktop: breadcrumb */}
        <div className="hidden md:flex items-center gap-1.5 text-sm">
          {(pathname.startsWith('/broker') || isBrokerOnly) && brokerageName ? (
            <>
              <span className="text-muted-foreground">{brokerageName}</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="font-medium text-foreground">
                {pathname === '/broker' ? 'Overview' :
                 pathname.startsWith('/broker/realtors') ? 'Realtors' :
                 pathname.startsWith('/broker/members') ? 'Members' :
                 pathname.startsWith('/broker/invitations') ? 'Invitations' :
                 pathname.startsWith('/broker/settings') ? 'Settings' : 'Team'}
              </span>
              {/* Quick switch to workspace */}
              {!isBrokerOnly && slug && (
                <Link
                  href={base}
                  className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors"
                  title={`Switch to ${spaceName}`}
                >
                  <ArrowLeftRight size={11} />
                  {spaceName}
                </Link>
              )}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">{title}</span>
              {(() => {
                const allItems = [...primaryNavItems, ...secondaryNavItems];
                const match = allItems
                  .filter((item) => item.href !== '')
                  .find((item) => pathname.startsWith(`${base}${item.href}`));
                return match ? (
                  <>
                    <span className="text-muted-foreground/40">/</span>
                    <span className="font-medium text-foreground">{match.label}</span>
                  </>
                ) : (
                  <><span className="text-muted-foreground/40">/</span><span className="font-medium text-foreground">Overview</span></>
                );
              })()}
              {/* Quick switch to brokerage */}
              {isBroker && brokerageName && (
                <Link
                  href="/broker"
                  className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md border border-border hover:bg-muted transition-colors"
                  title={`Switch to ${brokerageName}`}
                >
                  <ArrowLeftRight size={11} />
                  {brokerageName}
                </Link>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {slug && <GlobalSearch slug={slug} />}
        {slug && <NotificationCenter slug={slug} />}
        {isBroker && <BrokerHelpGuide />}
        {isBrokerOnly && !slug && <NotificationBell />}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
        <div className="relative">
          <div className="[&_.cl-userButtonTrigger]:ring-2 [&_.cl-userButtonTrigger]:ring-blue-500 [&_.cl-userButtonTrigger]:ring-offset-2 [&_.cl-userButtonTrigger]:ring-offset-background [&_.cl-userButtonTrigger]:rounded-full">
            <UserButton />
          </div>
          <span className="absolute -right-0.5 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-blue-500 ring-2 ring-background">
            <CheckIcon className="size-2 text-white" />
          </span>
        </div>
      </div>
    </header>
  );
}
