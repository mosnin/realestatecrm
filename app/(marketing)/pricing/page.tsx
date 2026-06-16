/**
 * `/pricing`, Chippi V2 tiers on the dark cinematic redesign system (matches
 * /company and the rest of the marketing site). Server component (exports
 * metadata).
 *
 * No free tier shown: every plan starts with a 7-day trial that requires a card.
 * The plan cards + Monthly/Annual toggle live in the PricingPlans client
 * component; the rest (expansion, credits, FAQ) is server-rendered here.
 *
 * Numbers come from `lib/plans` so the page can't drift from the product's
 * source of truth. Cinematic sections live in a forced-dark wrapper.
 */

import Link from 'next/link';
import { WORKFLOW_CREDIT_COST, TOPUPS } from '@/lib/plans';
import { PricingPlans } from '@/components/marketing/giga/pricing-plans';
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
          <Band className="pt-40 pb-16 text-center sm:pt-48 sm:pb-20">
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
          </Band>
        </section>

        {/* Plan cards + Monthly/Annual toggle */}
        <PricingPlans />

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
