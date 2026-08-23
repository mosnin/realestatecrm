'use client';

/**
 * AuthPageLayout: a premium split screen with an architectural brand panel
 * on the left and the Clerk form on the right.
 * The Clerk components, redirect wiring, role switcher, and ToS copy are
 * unchanged. Only the chrome around them is restyled.
 *
 * On mobile the photograph collapses to a slim signature strip above the form.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION, H1 } from '@/lib/typography';
import { PAGE_VARIANTS } from '@/lib/motion';
import { AUTH_DICTS } from '@/lib/i18n/dictionaries/auth';
import { localizedPath, type Lang } from '@/lib/i18n/markets';

export interface AuthPageLayoutProps {
  children: React.ReactNode;
  heading: string;
  subheading?: string;
  variant?: 'realtor' | 'broker';
  lang?: Lang;
}

export function AuthPageLayout({ children, heading, subheading, variant: _variant, lang = 'en' }: AuthPageLayoutProps) {
  const pathname = usePathname();
  const t = AUTH_DICTS[lang];

  const isBrokerLogin = pathname.startsWith('/login/broker');
  const isRealtorLogin = pathname.startsWith('/login/realtor');
  const showRoleSwitcher = isBrokerLogin || isRealtorLogin;

  return (
    <main className="relative grid min-h-screen bg-background lg:grid-cols-2">
      {/* ── Left brand image panel (desktop) ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/70 p-12 lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marketing/chippi-auth-building.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/35" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,rgba(255,150,79,0.20),transparent_60%)]" />

        <Link href={localizedPath('/', lang)} className="relative z-10 flex items-center gap-2" aria-label="Chippi home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="Chippi" className="h-7 w-auto" />
        </Link>

        <div className="relative z-10">
          <p className="font-brand text-xs uppercase tracking-[0.25em] text-[#ff964f]">
            {t.brand.eyebrow}
          </p>
          <h2 className="font-title mt-4 text-4xl leading-tight tracking-tight text-white">
            {t.brand.headline}
          </h2>
          <p className="mt-4 text-sm text-white/70">
            {t.brand.capabilities}
          </p>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="relative flex w-full flex-col bg-background px-6 py-6 sm:px-10 sm:py-8 lg:py-10">
        {/* Mobile architectural signature strip. */}
        <div className="absolute inset-x-0 top-0 h-28 overflow-hidden lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marketing/chippi-auth-building.webp"
            alt=""
            className="h-full w-full object-cover object-[center_42%] opacity-55"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 to-background" />
        </div>

        {/* Logo (mobile + as the panel's top mark). */}
        <div className="relative z-10 shrink-0 lg:hidden">
          <BrandLogo className="h-6 sm:h-7" alt="Chippi" />
        </div>

        {/* Form area. */}
        <div className="relative z-10 flex flex-1 flex-col justify-center py-6 sm:py-8 lg:py-0">
          <motion.div
            variants={PAGE_VARIANTS}
            initial="initial"
            animate="enter"
            className="mx-auto w-full max-w-[380px]"
          >
            {/* Role switcher: fully rounded, paper-flat. */}
            {showRoleSwitcher && (
              <div role="tablist" aria-label={t.accountType} className="mb-6 flex rounded-full bg-foreground/[0.04] p-1">
                <Link
                  href="/login/realtor"
                  role="tab"
                  aria-selected={isRealtorLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isRealtorLogin
                      ? 'border border-border/70 bg-background text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <User size={16} className="shrink-0 sm:size-[14px]" />
                  {t.agent}
                </Link>
                <Link
                  href="/login/broker"
                  role="tab"
                  aria-selected={isBrokerLogin}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-sm font-medium transition-all sm:py-2',
                    isBrokerLogin
                      ? 'border border-border/70 bg-background text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Building2 size={16} className="shrink-0 sm:size-[14px]" />
                  {t.broker}
                </Link>
              </div>
            )}

            {/* Heading: brand display face, the screen's headline. */}
            {heading && (
              <div className="mb-6 space-y-1.5">
                <h1 className={H1}>{heading}</h1>
                {subheading && <p className={BODY_MUTED}>{subheading}</p>}
              </div>
            )}

            <div className="w-full">{children}</div>
          </motion.div>
        </div>

        {/* ToS / Privacy. */}
        <p className={cn(CAPTION, 'relative z-10 shrink-0 pt-4 text-center leading-relaxed sm:text-left')}>
          {t.legal.prefix}{' '}
          <Link href="/legal/terms" className="underline underline-offset-4 transition-colors hover:text-foreground">
            {t.legal.terms}
          </Link>{' '}
          {t.legal.and}{' '}
          <Link href="/legal/privacy" className="underline underline-offset-4 transition-colors hover:text-foreground">
            {t.legal.privacy}
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
