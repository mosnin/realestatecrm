'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Globe } from '@/components/ui/cobe-globe';

const leadMarkers = [
  { id: "hot-lead", location: [40.7, -74.0] as [number, number], label: "Hot Lead" },
  { id: "new-renter", location: [51.5, -0.13] as [number, number], label: "New Renter" },
  { id: "pre-approved", location: [35.68, 139.65] as [number, number], label: "Pre-approved" },
  { id: "tour-booked", location: [-33.87, 151.21] as [number, number], label: "Tour Booked" },
  { id: "buyer-lead", location: [-23.55, -46.63] as [number, number], label: "Buyer Lead" },
  { id: "warm-lead", location: [25.2, 55.27] as [number, number], label: "Warm Lead" },
];

const leadArcs = [
  { id: "nyc-london", from: [40.7, -74.0] as [number, number], to: [51.5, -0.13] as [number, number] },
  { id: "london-tokyo", from: [51.5, -0.13] as [number, number], to: [35.68, 139.65] as [number, number] },
  { id: "nyc-saopaulo", from: [40.7, -74.0] as [number, number], to: [-23.55, -46.63] as [number, number] },
];

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
      <div className="hidden lg:relative lg:flex lg:flex-1 lg:flex-col lg:items-center lg:justify-center overflow-hidden">
        {/* Grid + subtle orange glow background */}
        <div className="absolute inset-0 h-full w-full bg-white bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:6rem_4rem]">
          <div className="absolute bottom-0 left-0 right-0 top-0 bg-[radial-gradient(circle_500px_at_50%_200px,#ffe8d6,transparent)]" />
        </div>

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

        {/* Globe — exact cobe-globe component, orange markers */}
        <div className="relative z-10 w-full max-w-[480px] mt-2">
          <Globe
            markers={leadMarkers}
            arcs={leadArcs}
            markerColor={[1, 0.59, 0.31]}
            baseColor={[1, 1, 1]}
            arcColor={[1, 0.59, 0.31]}
            glowColor={[0.94, 0.93, 0.91]}
            dark={0}
            mapBrightness={10}
            markerSize={0.025}
            markerElevation={0.01}
          />
        </div>
      </div>
    </main>
  );
}
