'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading: string;
  variant?: 'realtor' | 'broker';
}

export function AuthPageLayout({ children, heading, subheading, variant }: AuthPageLayoutProps) {
  const pathname = usePathname();

  // Determine which auth flow we're in for the role switcher
  const isSignUp = pathname.startsWith('/sign-up');
  const isBrokerLogin = pathname.startsWith('/login/broker');
  const isRealtorLogin = pathname.startsWith('/login/realtor');
  const isMainSignIn = pathname.startsWith('/sign-in');
  const showRoleSwitcher = isBrokerLogin || isRealtorLogin || isMainSignIn;

  return (
    <main className="relative min-h-screen bg-background lg:flex lg:h-screen lg:overflow-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full flex-col bg-card px-6 py-6 sm:px-10 sm:py-8 lg:w-[480px] lg:min-w-[480px] lg:py-10">

        {/* Logo — top-left */}
        <div className="shrink-0">
          <BrandLogo className="h-6 sm:h-7" alt="Chippi" />
        </div>

        {/* Form area — vertically centred */}
        <div className="flex flex-1 flex-col justify-center py-6 sm:py-8 lg:py-0">
          <div className="mx-auto w-full max-w-[380px]">

            {/* Role switcher — visible on login pages */}
            {showRoleSwitcher && (
              <div className="mb-6 flex rounded-lg border border-border bg-muted/50 p-1">
                <Link
                  href="/sign-in"
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                    (isMainSignIn || isRealtorLogin)
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <User size={14} />
                  Realtor
                </Link>
                <Link
                  href="/login/broker"
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                    isBrokerLogin
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Building2 size={14} />
                  Broker
                </Link>
              </div>
            )}

            {heading && (
              <div className="mb-6 space-y-1.5">
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

        {/* ToS / Privacy — bottom */}
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
      <div className="hidden lg:relative lg:block lg:flex-1 overflow-hidden">
        {/* Background image */}
        <img
          aria-hidden
          src="https://images.pexels.com/photos/18541706/pexels-photo-18541706.jpeg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Centred logo watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <BrandLogo className="h-12 opacity-90 brightness-0 invert drop-shadow-lg" alt="" />
        </div>
      </div>
    </main>
  );
}
