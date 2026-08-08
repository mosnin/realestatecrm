'use client';

/**
 * PricingPlans, the plan cards for /pricing with a Monthly/Annual toggle.
 *
 * Client component (holds the cycle state). Numbers come from lib/plans
 * (priceMonthly, seats, credits, add-on); copy comes from the pricing
 * dictionary for the page's language; amounts render in the visitor's
 * display currency (useDisplayCurrency ← `chippi_currency` cookie set by
 * middleware geo detection), clean-rounded from the USD base price.
 *
 * Annual applies a 20% discount, which matches the product's existing annual
 * seat-add-on discount; it is shown as the discounted monthly-equivalent with
 * a "billed annually" note. The discount factor applies to the USD base and
 * the yearly figure is 12 × the shown local monthly, so the card is
 * arithmetically consistent in every currency.
 *
 * The Annual toggle option renders ONLY when annual is actually purchasable
 * (annualEnabled, computed server-side via isAnnualAvailable) so the marketing
 * preview can never advertise an annual price the in-app checkout would refuse.
 * This toggle is a PREVIEW only — the real cadence choice happens at the in-app
 * checkout (subscribe / broker billing).
 */

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { PLANS } from '@/lib/plans';
import { LANG_TAG, type Lang } from '@/lib/i18n/markets';
import { localizePrice, formatMoney } from '@/lib/i18n/currency';
import { PRICING_DICTS, fill } from '@/lib/i18n/dictionaries/pricing';
import { useDisplayCurrency } from '@/components/marketing/local-price';
import { Band, BlurRise, Eyebrow } from './primitives';

const SIGNUP = '/login/realtor?intent=signup';
const signupHref = (plan: 'solo' | 'pro') => `${SIGNUP}&plan=${plan}`;
/** Self-serve brokerage entry — Team / Team Plus check out in-app after broker
 *  sign-in (the brokerage-scoped /api/billing/checkout), not via /demo. */
const BROKER_SIGNIN = '/login/broker';

/** Annual = 20% off the monthly rate (matches the seat-add-on annual discount). */
const ANNUAL_FACTOR = 0.8;
const annualMonthlyUsd = (monthly: number) => Math.round(monthly * ANNUAL_FACTOR);

type Cycle = 'monthly' | 'annual';
type CardId = 'solo' | 'pro' | 'team' | 'team_plus';

const CARD_ORDER: { individual: CardId[]; team: CardId[] } = {
  individual: ['solo', 'pro'],
  team: ['team', 'team_plus'],
};
const CARD_META: Record<CardId, { href: string; featured?: boolean }> = {
  solo: { href: signupHref('solo') },
  pro: { href: signupHref('pro'), featured: true },
  team: { href: BROKER_SIGNIN },
  team_plus: { href: BROKER_SIGNIN, featured: true },
};

