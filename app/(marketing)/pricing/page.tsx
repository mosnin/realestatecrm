/**
 * `/pricing` — Chippi V2 tiers on the bold-canvas system.
 *
 * No free tier: every plan starts with a 7-day trial that requires a card.
 * Individuals (Solo / Pro), teams (Team / Team Plus), then brokerage expansion.
 * Premium AI workflows draw from a monthly credit balance.
 *
 * Numbers come from `lib/plans` so the page can't drift from the product's
 * source of truth.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { Reveal } from '@/components/marketing/site/reveal';
import { PLANS, WORKFLOW_CREDIT_COST, TOPUPS } from '@/lib/plans';

export const metadata = { title: 'Pricing · Chippi' };

const SIGNUP = '/login/realtor?intent=signup';

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

const EXPANSION: { range: string; mo: number; yr: number }[] = [
  { range: '10–24 agents', mo: 69, yr: 56 },
  { range: '25–49 agents', mo: 59, yr: 48 },
  { range: '50–99 agents', mo: 49, yr: 40 },
  { range: '100–199 agents', mo: 39, yr: 32 },
];

// Premium workflows shown on the table. `chat_turn` is intentionally omitted —
// the per-turn chat meter is an internal cost ceiling, not an advertised
// "premium workflow" (routine chat reads as ~free).
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
    a: 'No. Every plan starts with a 7-day free trial. A card is required to begin, you won’t be charged until the trial ends, and you can cancel anytime before then at no cost.',
  },
  {
    q: 'What are credits?',
    a: 'High-value agentic actions draw from a monthly credit balance — a full pipeline audit, a follow-up sequence, a lead qualification run. Routine actions cost little or nothing. Unused credits roll over for 30 days.',
  },
  {
    q: 'What happens when I run out of credits?',
    a: 'Buy a one-time top-up anytime, or move up a plan for a larger monthly allocation and a better rate. Your workspace never locks — only the premium AI workflows pause.',
  },
  {
    q: 'How does brokerage pricing work?',
    a: 'Add an agent and billing updates automatically — the per-agent price drops as the team grows. No tier jumping, no calls to sales until you want them.',
  },
];

function PlanCard({ card }: { card: Card }) {
  const p = PLANS[card.id];
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
      <p className="mt-3 text-[40px] font-semibold leading-none tracking-tight text-zinc-950">
        ${p.priceMonthly}
        <span className="text-base font-normal text-neutral-500"> /mo</span>
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        {p.includedUsers > 1 ? `${p.includedUsers} users included` : 'for one agent'}
      </p>
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

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Pricing that scales with your team."
        sub="Every plan starts with a 7-day free trial. Move up as you grow — premium AI workflows draw from a monthly credit balance, and brokerage pricing expands automatically as you add agents."
        primaryCta={{ label: 'Start free trial', href: SIGNUP }}
        secondaryCta={{ label: 'Talk to sales', href: '/demo' }}
      />

      {/* Individual plans */}
      <section className="px-4 pt-8 sm:px-6 sm:pt-12">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              For individual agents
            </p>
          </Reveal>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {INDIVIDUAL.map((c, i) => (
              <Reveal key={c.id} delay={i * 0.05}>
                <PlanCard card={c} />
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
                <PlanCard card={c} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Brokerage expansion */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Brokerage expansion
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Add an agent. Billing updates automatically.
          </h2>
          <div className="mt-8 overflow-hidden rounded-2xl bg-white shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-neutral-500">
                  <th className="px-5 py-3 font-medium">Agents</th>
                  <th className="px-5 py-3 font-medium tabular-nums">Monthly / agent</th>
                  <th className="px-5 py-3 font-medium tabular-nums">Annual / agent</th>
                </tr>
              </thead>
              <tbody>
                {EXPANSION.map((row) => (
                  <tr key={row.range} className="border-b border-black/5 last:border-0">
                    <td className="px-5 py-3 text-zinc-950">{row.range}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-950">${row.mo}</td>
                    <td className="px-5 py-3 tabular-nums text-zinc-950">${row.yr}</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-5 py-3 text-zinc-950">200+ agents</td>
                  <td className="px-5 py-3 text-neutral-500" colSpan={2}>
                    Custom — performance pricing available.{' '}
                    <Link href="/demo" className="font-medium text-[#ff4b29] hover:underline">Talk to sales</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      {/* Credits explainer + top-ups */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Premium AI workflows
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Credits are spent when Chippi does real work.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-neutral-600">
            Every plan includes a monthly credit balance. High-value actions cost more; routine ones cost little. Unused credits roll over for 30 days.
          </p>
          <ul className="mt-8 divide-y divide-black/5 overflow-hidden rounded-2xl bg-white shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
            {(Object.keys(WORKFLOW_CREDIT_COST) as (keyof typeof WORKFLOW_CREDIT_COST)[])
              .filter((k) => k in WORKFLOW_LABELS)
              .map((k) => (
                <li key={k} className="flex items-center justify-between px-5 py-3.5">
                  <span className="text-sm text-zinc-950">{WORKFLOW_LABELS[k]}</span>
                  <span className="text-sm tabular-nums text-neutral-500">
                    {WORKFLOW_CREDIT_COST[k]} {WORKFLOW_CREDIT_COST[k] === 1 ? 'credit' : 'credits'}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-10 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            Need more? One-time top-ups
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {Object.values(TOPUPS).map((t) => (
              <div key={t.id} className="rounded-2xl bg-white p-5 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
                <p className="text-sm font-medium text-zinc-950">{t.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-950">
                  {t.credits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-neutral-500">credits · ${t.price} one-time</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              Questions
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              What people ask first.
            </h2>
          </Reveal>
          <ul className="mt-12 divide-y divide-black/5">
            {FAQ.map((item) => (
              <li key={item.q} className="py-7">
                <p className="text-base font-semibold text-zinc-950">{item.q}</p>
                <p className="mt-2.5 text-sm leading-relaxed text-neutral-600">{item.a}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mt-24 px-4 pb-24 sm:mt-32 sm:px-6 sm:pb-32">
        <Reveal className="mx-auto max-w-5xl">
          <div className="rounded-[2rem] bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] px-6 py-16 text-center shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:px-10">
            <h2 className="mx-auto max-w-xl text-3xl font-semibold leading-tight tracking-tight text-zinc-950 sm:text-4xl">
              Try Chippi free for 7 days.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={SIGNUP}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex h-12 items-center justify-center rounded-full border border-black/10 bg-white px-7 text-[15px] font-semibold text-zinc-950 transition-colors duration-150 hover:bg-black/[0.04]"
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-4 text-xs text-neutral-500">
              Card required · cancel anytime before day 7 at no charge.
            </p>
          </div>
        </Reveal>
      </section>
    </>
  );
}
