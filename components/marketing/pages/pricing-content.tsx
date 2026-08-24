/**
 * The /pricing page body, shared by every language route: `/pricing` renders
 * it with lang="en" (the canonical base), `/es/pricing` and `/ru/pricing`
 * with their languages. Layout/JSX is defined ONCE here — copy comes from
 * lib/i18n/dictionaries/pricing.ts, numbers from lib/plans (still the single
 * source of truth), and price AMOUNTS render via the LocalPrice client
 * components so the visitor's geo-resolved currency applies on top of any
 * language (Spanish page → CLP in Chile, COP in Colombia; English page →
 * EUR in Berlin, AED in Dubai).
 *
 * Server component; stays statically generated (currency hydrates client-side
 * from the middleware-set cookie — no per-request rendering).
 */

import Link from 'next/link';
import { PLANS, WORKFLOW_CREDIT_COST, TOPUPS, isAnnualAvailable } from '@/lib/plans';
import { LANG_TAG, type Lang } from '@/lib/i18n/markets';
import { PRICING_DICTS, fill, pluralWord } from '@/lib/i18n/dictionaries/pricing';
import { PricingPlans } from '@/components/marketing/giga/pricing-plans';
import {
  LocalPrice,
  PriceText,
  CurrencyNote,
  LangSwitcher,
} from '@/components/marketing/local-price';
import {
  Band,
  BlurRise,
  Eyebrow,
  Serif,
  PillPrimary,
  PillGhost,
} from '@/components/marketing/giga/primitives';

const SIGNUP = '/sign-up';

/* Only workflows that are actually built + metered today are advertised here
 * (mirrors the pre-i18n page: tour_booking / daily_briefing / lead_score). */
const ADVERTISED_WORKFLOWS = ['tour_booking', 'daily_briefing', 'lead_score'] as const;