function PlanCard({ id, cycle, lang }: { id: CardId; cycle: Cycle; lang: Lang }) {
  const t = PRICING_DICTS[lang].plans;
  const currency = useDisplayCurrency();
  const p = PLANS[id];
  const meta = CARD_META[id];
  const card = t.cards[id];

  const money = (usd: number) => formatMoney(localizePrice(usd, currency), currency, lang);
  const usdMonthly = cycle === 'annual' ? annualMonthlyUsd(p.priceMonthly) : p.priceMonthly;
  const localMonthly = localizePrice(usdMonthly, currency);

  return (
    <div
      className={
        'flex h-full flex-col rounded-3xl border p-8 ' +
        (meta.featured
          ? 'border-[#ff7a45]/30 bg-gradient-to-b from-[#ff7a45]/[0.08] to-white/[0.02]'
          : 'border-white/[0.08] bg-white/[0.02]')
      }
    >
      <div className="flex items-center justify-between">
        <h3 style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
          {p.label}
        </h3>
        {meta.featured ? (
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
        {cycle === 'annual' ? (
          <span className="text-[13px] text-white/30 line-through tabular-nums">
            {money(p.priceMonthly)}
          </span>
        ) : null}
      </p>
      <p className="mt-1.5 text-[12px] text-white/40">
        {cycle === 'annual'
          ? fill(t.billedAnnually, { amount: formatMoney(localMonthly * 12, currency, lang) })
          : t.billedMonthly}
      </p>
      <p className="mt-2.5 text-[12.5px] text-white/45">
        {p.includedUsers > 1 ? fill(t.seatsIncluded, { n: p.includedUsers }) : t.forOneAgent}
      </p>
      <p className="mt-4 text-[13px] leading-relaxed text-white/55">{card.blurb}</p>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <p>
          <span className="text-xl font-semibold tabular-nums text-white">
            {p.monthlyCredits.toLocaleString(LANG_TAG[lang])}
          </span>{' '}
          <span className="text-[13px] text-white/45">{t.creditsPerMonth}</span>
        </p>
        {p.addUser ? (
          <p className="mt-1.5 text-[12px] text-white/40">
            {fill(t.perSeatLine, {
              price: money(p.addUser.priceMonthly),
              credits: p.addUser.credits.toLocaleString(LANG_TAG[lang]),
            })}
          </p>
        ) : null}
      </div>

      <ul className="mt-6 space-y-2.5">
        {card.highlights.map((h) => (
          <li key={h} className="flex items-start gap-2.5 text-[13px] text-white/70">
            <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#ff9a6e]" />
            {h}
          </li>
        ))}
      </ul>

      <Link
        href={meta.href}
        className={
          'mt-7 flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium transition-all duration-200 active:scale-[0.98] ' +
          (meta.featured
            ? 'bg-white text-black hover:bg-white/90'
            : 'border border-white/20 text-white hover:bg-white/[0.05]')
        }
      >
        {card.cta}
      </Link>
    </div>
  );
}

function Toggle({ cycle, setCycle, lang }: { cycle: Cycle; setCycle: (c: Cycle) => void; lang: Lang }) {
  const t = PRICING_DICTS[lang].plans;
  return (
    <div className="inline-flex items-center rounded-full border border-white/[0.12] bg-white/[0.03] p-1">
      <button
        type="button"
        onClick={() => setCycle('monthly')}
        className={
          'rounded-full px-4 py-1.5 text-[13px] transition-colors ' +
          (cycle === 'monthly' ? 'bg-white font-medium text-black' : 'text-white/60 hover:text-white')
        }
      >
        {t.monthly}
      </button>
      <button
        type="button"
        onClick={() => setCycle('annual')}
        className={
          'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] transition-colors ' +
          (cycle === 'annual' ? 'bg-white font-medium text-black' : 'text-white/60 hover:text-white')
        }
      >
        {t.annual}
        <span
          className={
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium ' +
            (cycle === 'annual' ? 'bg-[#ff7a45]/20 text-[#c2410c]' : 'bg-[#ff7a45]/15 text-[#ff9a6e]')
          }
        >
          {t.save20}
        </span>
      </button>
    </div>
  );
}

export function PricingPlans({
  annualEnabled = false,
  lang = 'en',
}: {
  annualEnabled?: boolean;
  lang?: Lang;
}) {
  const t = PRICING_DICTS[lang].plans;
  const [cycle, setCycle] = useState<Cycle>('monthly');
  // Annual is a preview that only makes sense when it's actually purchasable;
  // when it isn't, hide the toggle and pin the cycle to monthly so no card ever
  // shows a 20%-off price the in-app checkout would refuse.
  const effectiveCycle: Cycle = annualEnabled ? cycle : 'monthly';
  return (
    <>
      {annualEnabled && (
        <Band className="pt-2">
          <BlurRise className="flex justify-center">
            <Toggle cycle={cycle} setCycle={setCycle} lang={lang} />
          </BlurRise>
        </Band>
      )}

      {/* Individual plans */}
      <Band className="pb-8 pt-10">
        <BlurRise className="text-center">
          <Eyebrow className="justify-center">{t.individualEyebrow}</Eyebrow>
        </BlurRise>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {CARD_ORDER.individual.map((id, i) => (
            <BlurRise key={id} delay={i * 0.06}>
              <PlanCard id={id} cycle={effectiveCycle} lang={lang} />
            </BlurRise>
          ))}
        </div>
      </Band>

      {/* Team plans */}
      <Band className="py-16 sm:py-20">
        <BlurRise className="text-center">
          <Eyebrow className="justify-center">{t.teamEyebrow}</Eyebrow>
        </BlurRise>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {CARD_ORDER.team.map((id, i) => (
            <BlurRise key={id} delay={i * 0.06}>
              <PlanCard id={id} cycle={effectiveCycle} lang={lang} />
            </BlurRise>
          ))}
        </div>
      </Band>
    </>
  );
}
