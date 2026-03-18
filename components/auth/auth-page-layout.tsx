'use client';

import React from 'react';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';

interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading: string;
  variant?: 'realtor' | 'broker';
}

export function AuthPageLayout({ children, heading, subheading }: AuthPageLayoutProps) {
  return (
    <main className="relative min-h-screen bg-muted/30 lg:flex lg:h-screen lg:overflow-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full flex-col bg-white px-6 py-8 sm:px-10 lg:w-1/2 lg:max-w-[640px] lg:py-10">

        {/* Logo — top-left */}
        <div className="mb-auto">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Form — vertically centred */}
        <div className="mx-auto w-full max-w-[400px] py-12 lg:py-0">
          {/* Heading */}
          <div className="mb-8 space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {heading}
            </h1>
            <p className="text-sm text-muted-foreground">{subheading}</p>
          </div>

          {/* Clerk widget slot */}
          <div className="w-full">
            {children}
          </div>
        </div>

        {/* ToS / Privacy — bottom */}
        <p className="mt-auto pt-6 text-center text-xs text-muted-foreground/70 leading-relaxed lg:text-left">
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
      <div className="hidden lg:block lg:flex-1 p-3 pl-0">
        <div className="relative h-full w-full overflow-hidden rounded-2xl">
          {/* Gradient background — amber/warm theme */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-amber-600 via-orange-500 to-yellow-400"
          />

          {/* Abstract wave pattern overlay */}
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full opacity-30"
            viewBox="0 0 800 800"
            preserveAspectRatio="xMidYMid slice"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <path
                key={i}
                d={`M${-100 + i * 40},${800 + i * 10} Q${200 + i * 30},${400 - i * 20} ${900 + i * 10},${-50 + i * 35}`}
                stroke="white"
                strokeWidth={1.5 + i * 0.15}
                strokeOpacity={0.15 + i * 0.012}
                fill="none"
              />
            ))}
          </svg>

          {/* Radial glow */}
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(255,255,255,0.12)_0%,transparent_70%)]"
          />

          {/* Centred logo watermark */}
          <div className="absolute inset-0 flex items-center justify-center">
            <BrandLogo className="h-12 opacity-90 brightness-0 invert" alt="" />
          </div>
        </div>
      </div>
    </main>
  );
}
