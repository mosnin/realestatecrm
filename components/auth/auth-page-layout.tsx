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
    <main className="relative min-h-screen bg-background lg:flex lg:h-screen lg:overflow-hidden">

      {/* ── Left form panel ── */}
      <div className="relative flex w-full flex-col bg-white px-6 py-8 sm:px-10 lg:w-[480px] lg:min-w-[480px] lg:py-10 lg:border-r lg:border-border">

        {/* Logo — top-left */}
        <div className="shrink-0">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Form area — vertically centred */}
        <div className="flex flex-1 flex-col justify-center py-8 lg:py-0">
          <div className="mx-auto w-full max-w-[380px]">
            {heading && (
              <div className="mb-8 space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
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
        <p className="shrink-0 pt-4 text-xs text-muted-foreground/70 leading-relaxed lg:text-left">
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
      </div>
    </main>
  );
}
