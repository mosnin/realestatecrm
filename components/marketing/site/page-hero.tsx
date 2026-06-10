/**
 * PageHero — the calm sub-page hero, shared across the logged-out site.
 *
 * Same vocabulary as the home hero (serif Times title, grid backdrop, warm
 * wash, foreground primary CTA) but compact and headline-only, so realtors,
 * brokerages, pricing, etc. all open the same way. Replaces the legacy
 * MarketingHero (ASCII field + orange primary).
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './reveal';
import { GridBackdrop } from './frame';
import { TITLE_FONT } from '@/lib/typography';

interface CtaLink {
  label: string;
  href: string;
}

export function PageHero({
  eyebrow,
  title,
  sub,
  primaryCta,
  secondaryCta,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  primaryCta?: CtaLink;
  secondaryCta?: CtaLink;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-background px-4 pt-32 pb-16 sm:px-6 sm:pt-36 sm:pb-20">
      <GridBackdrop />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--brand-subtle),transparent_70%)]"
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1
            className="mt-5 text-[2.5rem] leading-[1.05] tracking-tight text-foreground sm:text-[3.5rem]"
            style={TITLE_FONT}
          >
            {title}
          </h1>
        </Reveal>
        {sub ? (
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              {sub}
            </p>
          </Reveal>
        ) : null}
        {primaryCta || secondaryCta ? (
          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primaryCta ? (
                <Link
                  href={primaryCta.href}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
                >
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
              {secondaryCta ? (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
                >
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
