/**
 * `/pricing` — one plan, honest pricing.
 *
 * Apple-discipline: Chippi ships ONE plan at ONE price. We refuse the
 * 3-tier "Starter / Pro / Enterprise" pattern because it's a sales
 * tactic, not a customer service. "Configuration is failure to decide"
 * (STYLESHEET.md). For brokerages there is a single "Talk to sales"
 * track — one conversation link, not a fourth column.
 *
 * The page is a single column: hero → the pricing card → a quiet
 * anchor for brokerages → three honest FAQs → arrival CTA. No
 * checkmark grids, no monthly/annual toggle, no testimonials.
 *
 * Placeholder pricing: $79 / realtor / month after a 7-day trial.
 * The number renders in serif Times — the brand's quiet flourish —
 * because the price IS the page's focal element.
 */

import Link from 'next/link';
import { MarketingHero } from '@/components/marketing/marketing-hero';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { MarketingCTA } from '@/components/marketing/marketing-cta';
import { TITLE_FONT, PRIMARY_PILL } from '@/lib/typography';

export const metadata = { title: 'Pricing · Chippi' };

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
    q: 'Why one plan instead of tiers?',
    a: 'Tiers are a sales tactic, not a service. One plan, one price, the whole surface. If you outgrow the agent, you’ll tell us.',
  },
  {
    q: 'What happens after the trial?',
    a: 'You enter the plan automatically, but only if you’ve added a card. No card on file means the trial just ends; we don’t bill silently.',
  },
  {
    q: 'Brokerages: what changes?',
    a: 'The pricing scales by realtor. The agent doesn’t. Every realtor on your floor gets the same surface; admins see the rollup. Talk to us for migration.',
  },
];

export default function PricingPage() {
  return (
    <>
      <MarketingHero
        eyebrow="PRICING"
        title="One plan. Honest pricing."
        sub="Start with a seven-day free trial. After that, a single monthly price that covers the agent, the integrations, and the surface. No seats math, no feature gates."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales for teams', href: '/demo' }}
      />

      {/* The pricing card — the page's focal element. */}
      <section className="relative pb-24 md:pb-32">
        <div className="mx-auto max-w-xl px-6 md:px-8">
          <div className="rounded-2xl border border-border/70 p-10 md:p-14 text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              The plan
            </p>
            <p
              style={TITLE_FONT}
              className="mt-2 text-3xl tracking-tight text-foreground"
            >
              Chippi
            </p>
            <p
              style={TITLE_FONT}
              className="mt-8 text-[60px] md:text-[80px] leading-none tracking-[-0.02em] text-foreground"
            >
              $79
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              per realtor / month, after the 7-day trial.
            </p>

            <div className="border-t border-border/60 my-10" />

            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground text-left">
              What&rsquo;s included
            </p>
            <ul className="mt-5 space-y-2 text-sm text-foreground/85 text-left">
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

            <Link
              href="/login/realtor?intent=signup"
              className={`${PRIMARY_PILL} mt-10 w-full justify-center`}
            >
              Start free trial
            </Link>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card required. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* Quiet anchor for brokerages. */}
      <MarketingSection
        stacked
        eyebrow="FOR BROKERAGES"
        title="Talk to us about the floor."
        sub="Brokerages pay by realtor with volume pricing. We’ll talk through migration and onboarding the team."
        learnMore={{ label: 'Talk to sales', href: '/demo' }}
      />

      {/* FAQ — three questions, hairline-divided, all visible at once. */}
      <section className="relative py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <div className="text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Questions
            </p>
            <h2
              style={TITLE_FONT}
              className="mt-4 text-[34px] sm:text-[44px] md:text-[56px] leading-[1.05] tracking-[-0.02em] text-foreground"
            >
              What people ask first.
            </h2>
          </div>
          <ul className="mt-16 divide-y divide-border/60 border-t border-b border-border/60">
            {FAQ.map((item) => (
              <li key={item.q} className="py-8">
                <p className="text-base md:text-lg font-medium text-foreground">
                  {item.q}
                </p>
                <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">
                  {item.a}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <MarketingCTA
        title="Start your free trial."
        sub="Seven days. No credit card. Bring your inbox and let Chippi do the rest."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Talk to sales', href: '/demo' }}
      />
    </>
  );
}
