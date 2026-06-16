/**
 * `/pricing`, Chippi V2 tiers on the dark cinematic redesign system (matches
 * /company and the rest of the marketing site). Server component (exports
 * metadata).
 *
 * No free tier shown: every plan starts with a 7-day trial that requires a card.
 * Individuals (Solo / Pro), teams (Team / Team Plus), then brokerage expansion.
 * Premium AI workflows draw from a monthly credit balance.
 *
 * Numbers come from `lib/plans` so the page can't drift from the product's
 * source of truth. Cinematic sections live in a forced-dark wrapper.
 */

import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { PLANS, WORKFLOW_CREDIT_COST, TOPUPS } from '@/lib/plans';
import {
  Band,
  BlurRise,
  Eyebrow,
  EyebrowPill,
  Serif,
  PillPrimary,
  PillGhost,
} from '@/components/marketing/giga/primitives';

export const metadata = { title: 'Pricing · Chippi' };

const SIGNUP = '/login/realtor?intent=signup';
const signupHref = (plan: 'solo' | 'pro') => `${SIGNUP}&plan=${plan}`;

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

const EXPANSION: { range: string; mo: number; yr: number }[] = [
  { range: '10 to 24 agents', mo: 69, yr: 56 },
  { range: '25 to 49 agents', mo: 59, yr: 48 },
  { range: '50 to 99 agents', mo: 49, yr: 40 },
  { range: '100 to 199 agents', mo: 39, yr: 32 },
];

const WORKFLOW_LABELS: Partial<Record<keyof typeof WORKFLOW_CREDIT_COST, string>> = {
  pipeline_audit: 'Full pipeline audit',
  followup_sequence: 'Follow-up sequence',
  lead_qualification: 'Lead qualification run',
  tour_booking: 'Tour booking workflow',
  daily_briefing: 'Daily AI briefing',
  call_prep: 'Call prep',
  lead_score: 'Lead score update',
};

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Is there a free plan?',
    a: 'No. Every plan starts with a 7-day free trial. A card is required to begin, you are not charged until the trial ends, and you can cancel anytime before then at no cost.',
  },
  {
    q: 'What are credits?',
    a: 'High-value agentic actions draw from a monthly credit balance: a full pipeline audit, a follow-up sequence, a lead qualification run. Routine actions cost little or nothing. Unused credits roll over for 30 days.',
  },
  {
    q: 'What happens when I run out of credits?',
    a: 'Buy a one-time top-up anytime, or move up a plan for a larger monthly allocation and a better rate. Your workspace never locks, only the premium AI workflows pause.',
  },
  {
    q: 'How does brokerage pricing work?',
    a: 'Add an agent and billing updates automatically, the per-agent price drops as the team grows. No tier jumping, no calls to sales until you want them.',
  },
];

