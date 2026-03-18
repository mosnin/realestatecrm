'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import {
  Visual1,
  AnimatedCard as AnimatedCard1,
  CardVisual as CardVisual1,
  CardBody as CardBody1,
  CardTitle as CardTitle1,
  CardDescription as CardDescription1,
} from '@/components/ui/animated-card-line';
import {
  Visual2,
  AnimatedCard as AnimatedCard2,
  CardVisual as CardVisual2,
  CardBody as CardBody2,
  CardTitle as CardTitle2,
  CardDescription as CardDescription2,
} from '@/components/ui/animated-card-diagram';
import {
  Visual3,
  AnimatedCard as AnimatedCard3,
  CardVisual as CardVisual3,
  CardBody as CardBody3,
  CardTitle as CardTitle3,
  CardDescription as CardDescription3,
} from '@/components/ui/animated-card-chart';

interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading: string;
  variant?: 'realtor' | 'broker';
}

export function AuthPageLayout({ children, heading, subheading }: AuthPageLayoutProps) {
  return (
    <main className="relative min-h-screen bg-background lg:flex lg:h-screen lg:overflow-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full flex-col bg-white px-6 py-8 sm:px-10 lg:w-[480px] lg:min-w-[480px] lg:py-10 lg:border-r lg:border-border">

        {/* Logo — top-left */}
        <div className="mb-auto">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Form — vertically centred */}
        <div className="mx-auto w-full max-w-[380px] py-12 lg:py-0">
          <div className="mb-8 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {heading}
            </h1>
            <p className="text-sm text-muted-foreground">{subheading}</p>
          </div>

          <div className="w-full">
            {children}
          </div>
        </div>

        {/* ToS / Privacy — bottom */}
        <p className="mt-auto pt-6 text-xs text-muted-foreground/70 leading-relaxed lg:text-left">
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

      {/* ── Right decorative panel — animated feature diagrams ── */}
      <div className="hidden lg:flex lg:flex-1 flex-col overflow-hidden bg-surface">

        {/* Top gradient bar */}
        <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-400" />

        <div className="flex flex-1 flex-col items-center justify-center px-10 py-10 gap-6 overflow-y-auto no-scrollbar">

          {/* Section label */}
          <div className="text-center mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Built for solo realtors
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Your leasing workflow, simplified.
            </h2>
          </div>

          {/* Feature diagram cards — 2-col grid */}
          <div className="w-full max-w-[560px] grid grid-cols-2 gap-4">

            {/* Intake pipeline — spans full width */}
            <div className="col-span-2">
              <AnimatedCard1 className="bg-card border-border">
                <CardVisual1>
                  <Visual1 mainColor="#d97706" secondaryColor="#b45309" />
                </CardVisual1>
                <CardBody1>
                  <CardTitle1 className="text-sm">Intake pipeline</CardTitle1>
                  <CardDescription1 className="text-xs">
                    Every renter inquiry captured and tracked in real time.
                  </CardDescription1>
                </CardBody1>
              </AnimatedCard1>
            </div>

            {/* AI scoring */}
            <AnimatedCard2 className="bg-card border-border">
              <CardVisual2>
                <Visual2 mainColor="#d97706" secondaryColor="#b45309" />
              </CardVisual2>
              <CardBody2>
                <CardTitle2 className="text-sm">AI lead scoring</CardTitle2>
                <CardDescription2 className="text-xs">
                  Instant priority ranking.
                </CardDescription2>
              </CardBody2>
            </AnimatedCard2>

            {/* Analytics */}
            <AnimatedCard3 className="bg-card border-border">
              <CardVisual3>
                <Visual3 mainColor="#d97706" secondaryColor="#b45309" />
              </CardVisual3>
              <CardBody3>
                <CardTitle3 className="text-sm">Analytics</CardTitle3>
                <CardDescription3 className="text-xs">
                  Conversion trends at a glance.
                </CardDescription3>
              </CardBody3>
            </AnimatedCard3>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
            {[
              'One intake link',
              'Structured capture',
              'Contact CRM',
              'Deal pipeline',
              'Follow-up scheduling',
            ].map((feature) => (
              <span
                key={feature}
                className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