export function PricingContent({ lang }: { lang: Lang }) {
  const t = PRICING_DICTS[lang];
  // Annual toggle only when annual is actually purchasable (see lib/plans).
  const annualEnabled = (['solo', 'pro', 'team', 'team_plus'] as const).some((id) =>
    isAnnualAvailable(id),
  );
  return (
    <div lang={LANG_TAG[lang]} className="dark bg-[#0a0a0a] text-white">
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/hero-bg.jpg" alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/82 via-[#0a0a0a]/48 to-[#0a0a0a]" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_38%,transparent_35%,rgba(10,10,10,0.6)_100%)]" />
        </div>
        <Band className="pt-40 pb-16 text-center sm:pt-48 sm:pb-20">
          <BlurRise trigger="load" delay={0.08}>
            <Serif as="h1" className="mx-auto mt-7 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
              {t.hero.h1}
            </Serif>
          </BlurRise>
          <BlurRise trigger="load" delay={0.16}>
            <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
              {t.hero.sub}
            </p>
          </BlurRise>
          <BlurRise trigger="load" delay={0.24}>
            <div className="mt-6">
              <LangSwitcher current={lang} basePath="/pricing" />
            </div>
          </BlurRise>
        </Band>
      </section>

      {/* Plan cards + Monthly/Annual toggle */}
      <PricingPlans annualEnabled={annualEnabled} lang={lang} />
      <Band className="pb-2">
        <CurrencyNote lang={lang} className="text-center text-[12px] text-white/35" />
      </Band>

      {/* Adding agents, flat per-seat (matches lib/plans addUser, no invented tiers) */}
      <Band className="py-16 sm:py-20">
        <BlurRise className="mx-auto max-w-3xl">
          <div className="text-center">
            <Eyebrow className="justify-center">{t.seats.eyebrow}</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              {t.seats.h2}
            </Serif>
            <p className="mx-auto mt-5 max-w-xl text-[14px] leading-relaxed text-white/55">
              {t.seats.sub}
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
            {[PLANS.team, PLANS.team_plus].map((p) => (
              <div key={p.id} className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
                <p style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
                  {p.label}
                </p>
                <p className="mt-1 text-[12.5px] text-white/45">
                  {fill(t.plans.seatsIncluded, { n: p.includedUsers })}
                </p>
                <p className="mt-4">
                  <span style={{ fontFamily: 'var(--font-sans)' }} className="text-2xl font-light tabular-nums text-white">
                    <LocalPrice usd={p.addUser?.priceMonthly ?? 0} lang={lang} />
                  </span>
                  <span className="text-[13px] text-white/45"> {t.seats.perAgentSuffix}</span>
                </p>
                <p className="mt-1 text-[12px] text-white/40">
                  {fill(t.seats.creditsPerAgent, {
                    credits: (p.addUser?.credits ?? 0).toLocaleString(LANG_TAG[lang]),
                  })}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[13px] text-white/45">
            {t.seats.largeFloor}{' '}
            <Link href="/demo" className="font-medium text-[#ff9a6e] hover:underline">
              {t.seats.talkToSales}
            </Link>
            .
          </p>
        </BlurRise>
      </Band>

      {/* Credits explainer + top-ups */}
      <Band className="py-16 sm:py-20">
        <BlurRise className="mx-auto max-w-3xl">
          <div className="text-center">
            <Eyebrow className="justify-center">{t.credits.eyebrow}</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              {t.credits.h2}
            </Serif>
            <p className="mt-5 text-[14px] leading-relaxed text-white/55">
              {fill(t.credits.sub, {
                leadScore: WORKFLOW_CREDIT_COST.lead_score,
                tourBooking: WORKFLOW_CREDIT_COST.tour_booking,
              })}
            </p>
          </div>
          <ul className="mt-8 divide-y divide-white/[0.06] overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
            {ADVERTISED_WORKFLOWS.map((k) => (
              <li key={k} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-[13.5px] text-white/80">{t.credits.workflows[k]}</span>
                <span className="text-[13px] tabular-nums text-white/45">
                  {WORKFLOW_CREDIT_COST[k]}{' '}
                  {pluralWord(lang, WORKFLOW_CREDIT_COST[k], t.credits.creditForms)}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-center">
            <Eyebrow className="justify-center">{t.credits.topupsEyebrow}</Eyebrow>
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {Object.values(TOPUPS).map((topup) => (
              <div key={topup.id} className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5">
                <p className="text-[13.5px] font-medium text-white">
                  {t.credits.topupLabels[topup.id]}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">
                  {topup.credits.toLocaleString(LANG_TAG[lang])}
                </p>
                <p className="mt-1 text-[12px] text-white/45">
                  <PriceText template={t.credits.topupLine} tokens={{ price: topup.price }} lang={lang} />
                </p>
              </div>
            ))}
          </div>
        </BlurRise>
      </Band>

      {/* FAQ */}
      <Band className="py-16 sm:py-20">
        <BlurRise className="mx-auto max-w-3xl text-center">
          <Eyebrow className="justify-center">{t.faq.eyebrow}</Eyebrow>
          <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
            {t.faq.h2}
          </Serif>
        </BlurRise>
        <ul className="mx-auto mt-12 max-w-3xl divide-y divide-white/[0.08]">
          {t.faq.items.map((item, i) => (
            <BlurRise key={item.q} delay={i * 0.04}>
              <li className="py-7">
                <p style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
                  {item.q}
                </p>
                <p className="mt-2.5 text-[14px] leading-relaxed text-white/55">
                  {/* Seat prices in prose localize with the visitor's currency */}
                  <PriceText
                    template={item.a}
                    tokens={{
                      teamSeat: PLANS.team.addUser?.priceMonthly ?? 0,
                      teamPlusSeat: PLANS.team_plus.addUser?.priceMonthly ?? 0,
                    }}
                    lang={lang}
                  />
                </p>
              </li>
            </BlurRise>
          ))}
        </ul>
      </Band>

      {/* Closing CTA */}
      <Band className="pb-28 pt-4 sm:pb-36">
        <BlurRise className="mx-auto max-w-2xl text-center">
          <Serif className="text-[clamp(1.9rem,3.8vw,3rem)] leading-[1.06] text-white">
            {t.closing.h2}
          </Serif>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
            {t.closing.sub}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <PillPrimary href={SIGNUP} withArrow>
              {t.closing.startTrial}
            </PillPrimary>
            <PillGhost href="/demo">{t.closing.bookDemo}</PillGhost>
          </div>
        </BlurRise>
      </Band>
    </div>
  );
}
