'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';

// ── Floating paths decoration (left panel) ───────────────────────────────────

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.4 + i * 0.025,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        className="h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        aria-hidden
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.08 + path.id * 0.02}
            initial={{ pathLength: 0.3, opacity: 0.5 }}
            animate={{
              pathLength: 1,
              opacity: [0.3, 0.55, 0.3],
              pathOffset: [0, 1, 0],
            }}
            transition={{
              duration: 20 + Math.random() * 12,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

interface AuthPageLayoutProps {
  children: React.ReactNode;
  /** Heading shown above the Clerk widget */
  heading: string;
  /** Subheading shown below the heading */
  subheading: string;
}

export function AuthPageLayout({ children, heading, subheading }: AuthPageLayoutProps) {
  return (
    <main className="relative min-h-screen lg:grid lg:grid-cols-2 lg:overflow-hidden lg:h-screen">

      {/* ── Left decorative panel ── */}
      <div className="relative hidden lg:flex flex-col h-full bg-sidebar border-r border-sidebar-border p-10 overflow-hidden">

        {/* Animated path background — uses primary color so it adapts to theme */}
        <div className="absolute inset-0 text-primary/20">
          <FloatingPaths position={1} />
          <FloatingPaths position={-1} />
        </div>

        {/* Subtle radial glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_40%_50%,hsl(var(--primary)/0.08)_0%,transparent_70%)]"
        />

        {/* Logo */}
        <div className="relative z-10">
          <BrandLogo className="h-6" alt="Chippi" />
        </div>

        {/* Testimonial */}
        <div className="relative z-10 mt-auto">
          <blockquote className="space-y-3">
            <p className="text-lg leading-relaxed text-sidebar-foreground/85">
              &ldquo;Chippi transformed how I manage leads. I can see every
              applicant&rsquo;s full profile, score, and next step in seconds —
              it&rsquo;s the CRM I always wanted.&rdquo;
            </p>
            <footer className="text-sm font-semibold text-primary font-mono">
              ~ Jordan M., Independent Realtor
            </footer>
          </blockquote>
        </div>
      </div>

      {/* ── Right auth panel ── */}
      <div className="relative flex min-h-screen lg:min-h-0 flex-col items-center justify-center px-6 py-12 bg-background">

        {/* Subtle background glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_55%_35%,hsl(var(--primary)/0.06)_0%,transparent_70%)]"
        />

        {/* Mobile logo */}
        <div className="mb-8 lg:hidden">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        {/* Heading */}
        <div className="w-full max-w-sm mb-6 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading}</h1>
          <p className="text-sm text-muted-foreground">{subheading}</p>
        </div>

        {/* Clerk widget slot */}
        <div className="w-full max-w-sm flex justify-center">
          {children}
        </div>

        {/* ToS / Privacy */}
        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground/70 leading-relaxed">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
