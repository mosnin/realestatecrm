'use client';

/**
 * Plan cards with a monthly/annual billing toggle, the interactive island of
 * the otherwise-static /pricing page.
 *
 * Display layer only: the marketing CTAs route to signup, so flipping the
 * toggle changes the advertised numbers, not a checkout. Annual figures come
 * from annualPriceFor() in lib/plans (10% off 12× monthly) — the Stripe annual
 * price ids must stay in agreement so the page never shows a price Stripe
 * doesn't charge. Defaults to monthly.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Reveal } from '@/components/marketing/site/reveal';
import { PLANS, annualPriceFor, ANNUAL_DISCOUNT_RATE } from '@/lib/plans';

const SIGNUP = '/login/realtor?intent=signup';
const SAVE_PCT = Math.round(ANNUAL_DISCOUNT_RATE * 100);

type Interval = 'monthly' | 'annual';

type Card = {
  id: keyof typeof PLANS;
  blurb: string;
  cta: { label: string; href: string };
  featured?: boolean;
};

const INDIVIDUAL: Card[] = [
  { id: 'solo', blurb: 'Organize your pipeline and put the core AI workflows to work.', cta: { label: 'Start free trial', href: SIGNUP } },
  { id: 'pro', blurb: 'Full daily AI workflow for serious lead volume.', cta: { label: 'Start free trial', href: SIGNUP }, featured: true },
];

const TEAM: Card[] = [
  { id: 'team', blurb: 'A shared command center for scoring, routing, and accountability.', cta: { label: 'Start a team', href: '/demo' } },
  { id: 'team_plus', blurb: 'Brokerage-level workflow without enterprise complexity.', cta: { label: 'Talk to sales', href: '/demo' } },
];

function BillingToggle({ interval, onChange }: { interval: Interval; onChange: (i: Interval) => void }) {
  const pill = (active: boolean) =>
    `inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
      active
        ? 'bg-white text-zinc-950 shadow-[0_2px_8px_-2px_rgba(20,20,40,0.18)]'
        : 'text-neutral-500 hover:text-zinc-900'
    }`;
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] p-1 ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => onChange('monthly')}
        aria-pressed={interval === 'monthly'}
        className={pill(interval === 'monthly')}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange('annual')}
        aria-pressed={interval === 'annual'}
        className={pill(interval === 'annual')}
      >
        Annual
        <span className="ml-1.5 rounded-full bg-[#ff4b29]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#ff4b29]">
          Save {SAVE_PCT}%
        </span>
      </button>
    </div>
  );
}

function PlanCard({ card, interval }: { card: Card; interval: Interval }) {
  const p = PLANS[card.id];
  const annual = annualPriceFor(card.id);
  const usersLine = p.includedUsers > 1 ? `${p.includedUsers} users included` : 'for one agent';
  return (
    <div
      className={`flex h-full flex-col rounded-3xl p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 ${
        card.featured ? 'bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd]' : 'bg-white'
      }`}
    >
      {card.featured ? (
        <span className="mb-4 inline-flex w-fit items-center rounded-full bg-[#ff4b29]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#ff4b29]">
          Most popular
        </span>
      ) : null}
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
        {p.label}
      </p>
      {interval === 'monthly' ? (
        <>
          <p className="mt-3 text-[40px] font-semibold leading-none tracking-tight text-zinc-950">
            ${p.priceMonthly}
            <span className="text-base font-normal text-neutral-500"> /mo</span>
          </p>
          <p className="mt-2 text-sm text-neutral-500">{usersLine}</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[40px] font-semibold leading-none tracking-tight text-zinc-950">
            ${annual.toLocaleString()}
            <span className="text-base font-normal text-neutral-500"> /yr</span>
          </p>
          <p className="mt-2 text-sm text-neutral-500">{usersLine} · save {SAVE_PCT}%</p>
        </>
      )}
      <p className="mt-5 text-sm text-neutral-600">{card.blurb}</p>
      <p className="mt-5 text-sm">
        <span className="text-xl font-semibold tracking-tight text-zinc-950">
          {p.monthlyCredits.toLocaleString()}
        </span>{' '}
        <span className="text-neutral-500">credits / month</span>
      </p>
      {p.addUser ? (
        <p className="mt-1 text-xs text-neutral-500">
          +${p.addUser.priceMonthly}/user · +{p.addUser.credits.toLocaleString()} credits
        </p>
      ) : null}
      <Link
        href={card.cta.href}
        className={`mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-7 text-[15px] font-semibold transition-all duration-150 active:scale-[0.98] ${
          card.featured
            ? 'bg-[#ff4b29] text-white hover:bg-[#e84418]'
            : 'border border-black/10 bg-white text-zinc-950 hover:bg-black/[0.04]'
        }`}
      >
        {card.cta.label}
      </Link>
    </div>
  );
}

export function PricingPlans() {
  const [interval, setInterval] = useState<Interval>('monthly');
  return (
    <>
      {/* Billing toggle + individual plans */}
      <section className="px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-4xl">
          <Reveal className="flex justify-center">
            <BillingToggle interval={interval} onChange={setInterval} />
          </Reveal>
          <Reveal className="mt-12">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              For individual agents
            </p>
          </Reveal>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {INDIVIDUAL.map((c, i) => (
              <Reveal key={c.id} delay={i * 0.05}>
                <PlanCard card={c} interval={interval} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Team plans */}
      <section className="mt-16 px-4 sm:mt-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              For teams
            </p>
          </Reveal>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {TEAM.map((c, i) => (
              <Reveal key={c.id} delay={i * 0.05}>
                <PlanCard card={c} interval={interval} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
