'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LeadsGlobe } from '@/components/ui/leads-globe';

// ═════════════════════════════════════════════════════════════════════════════

export interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading: string;
  variant?: 'realtor' | 'broker';
}

export function AuthPageLayout({ children, heading, subheading, variant }: AuthPageLayoutProps) {
  const pathname = usePathname();

  const isBrokerLogin = pathname.startsWith('/login/broker');
  const isRealtorLogin = pathname.startsWith('/login/realtor');
  const isLoginPage = isBrokerLogin || isRealtorLogin;
  const showRoleSwitcher = isLoginPage;

  return (
    <main className="relative min-h-screen bg-background lg:flex lg:h-screen lg:overflow-y-auto lg:overflow-x-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full min-h-screen flex-col bg-card px-6 py-6 sm:px-10 sm:py-8 lg:min-h-0 lg:w-[480px] lg:min-w-[480px] lg:overflow-y-auto lg:py-10">

        {/* Logo */}
        <div className="shrink-0">
          <BrandLogo className="h-6 sm:h-7" alt="Chippi" />
        </div>

        {/* Form area */}
        <div className="flex flex-1 flex-col justify-center py-6 sm:py-8 lg:py-0">
          <div className="mx-auto w-full max-w-[380px]">

            {/* Role switcher — fully rounded */}
            {showRoleSwitcher && (
              <div role="tablist" aria-label="Account type" className="mb-6 flex rounded-full border border-border bg-muted/50 p-1">
                <Link
                  href="/login/realtor"
                  role="tab"
                  aria-selected={isRealtorLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isRealtorLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <User size={16} className="shrink-0 sm:size-[14px]" />
                  Realtor
                </Link>
                <Link
                  href="/login/broker"
                  role="tab"
                  aria-selected={isBrokerLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isBrokerLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Building2 size={16} className="shrink-0 sm:size-[14px]" />
                  Broker
                </Link>
              </div>
            )}

            {/* Heading — "Welcome back" on login pages */}
            {heading && (
              <div className="mb-6 space-y-1.5">
                {isLoginPage && (
                  <p className="text-sm font-medium text-primary mb-1">Welcome back</p>
                )}
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {heading}
                </h1>
                {subheading && (
                  <p className="text-sm text-muted-foreground">{subheading}</p>
                )}
              </div>
            )}

            <div className="w-full">
              {children}
            </div>
          </div>
        </div>

        {/* ToS / Privacy */}
        <p className="shrink-0 pt-4 text-center text-xs text-muted-foreground/70 leading-relaxed sm:text-left">
          By continuing, you agree to our{' '}
          <Link href="/legal/terms" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      {/* ── Right decorative panel ── */}
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-orange-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        {/* Catchy heading */}
        <div className="relative z-10 text-center px-8 -mt-8">
          <p className="text-sm font-medium uppercase tracking-widest text-primary mb-3">
            Your leads, everywhere
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground leading-tight">
            Every lead. Scored.<br />
            <span className="text-primary">Ready to close.</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
            AI-powered scoring, instant notifications, and a pipeline built for how realtors actually work.
          </p>
        </div>

        {/* Globe */}
        <div className="relative z-10 w-full max-w-[480px] mt-2">
          <LeadsGlobe />
        </div>
      </div>
    </main>
  );
}
