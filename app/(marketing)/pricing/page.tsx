/**
 * `/pricing` — Chippi V2 tiers on the calm site system.
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
import { TITLE_FONT } from '@/lib/typography';
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
      className={`flex flex-col rounded-xl border bg-card p-7 ${
        card.featured ? 'border-brand/50 ring-1 ring-brand/20' : 'border-border/70'
      }`}
    >
      {card.featured ? (
        <span className="mb-4 inline-flex w-fit items-center rounded-full bg-brand-subtle px-2.5 py-0.5 text-[11px] font-medium text-brand">
          Most popular
        </span>
      ) : null}
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {p.label}
      </p>
      <p style={TITLE_FONT} className="mt-3 text-[40px] leading-none tracking-tight text-foreground">
        ${p.priceMonthly}
        <span className="text-base font-normal text-muted-foreground"> /mo</span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {p.includedUsers > 1 ? `${p.includedUsers} users included` : 'for one agent'}
      </p>
      <p className="mt-5 text-sm text-foreground/85">{card.blurb}</p>
      <p className="mt-5 text-sm">
        <span style={TITLE_FONT} className="text-xl text-foreground">
          {p.monthlyCredits.toLocaleString()}
        </span>{' '}
        <span className="text-muted-foreground">credits / month</span>
      </p>
      {p.addUser ? (
        <p className="mt-1 text-xs text-muted-foreground">
          +${p.addUser.priceMonthly}/user · +{p.addUser.credits.toLocaleString()} credits
        </p>
      ) : null}
      <Link
        href={card.cta.href}
        className="mt-7 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
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
      <section className="bg-background px-4 pt-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              For individual agents
            </p>
          </Reveal>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {INDIVIDUAL.map((c, i) => (
              <Reveal key={c.id} delay={i * 0.05}>
                <PlanCard card={c} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Team plans */}
      <section className="bg-background px-4 pt-16 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              For teams
            </p>
          </Reveal>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {TEAM.map((c, i) => (
              <Reveal key={c.id} delay={i * 0.05}>
                <PlanCard card={c} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Brokerage expansion */}
      <section className="bg-background px-4 pt-20 sm:px-6">
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Brokerage expansion
          </p>
          <h2 style={TITLE_FONT} className="mt-3 text-[28px] tracking-tight text-foreground sm:text-[34px]">
            Add an agent. Billing updates automatically.
          </h2>
          <div className="mt-8 overflow-hidden rounded-xl border border-border/70">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Agents</th>
                  <th className="px-5 py-3 font-medium tabular-nums">Monthly / agent</th>
                  <th className="px-5 py-3 font-medium tabular-nums">Annual / agent</th>
                </tr>
              </thead>
              <tbody>
                {EXPANSION.map((row) => (
                  <tr key={row.range} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 text-foreground">{row.range}</td>
                    <td className="px-5 py-3 tabular-nums text-foreground">${row.mo}</td>
                    <td className="px-5 py-3 tabular-nums text-foreground">${row.yr}</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-5 py-3 text-foreground">200+ agents</td>
                  <td className="px-5 py-3 text-muted-foreground" colSpan={2}>
                    Custom — performance pricing available.{' '}
                    <Link href="/demo" className="text-brand hover:underline">Talk to sales</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      {/* Credits explainer + top-ups */}
      <section className="bg-background px-4 pt-20 sm:px-6">
        <Reveal className="mx-auto max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Premium AI workflows
          </p>
          <h2 style={TITLE_FONT} className="mt-3 text-[28px] tracking-tight text-foreground sm:text-[34px]">
            Credits are spent when Chippi does real work.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Every plan includes a monthly credit balance. High-value actions cost more; routine ones cost little. Unused credits roll over for 30 days.
          </p>
          <ul className="mt-8 divide-y divide-border/60 border-y border-border/60">
            {(Object.keys(WORKFLOW_CREDIT_COST) as (keyof typeof WORKFLOW_CREDIT_COST)[])
              .filter((k) => k in WORKFLOW_LABELS)
              .map((k) => (
                <li key={k} className="flex items-center justify-between py-3">
                  <span className="text-sm text-foreground">{WORKFLOW_LABELS[k]}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {WORKFLOW_CREDIT_COST[k]} {WORKFLOW_CREDIT_COST[k] === 1 ? 'credit' : 'credits'}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Need more? One-time top-ups
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {Object.values(TOPUPS).map((t) => (
              <div key={t.id} className="rounded-xl border border-border/70 bg-card p-5">
                <p className="text-sm font-medium text-foreground">{t.label}</p>
                <p style={TITLE_FONT} className="mt-2 text-2xl tabular-nums text-foreground">
                  {t.credits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">credits · ${t.price} one-time</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="bg-background px-4 py-24 sm:px-6 sm:py-28">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Questions
            </p>
            <h2 style={TITLE_FONT} className="mt-4 text-3xl tracking-tight text-foreground sm:text-[2.5rem]">
              What people ask first.
            </h2>
          </Reveal>
          <ul className="mt-12 divide-y divide-border/60 border-y border-border/60">
            {FAQ.map((item) => (
              <li key={item.q} className="py-7">
                <p className="text-base font-medium text-foreground">{item.q}</p>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-background px-4 pb-24 sm:px-6 sm:pb-32">
        <Reveal className="mx-auto max-w-5xl">
          <div className="rounded-marketing-3xl border border-border/70 bg-muted/20 px-6 py-16 text-center sm:px-10">
            <h2 style={TITLE_FONT} className="mx-auto max-w-xl text-3xl leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
              Try Chippi free for 7 days.
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={SIGNUP}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-6 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex h-11 items-center justify-center rounded-full border border-border/70 bg-background px-6 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-foreground/[0.04]"
              >
                Book a demo
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Card required · cancel anytime before day 7 at no charge.
            </p>
          </div>
        </Reveal>
      </section>
    </>
  );
}
