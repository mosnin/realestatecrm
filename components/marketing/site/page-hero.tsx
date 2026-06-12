/**
 * PageHero, the shared sub-page opener, bold-canvas edition.
 *
 * Sits straight on the canvas: ✦ chip eyebrow, a big display headline
 * (Inter Tight, supports an <Accent> italic span), one sub line, and the
 * signal-vermillion primary pill. Every sub-page opens the same way so the
 * site reads as one voice, just no longer a quiet one.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FadeUp, EyebrowChip } from './section';

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
  title: React.ReactNode;
  sub?: string;
  primaryCta?: CtaLink;
  secondaryCta?: CtaLink;
}) {
  return (
    <section className="px-4 pb-10 pt-32 sm:px-6 sm:pb-14 sm:pt-40">
      <div className="mx-auto max-w-3xl text-center">
        <FadeUp>
          <EyebrowChip className="justify-center">{eyebrow}</EyebrowChip>
        </FadeUp>
        <FadeUp delay={0.05}>
          <h1 className="font-display mt-6 text-balance text-[2.75rem] font-bold leading-[1.02] tracking-[-0.035em] text-[#141414] dark:text-white sm:text-6xl">
            {title}
          </h1>
        </FadeUp>
        {sub ? (
          <FadeUp delay={0.1}>
            <p className="mx-auto mt-6 max-w-xl text-balance text-base leading-relaxed text-[#141414]/65 dark:text-white/60 sm:text-lg">
              {sub}
            </p>
          </FadeUp>
        ) : null}
        {primaryCta || secondaryCta ? (
          <FadeUp delay={0.15}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {primaryCta ? (
                <Link
                  href={primaryCta.href}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
                >
                  {primaryCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
              {secondaryCta ? (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[#141414]/15 bg-white px-7 text-[15px] font-semibold text-[#141414] transition-colors duration-150 hover:bg-[#141414]/[0.04] dark:border-white/15 dark:bg-[#151517] dark:text-white dark:hover:bg-white/[0.06]"
                >
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
          </FadeUp>
        ) : null}
      </div>
    </section>
  );
}