function PlanCard({ card }: { card: Card }) {
  const p = PLANS[card.id];
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
      <p className="mt-4">
        <span
          className="text-[2.5rem] font-light leading-none tracking-tight tabular-nums text-white"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          ${p.priceMonthly}
        </span>
        <span className="text-sm text-white/45"> /mo</span>
      </p>
      <p className="mt-2 text-[12.5px] text-white/45">
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

export default function PricingPage() {
  return (
    <>
      <div className="dark bg-[#0a0a0a] text-white">
        {/* Hero */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[80%]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marketing/hero-bg.jpg"
              alt=""
              className="h-full w-full object-cover opacity-20"
              style={{ filter: 'saturate(0.8) brightness(0.7)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]" />
          </div>
          <Band className="pt-40 pb-20 text-center sm:pt-48 sm:pb-24">
            <BlurRise trigger="load">
              <EyebrowPill>Pricing</EyebrowPill>
            </BlurRise>
            <BlurRise trigger="load" delay={0.08}>
              <Serif as="h1" className="mx-auto mt-7 max-w-3xl text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] text-white">
                Pricing that scales with you.
              </Serif>
            </BlurRise>
            <BlurRise trigger="load" delay={0.16}>
              <p className="mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-white/55">
                Every plan starts with a 7-day free trial. Move up as you grow, premium AI workflows
                draw from a monthly credit balance, and brokerage pricing expands automatically as you
                add agents.
              </p>
            </BlurRise>
            <BlurRise trigger="load" delay={0.24}>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <PillPrimary href={SIGNUP} withArrow>
                  Start free trial
                </PillPrimary>
                <PillGhost href="/demo">Talk to sales</PillGhost>
              </div>
            </BlurRise>
          </Band>
        </section>

        {/* Individual plans */}
        <Band className="pb-8">
          <BlurRise className="text-center">
            <Eyebrow className="justify-center">For individual agents</Eyebrow>
          </BlurRise>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            {INDIVIDUAL.map((c, i) => (
              <BlurRise key={c.id} delay={i * 0.06}>
                <PlanCard card={c} />
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
                <PlanCard card={c} />
              </BlurRise>
            ))}
          </div>
        </Band>

        {/* Brokerage expansion */}
        <Band className="py-16 sm:py-20">
          <BlurRise className="mx-auto max-w-3xl">
            <div className="text-center">
              <Eyebrow className="justify-center">Brokerage expansion</Eyebrow>
              <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
                Add an agent. Billing updates itself.
              </Serif>
            </div>
            <div className="mt-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-white/45">
                    <th className="px-5 py-3.5 font-medium">Agents</th>
                    <th className="px-5 py-3.5 font-medium tabular-nums">Monthly / agent</th>
                    <th className="px-5 py-3.5 font-medium tabular-nums">Annual / agent</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPANSION.map((row) => (
                    <tr key={row.range} className="border-b border-white/[0.06] last:border-0">
                      <td className="px-5 py-3.5 text-white/80">{row.range}</td>
                      <td className="px-5 py-3.5 tabular-nums text-white/80">${row.mo}</td>
                      <td className="px-5 py-3.5 tabular-nums text-white/80">${row.yr}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="px-5 py-3.5 text-white/80">200+ agents</td>
                    <td className="px-5 py-3.5 text-white/45" colSpan={2}>
                      Custom, performance pricing available.{' '}
                      <Link href="/demo" className="font-medium text-[#ff9a6e] hover:underline">
                        Talk to sales
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </BlurRise>
        </Band>

        {/* Credits explainer + top-ups */}
        <Band className="py-16 sm:py-20">
          <BlurRise className="mx-auto max-w-3xl">
            <div className="text-center">
              <Eyebrow className="justify-center">Premium AI workflows</Eyebrow>
              <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
                Credits are spent when Chippi does real work.
              </Serif>
              <p className="mt-5 text-[14px] leading-relaxed text-white/55">
                Every plan includes a monthly credit balance. High-value actions cost more, routine ones
                cost little. Unused credits roll over for 30 days.
              </p>
            </div>
            <ul className="mt-8 divide-y divide-white/[0.06] overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
              {(Object.keys(WORKFLOW_CREDIT_COST) as (keyof typeof WORKFLOW_CREDIT_COST)[])
                .filter((k) => k in WORKFLOW_LABELS)
                .map((k) => (
                  <li key={k} className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-[13.5px] text-white/80">{WORKFLOW_LABELS[k]}</span>
                    <span className="text-[13px] tabular-nums text-white/45">
                      {WORKFLOW_CREDIT_COST[k]} {WORKFLOW_CREDIT_COST[k] === 1 ? 'credit' : 'credits'}
                    </span>
                  </li>
                ))}
            </ul>

            <p className="mt-10 text-center">
              <Eyebrow className="justify-center">Need more? One-time top-ups</Eyebrow>
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {Object.values(TOPUPS).map((t) => (
                <div key={t.id} className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5">
                  <p className="text-[13.5px] font-medium text-white">{t.label}</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white">
                    {t.credits.toLocaleString()}
                  </p>
                  <p className="mt-1 text-[12px] text-white/45">credits, ${t.price} one-time</p>
                </div>
              ))}
            </div>
          </BlurRise>
        </Band>

        {/* FAQ */}
        <Band className="py-16 sm:py-20">
          <BlurRise className="mx-auto max-w-3xl text-center">
            <Eyebrow className="justify-center">Questions</Eyebrow>
            <Serif className="mt-5 text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.08] text-white">
              What people ask first.
            </Serif>
          </BlurRise>
          <ul className="mx-auto mt-12 max-w-3xl divide-y divide-white/[0.08]">
            {FAQ.map((item, i) => (
              <BlurRise key={item.q} delay={i * 0.04}>
                <li className="py-7">
                  <p style={{ fontFamily: 'var(--font-sans)' }} className="text-[15px] font-semibold text-white">
                    {item.q}
                  </p>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-white/55">{item.a}</p>
                </li>
              </BlurRise>
            ))}
          </ul>
        </Band>

        {/* Closing CTA */}
        <Band className="pb-28 pt-4 sm:pb-36">
          <BlurRise className="mx-auto max-w-2xl text-center">
            <Serif className="text-[clamp(1.9rem,3.8vw,3rem)] leading-[1.06] text-white">
              Try Chippi free for 7 days.
            </Serif>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
              Bring your inbox and let Chippi start working the leads today. Card required, cancel
              anytime before day 7 at no charge.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PillPrimary href={SIGNUP} withArrow>
                Start free trial
              </PillPrimary>
              <PillGhost href="/demo">Book a demo</PillGhost>
            </div>
          </BlurRise>
        </Band>
      </div>
    </>
  );
}
