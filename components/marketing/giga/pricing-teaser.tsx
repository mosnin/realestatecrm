'use client';

/**
 * PricingTeaser, a compact pricing section in the dark cinematic style, used on
 * the agents and brokerages pages. Plans are passed in (plain data) and grounded
 * in lib/plans.ts; a link points to the full /pricing page.
 */

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { BlurRise, Eyebrow, Serif, Band } from './primitives';

export interface TeaserPlan {
  name: string;
  price: string;
  blurb: string;
  features: string[];
  featured?: boolean;
}

export function PricingTeaser({
  eyebrow = 'Pricing',
  headline,
  plans,
  href = '/pricing',
}: {
  eyebrow?: string;
  headline: React.ReactNode;
  plans: TeaserPlan[];
  href?: string;
}) {
  return (
    <Band className="py-24 sm:py-32">
      <BlurRise>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Serif className="mt-5 text-[clamp(2rem,3.6vw,3rem)] leading-[1.06] text-white">{headline}</Serif>
        </div>
      </BlurRise>

      <BlurRise delay={0.1}>
        <div className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-2">
          {plans.map((p) => (
            <div
              key={p.name}
              className={
                'rounded-3xl border p-8 ' +
                (p.featured
                  ? 'border-[#ff7a45]/30 bg-gradient-to-b from-[#ff7a45]/[0.08] to-white/[0.02]'
                  : 'border-white/[0.08] bg-white/[0.02]')
              }
            >
              <div className="flex items-center justify-between">
                <h3 style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
                  {p.name}
                </h3>
                {p.featured ? (
                  <span className="rounded-full bg-[#ff7a45]/15 px-2.5 py-0.5 text-[10px] font-medium text-[#ff9a6e]">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className="mt-4">
                <span
                  className="text-[2.5rem] font-light leading-none tracking-tight tabular-nums text-white"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {p.price}
                </span>
                <span className="text-sm text-white/45"> /mo</span>
              </p>
              <p className="mt-3 text-[13px] leading-relaxed text-white/55">{p.blurb}</p>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-white/70">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#ff9a6e]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={href}
                className={
                  'mt-7 flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium transition-all duration-200 active:scale-[0.98] ' +
                  (p.featured
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'border border-white/20 text-white hover:bg-white/[0.05]')
                }
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </BlurRise>

      <BlurRise delay={0.16}>
        <div className="mt-8 text-center">
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 text-[13px] text-white/55 transition-colors hover:text-white"
          >
            See all plans and credits
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </BlurRise>
    </Band>
  );
}
