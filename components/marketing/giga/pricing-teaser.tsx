'use client';

/** Compact annual first pricing used on supporting marketing pages. */

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { PLANS } from '@/lib/plans';
import { formatMoney, localizePrice } from '@/lib/i18n/currency';
import { CHROME_DICTS } from '@/lib/i18n/dictionaries/chrome';
import { PRICING_DICTS, fill } from '@/lib/i18n/dictionaries/pricing';
import { MARKETING_PAGE_DICTS } from '@/lib/i18n/dictionaries/marketing-pages';
import { LANG_TAG, localizedPath, type Lang } from '@/lib/i18n/markets';
import { CurrencyNote, useDisplayCurrency } from '@/components/marketing/local-price';
import { BlurRise, Eyebrow, Serif, Band } from './primitives';

type TeaserPlanId = 'solo' | 'pro' | 'team' | 'team_plus';

const ANNUAL_FACTOR = 0.8;
const annualMonthlyUsd = (monthly: number) => Math.round(monthly * ANNUAL_FACTOR);

const PLAN_HREFS: Record<TeaserPlanId, string> = {
  solo: '/sign-up?plan=solo',
  pro: '/sign-up?plan=pro',
  team: '/sign-up?intent=broker',
  team_plus: '/sign-up?intent=broker',
};

export interface TeaserPlan {
  id: TeaserPlanId;
  featured?: boolean;
}

export function PricingTeaser({
  eyebrow,
  headline,
  plans,
  lang = 'en',
  annualEnabled = false,
}: {
  eyebrow?: string;
  headline: React.ReactNode;
  plans: TeaserPlan[];
  lang?: Lang;
  annualEnabled?: boolean;
}) {
  const currency = useDisplayCurrency();
  const t = PRICING_DICTS[lang].plans;
  const pricingHref = localizedPath('/pricing', lang);
  const money = (usd: number) => formatMoney(localizePrice(usd, currency), currency, lang);

  return (
    <Band className="py-24 sm:py-32">
      <BlurRise>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>{eyebrow ?? CHROME_DICTS[lang].header.pricing}</Eyebrow>
          <Serif className="mt-5 text-[clamp(2rem,3.6vw,3rem)] leading-[1.06] text-white">{headline}</Serif>
        </div>
      </BlurRise>

      <BlurRise delay={0.1}>
        <div className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-2">
          {plans.map(({ id, featured }) => {
            const plan = PLANS[id];
            const card = t.cards[id];
            const monthlyUsd = annualEnabled ? annualMonthlyUsd(plan.priceMonthly) : plan.priceMonthly;
            const localMonthly = localizePrice(monthlyUsd, currency);

            return (
              <div
                key={id}
                className={
                  'flex h-full flex-col rounded-3xl border p-8 ' +
                  (featured
                    ? 'border-[#ff7a45]/30 bg-gradient-to-b from-[#ff7a45]/[0.08] to-white/[0.02]'
                    : 'border-white/[0.08] bg-white/[0.02]')
                }
              >
                <div className="flex items-center justify-between">
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
                    {plan.label}
                  </h3>
                  {featured ? (
                    <span className="rounded-full bg-[#ff7a45]/15 px-2.5 py-0.5 text-[10px] font-medium text-[#ff9a6e]">
                      {t.mostPopular}
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 flex items-baseline gap-2">
                  <span
                    className="text-[2.5rem] font-light leading-none tracking-tight tabular-nums text-white"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    {formatMoney(localMonthly, currency, lang)}
                  </span>
                  <span className="text-sm text-white/45">{t.perMonth}</span>
                  {annualEnabled ? (
                    <span className="text-[13px] tabular-nums text-white/30 line-through">
                      {money(plan.priceMonthly)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1.5 text-[12px] text-white/40">
                  {annualEnabled
                    ? fill(t.billedAnnually, { amount: formatMoney(localMonthly * 12, currency, lang) })
                    : t.billedMonthly}
                </p>
                <p className="mt-2.5 text-[12.5px] text-white/45">
                  {plan.includedUsers > 1
                    ? fill(t.seatsIncluded, { n: plan.includedUsers })
                    : t.forOneAgent}
                </p>
                <p className="mt-4 text-[13px] leading-relaxed text-white/55">{card.blurb}</p>
                <p className="mt-5 border-t border-white/[0.08] pt-5 text-[13px] text-white/70">
                  <span className="font-semibold tabular-nums text-white">
                    {plan.monthlyCredits.toLocaleString(LANG_TAG[lang])}
                  </span>{' '}
                  {t.creditsPerMonth}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {card.highlights.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-[13px] text-white/70">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#ff9a6e]" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={PLAN_HREFS[id]}
                  className={
                    'mt-7 flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium transition-all duration-200 active:scale-[0.98] ' +
                    (featured
                      ? 'bg-white text-black hover:bg-white/90'
                      : 'border border-white/20 text-white hover:bg-white/[0.05]')
                  }
                >
                  {card.cta}
                </Link>
              </div>
            );
          })}
        </div>
      </BlurRise>

      <CurrencyNote lang={lang} className="mt-5 text-center text-[12px] text-white/35" />

      <BlurRise delay={0.16}>
        <div className="mt-8 text-center">
          <Link
            href={pricingHref}
            className="inline-flex items-center gap-1.5 text-[13px] text-white/55 transition-colors hover:text-white"
          >
            {MARKETING_PAGE_DICTS[lang].common.seePlans}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </BlurRise>
    </Band>
  );
}
