/**
 * `/pricing` — plan tiers, honest pricing.
 *
 * Solo ($97) and Pro Performer ($197) for individual agents; Team ($497) and
 * Team Plus ($897) bill the brokerage with per-seat expansion. There is NO
 * free tier — every plan starts with a 7-day Stripe trial (card collected at
 * checkout, charged when the trial ends).
 *
 * Numbers come from `lib/plans` so this page can't drift from what checkout
 * actually charges. Every plan gets the same product surface today — the
 * tiers differ by who they're for and how many seats they carry; don't add
 * feature-gate claims here unless the gate exists in code.
 */

import Link from 'next/link';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { TITLE_FONT, PRIMARY_PILL } from '@/lib/typography';
import { PLANS, type PlanId } from '@/lib/plans';

export const metadata = { title: 'Pricing · Chippi' };

const SIGNUP = '/login/realtor?intent=signup';

type Card = {
  id: PlanId;
  blurb: string;
  cta: { label: string; href: string };
  featured?: boolean;
};

const INDIVIDUAL: Card[] = [
  {
    id: 'solo',
    blurb: 'One agent, the whole surface. Chippi runs your book end to end.',
    cta: { label: 'Start Solo', href: SIGNUP },
  },
  {
    id: 'pro',
    blurb: 'For serious lead volume — the same agent, working a bigger book.',
    cta: { label: 'Start Pro', href: SIGNUP },
    featured: true,
  },
];

const TEAM: Card[] = [
  {
    id: 'team',
    blurb: 'Shared command center for the floor: routing, rollup, accountability.',
    cta: { label: 'Talk to sales', href: '/demo' },
  },
  {
    id: 'team_plus',
    blurb: 'Brokerage-level operations without enterprise complexity.',
    cta: { label: 'Talk to sales', href: '/demo' },
  },
];

/** Per-agent volume pricing as the floor grows (display; sales finalizes). */
const EXPANSION: { range: string; mo: number; yr: number }[] = [
  { range: '10–24 agents', mo: 69, yr: 56 },
  { range: '25–49 agents', mo: 59, yr: 48 },
  { range: '50–99 agents', mo: 49, yr: 40 },
  { range: '100–199 agents', mo: 39, yr: 32 },
];

const INCLUDED: string[] = [
  'The agent (Chippi runs the workspace)',
  'Email + calendar integrations (Gmail, Outlook, Google Calendar)',
  'Unlimited contacts, deals, properties',
  'File room with versioning',
  'Studio (content generation + scheduling)',
  'Realtime sync across devices',
  'Priority support',
  'All future updates included',
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What happens after the trial?',
    a: 'Your card is collected when you start the trial, and the plan begins automatically when the seven days end. Cancel before then and you pay nothing.',
  },
  {
    q: 'What’s the difference between the tiers?',
    a: 'Every plan gets the full product. Solo and Pro are for individual agents — Pro is sized for higher lead volume. Team and Team Plus bill the brokerage, include seats for the floor, and add per-agent expansion as you grow.',
  },
  {
    q: 'How does brokerage pricing work?',
    a: 'Team plans include seats (5 on Team, 10 on Team Plus); additional agents are priced per seat, and the per-agent rate drops as the floor grows. Talk to sales and we’ll set up the team and migration.',
  },
];

function PlanCard({ card }: { card: Card }) {
  const p = PLANS[card.id];
  return (
    <div
      className={`flex flex-col rounded-2xl border p-8 ${
        card.featured ? 'border-brand/60' : 'border-border/70'
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {p.label}
      </p>
      <p style={TITLE_FONT} className="mt-4 text-[44px] leading-none tracking-[-0.02em] text-foreground">
        {`$${p.priceMonthly}`}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        per month
        {p.includedUsers > 1 ? ` · ${p.includedUsers} users` : ''}
      </p>
      <p className="mt-5 text-sm text-foreground/85">{card.blurb}</p>
      {p.addUser && (
        <p className="mt-3 text-xs text-muted-foreground">
          +${p.addUser.priceMonthly}/user beyond {p.includedUsers}
        </p>
      )}
      <div className="flex-1" />
      <Link href={card.cta.href} className={`${PRIMARY_PILL} mt-8 w-full justify-center`}>
        {card.cta.label}
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <MarketingHero
        eyebrow="PRICING"
        title="Pricing that scales with you."
        sub="Every plan starts with a 7-day free trial — card collected at checkout, charged when the trial ends. Solo and Pro for individual agents; Team plans bill the brokerage and grow per seat."
        primaryCta={{ label: 'Start free trial', href: SIGNUP }}
        secondaryCta={{ label: 'Talk to sales for teams', href: '/demo' }}
      />

      {/* Individual plans */}
      <section className="relative pb-16 md:pb-24">
        <div className="mx-auto max-w-4xl px-6 md:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            For individual agents
          </p>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {INDIVIDUAL.map((c) => (
              <PlanCard key={c.id} card={c} />
            ))}
          </div>
        </div>
      </section>

      {/* Team plans */}
      <section className="relative pb-16 md:pb-24">
        <div className="mx-auto max-w-4xl px-6 md:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            For teams &amp; brokerages
          </p>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {TEAM.map((c) => (
              <PlanCard key={c.id} card={c} />
            ))}
          </div>
        </div>
      </section>

      {/* Brokerage expansion */}
      <section className="relative pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl px-6 md:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Brokerage expansion
          </p>
          <h2 style={TITLE_FONT} className="mt-3 text-[28px] md:text-[36px] tracking-[-0.02em] text-foreground">
            Add an agent. The per-seat price drops as you grow.
          </h2>
          <div className="mt-8 overflow-hidden rounded-2xl border border-border/70">
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
                    Custom pricing.{' '}
                    <Link href="/demo" className="text-brand hover:underline">Talk to sales</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* What every plan includes */}
      <section className="relative pb-16 md:pb-24">
        <div className="mx-auto max-w-3xl px-6 md:px-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Every plan includes
          </p>
          <ul className="mt-6 grid gap-x-8 gap-y-2.5 text-sm text-foreground/85 sm:grid-cols-2">
            {INCLUDED.map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-2 h-1 w-1 rounded-full bg-foreground/70 flex-shrink-0"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <div className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Questions
            </p>
            <h2
              style={TITLE_FONT}
              className="mt-4 text-[34px] sm:text-[44px] tracking-[-0.02em] text-foreground"
            >
              What people ask first.
            </h2>
          </div>
          <ul className="mt-14 divide-y divide-border/60 border-t border-b border-border/60">
            {FAQ.map((item) => (
              <li key={item.q} className="py-8">
                <p className="text-base md:text-lg font-medium text-foreground">{item.q}</p>
                <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">{item.a}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days free, cancel anytime. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: SIGNUP }}
        secondaryCta={{ label: 'Talk to sales', href: '/demo' }}
      />
    </>
  );
}
