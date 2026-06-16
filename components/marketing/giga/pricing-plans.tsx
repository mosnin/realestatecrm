'use client';

/**
 * PricingPlans, the plan cards for /pricing with a Monthly/Annual toggle.
 *
 * Client component (holds the cycle state). Numbers come from lib/plans
 * (priceMonthly, seats, credits, add-on). Annual applies a 20% discount, which
 * matches the product's existing annual seat-add-on discount; it is shown as the
 * discounted monthly-equivalent with a "billed annually" note. The toggle's
 * "Save 20%" badge communicates the saving.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { PLANS } from '@/lib/plans';
import { Band, BlurRise, Eyebrow } from './primitives';

const SIGNUP = '/login/realtor?intent=signup';
const signupHref = (plan: 'solo' | 'pro') => `${SIGNUP}&plan=${plan}`;

/** Annual = 20% off the monthly rate (matches the seat-add-on annual discount). */
const ANNUAL_FACTOR = 0.8;
const annualMonthly = (monthly: number) => Math.round(monthly * ANNUAL_FACTOR);

type Cycle = 'monthly' | 'annual';

type Card = {
  id: keyof typeof PLANS;
  blurb: string;
  highlights: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

const INDIVIDUAL: Card[] = [
  {
    id: 'solo',
    blurb: 'Organize your pipeline and put the core AI workflows to work.',
    highlights: ['Reads and drafts every lead', 'Tour booking and follow-ups', 'Every integration included'],
    cta: { label: 'Start free trial', href: signupHref('solo') },
  },
  {
    id: 'pro',
    blurb: 'The full daily AI workflow for serious lead volume.',
    highlights: ['Everything in Solo', 'Higher monthly credit balance', 'Priority support'],
    cta: { label: 'Start free trial', href: signupHref('pro') },
    featured: true,
  },
];

const TEAM: Card[] = [
  {
    id: 'team',
    blurb: 'A shared command center for scoring, routing, and accountability.',
    highlights: ['Lead routing across the floor', 'Live floor view and analytics', 'Roles, approvals, and audit log'],
    cta: { label: 'Start a team', href: '/demo' },
  },
  {
    id: 'team_plus',
    blurb: 'Brokerage-level workflow without enterprise complexity.',
    highlights: ['Everything in Team', 'More seats and credits', 'Better per-seat rate'],
    cta: { label: 'Talk to sales', href: '/demo' },
    featured: true,
  },
];

function PlanCard({ card, cycle }: { card: Card; cycle: Cycle }) {
  const p = PLANS[card.id];
  const price = cycle === 'annual' ? annualMonthly(p.priceMonthly) : p.priceMonthly;
  return (
    <div
      className={
        'flex h-full flex-col rounded-3xl border p-8 ' +
        (card.featured
          ? 'border-[#ff7a45]/30 bg-gradient-to-b from-[#ff7a45]/[0.08] to-white/[0.02]'
          : 'border-white/[0.08] bg-white/[0.02]')
      }
    >
      <div className="flex items-center justify-between">
        <h3 style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
          {p.label}
        </h3>
        {card.featured ? (
          <span className="rounded-full bg-[#ff7a45]/15 px-2.5 py-0.5 text-[10px] font-medium text-[#ff9a6e]">
            Most popular
          </span>
        ) : null}
      </div>

      <p className="mt-4 flex items-baseline gap-2">
        <span
          className="text-[2.5rem] font-light leading-none tracking-tight tabular-nums text-white"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          ${price}
        </span>
        <span className="text-sm text-white/45">/mo</span>
        {cycle === 'annual' ? (
          <span className="text-[13px] text-white/30 line-through tabular-nums">${p.priceMonthly}</span>
        ) : null}
      </p>
      <p className="mt-1.5 text-[12px] text-white/40">
        {cycle === 'annual' ? `billed annually at $${price * 12}/yr` : 'billed monthly'}
      </p>
      <p className="mt-2.5 text-[12.5px] text-white/45">
        {p.includedUsers > 1 ? `${p.includedUsers} seats included` : 'For one agent'}
      </p>
      <p className="mt-4 text-[13px] leading-relaxed text-white/55">{card.blurb}</p>

      <div className="mt-6 border-t border-white/[0.08] pt-5">
        <p>
          <span className="text-xl font-semibold tabular-nums text-white">
            {p.monthlyCredits.toLocaleString()}
          </span>{' '}
          <span className="text-[13px] text-white/45">credits / month</span>
        </p>
        {p.addUser ? (
          <p className="mt-1.5 text-[12px] text-white/40">
            +${p.addUser.priceMonthly}/seat, +{p.addUser.credits.toLocaleString()} credits
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
        href={card.cta.href}
        className={
          'mt-7 flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium transition-all duration-200 active:scale-[0.98] ' +
          (card.featured
            ? 'bg-white text-black hover:bg-white/90'
            : 'border border-white/20 text-white hover:bg-white/[0.05]')
        }
      >
        {card.cta.label}
      </Link>
    </div>
  );
}

function Toggle({ cycle, setCycle }: { cycle: Cycle; setCycle: (c: Cycle) => void }) {
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
        Monthly
      </button>
      <button
        type="button"
        onClick={() => setCycle('annual')}
        className={
          'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] transition-colors ' +
          (cycle === 'annual' ? 'bg-white font-medium text-black' : 'text-white/60 hover:text-white')
        }
      >
        Annual
        <span
          className={
            'rounded-full px-1.5 py-0.5 text-[10px] font-medium ' +
            (cycle === 'annual' ? 'bg-[#ff7a45]/20 text-[#c2410c]' : 'bg-[#ff7a45]/15 text-[#ff9a6e]')
          }
        >
          Save 20%
        </span>
      </button>
    </div>
  );
}

export function PricingPlans() {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  return (
    <>
      <Band className="pt-2">
        <BlurRise className="flex justify-center">
          <Toggle cycle={cycle} setCycle={setCycle} />
        </BlurRise>
      </Band>

      {/* Individual plans */}
      <Band className="pb-8 pt-10">
        <BlurRise className="text-center">
          <Eyebrow className="justify-center">For individual agents</Eyebrow>
        </BlurRise>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {INDIVIDUAL.map((c, i) => (
            <BlurRise key={c.id} delay={i * 0.06}>
              <PlanCard card={c} cycle={cycle} />
            </BlurRise>
          ))}
        </div>
      </Band>

      {/* Team plans */}
      <Band className="py-16 sm:py-20">
        <BlurRise className="text-center">
          <Eyebrow className="justify-center">For teams and brokerages</Eyebrow>
        </BlurRise>
        <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
          {TEAM.map((c, i) => (
            <BlurRise key={c.id} delay={i * 0.06}>
              <PlanCard card={c} cycle={cycle} />
            </BlurRise>
          ))}
        </div>
      </Band>
    </>
  );
}
