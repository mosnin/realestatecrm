/**
 * `/brokerages` — the floor story, on the white + pastel system.
 *
 * Arc: PageHero ("Every agent on your floor, with a Chippi behind them") →
 * routing/visibility/roles as a features-split-style section (copy beside
 * a composed skeleton illustration: lead routed → agent assigned → broker
 * view) → the pastel gradient pillars card (Routing, Floor view,
 * Role-based control as white glass cells, honest enterprise notes) →
 * the centered closing CTA. Brokers buy through a walkthrough, so the
 * closing primary is "Book a demo".
 *
 * Layout law: open white split → pastel gradient card → open CTA, with
 * mt-24 sm:mt-32 air between beats. No stock photography, no mock-UI
 * panels. Honesty: Chippi drafts; every send goes through the agent.
 */

import Link from 'next/link';
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';

export const metadata = {
  title: 'For brokerages · Chippi',
  description:
    'Give every agent on the floor a Chippi — leads routed to the right agent, approval-first drafts, and a live floor view with role-based controls and an audit log.',
};

/* ── Copy ──────────────────────────────────────────────────────────────── */

const FLOOR_FEATURES = [
  {
    icon: ArrowRightLeft,
    title: 'Routing on arrival',
    body: 'Auto-assign by territory and load, or hand-pick the agent and write the brief. Every assignment is logged with the reason.',
  },
  {
    icon: Users,
    title: 'The floor on one screen',
    body: 'Deals active, drafts pending, follow-ups due — per agent, read live from the work itself, not a status meeting.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles that keep it clean',
    body: 'Owner, admin, and member — three roles, no permissions matrix. Each agent keeps their own workspace; you get the rollup.',
  },
];

const PILLARS = [
  {
    icon: ArrowRightLeft,
    title: 'Routing',
    body: 'Every lead lands with the right agent — by territory, by load, or by your hand-pick. The reason is logged either way.',
  },
  {
    icon: Users,
    title: 'Floor view',
    body: 'Who is closing, what stalled, which follow-ups slipped — the whole room on one surface, live from the work.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based control',
    body: 'Roles decide who sees what. Private drafts and notes stay private; the aggregate numbers stay yours.',
  },
];

const ENTERPRISE_NOTES = [
  'Approval-first — drafts wait for the agent',
  'Role-based controls for owners and admins',
  'An audit log of every action Chippi takes',
];

/* ── Shared bits ───────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      <span aria-hidden className="text-[#ff4b29]">
        ✦
      </span>
      {children}
    </p>
  );
}

/* ── Floor flow — skeleton illustration (routed → assigned → broker) ───── */

function FloorIllustration() {
  return (
    <div className="relative h-64 rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] ring-1 ring-inset ring-black/5 sm:h-72">
      {/* New lead */}
      <div className="absolute left-3 top-4 w-[42%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:left-5 sm:top-5">
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
          <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">NEW LEAD</span>
          <span className="text-[9px] text-amber-600">Routing</span>
        </div>
        <div className="space-y-1.5 p-2">
          <div className="flex items-center gap-2 text-[9px] text-neutral-700 sm:text-[10px]">
            <span className="h-2 w-2 flex-shrink-0 rounded bg-yellow-500" />
            <span className="truncate">Maya · buyer</span>
          </div>
          <div className="h-1.5 w-full rounded bg-neutral-100" />
          <div className="h-1.5 w-3/4 rounded bg-neutral-100" />
        </div>
      </div>

      {/* Flow: routed */}
      <div className="absolute left-1/2 top-[20%] z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm">
        <ArrowRightLeft className="h-3 w-3 text-[#ff4b29]" />
      </div>

      {/* Assigned */}
      <div className="absolute right-3 top-10 w-[44%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:right-5">
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
          <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">ASSIGNED</span>
          <span className="h-2 w-2 rounded-full bg-green-500/70" />
        </div>
        <div className="space-y-2 p-2">
          <div className="flex items-center gap-2 text-[9px] text-neutral-700 sm:text-[10px]">
            <span className="h-4 w-4 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29] ring-2 ring-white" />
            <span className="truncate">J. Alvarez</span>
          </div>
          <div className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
            Draft ready to review
          </div>
        </div>
      </div>

      {/* Flow: into the broker view */}
      <div className="absolute right-[24%] top-[56%] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm">
        <ArrowRight className="h-3 w-3 rotate-90 text-[#ff4b29]" />
      </div>

      {/* Broker view */}
      <div className="absolute bottom-4 left-1/2 w-[80%] -translate-x-1/2 rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
          <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">FLOOR VIEW</span>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[9px] text-neutral-600">Broker</span>
        </div>
        <div className="space-y-1 p-2">
          <div className="flex items-center justify-between text-[9px] sm:text-[10px]">
            <span className="flex items-center gap-2 text-neutral-700">
              <span className="h-3 w-3 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
              <span className="truncate">Alvarez</span>
            </span>
            <span className="text-amber-600">Draft pending</span>
          </div>
          <div className="flex items-center justify-between text-[9px] sm:text-[10px]">
            <span className="flex items-center gap-2 text-neutral-700">
              <span className="h-3 w-3 flex-shrink-0 rounded-full bg-gradient-to-r from-green-400 to-green-600" />
              <span className="truncate">Chen</span>
            </span>
            <span className="text-green-600">Tour booked</span>
          </div>
          <div className="flex items-center justify-between text-[9px] sm:text-[10px]">
            <span className="flex items-center gap-2 text-neutral-700">
              <span className="h-3 w-3 flex-shrink-0 rounded-full bg-gradient-to-r from-purple-400 to-purple-600" />
              <span className="truncate">Patel</span>
            </span>
            <span className="text-blue-600">Follow-up due</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function BrokeragesPage() {
  return (
    <div>
      <PageHero
        eyebrow="For brokerages & teams"
        title="Every agent on your floor, with a Chippi behind them"
        sub="Leads route to the right agent, every send stays approval-first, and you see the whole floor on one surface — live from the work, not a status meeting."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* The floor flow — open white split, air after the hero */}
      <section className="pt-12 sm:pt-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Copy, stats, CTA */}
            <div>
              <Eyebrow>The floor</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                Every lead routed, every deal visible, every send approved.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                Chippi adds a brokerage layer on top of each agent&apos;s
                workspace: routing on the way in, a live floor view on the way
                through, and roles that keep the lines clean.
              </p>

              <div className="mt-8 space-y-5 border-t border-neutral-200 pt-6">
                {FLOOR_FEATURES.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                      <Icon className="h-4 w-4 text-[#ff4b29]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-zinc-950">{title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-600">{body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-neutral-200 pt-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                    <p className="mt-1 text-xs text-neutral-600">
                      Approval-first — every send goes through the agent whose name is on it
                    </p>
                  </div>
                  <div>
                    <span className="text-2xl font-semibold tracking-tight text-zinc-950">50+</span>
                    <p className="mt-1 text-xs text-neutral-600">
                      Integrations across email, calendar, and lead sources
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-neutral-200 pt-6">
                <Link
                  href="/demo"
                  className="inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-xl border-0 bg-gradient-to-b from-neutral-700 to-neutral-900 px-5 pb-2.5 pt-2.5 text-center align-baseline text-base leading-none text-white no-underline shadow-[0_2.8px_2.2px_rgba(0,_0,_0,_0.034),_0_6.7px_5.3px_rgba(0,_0,_0,_0.048),_0_12.5px_10px_rgba(0,_0,_0,_0.06),_0_22.3px_17.9px_rgba(0,_0,_0,_0.072),_0_41.8px_33.4px_rgba(0,_0,_0,_0.086),_0_100px_80px_rgba(0,_0,_0,_0.12)] outline-none transition-all duration-150 hover:opacity-85 focus:outline-none focus:ring-4 focus:ring-black/50"
                >
                  Book a demo
                </Link>
              </div>
            </div>

            {/* Illustration — pastel frame, white glass card */}
            <div className="relative rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
              <article
                className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
                style={{
                  background: 'rgba(255, 255, 255, 0.72)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.65)',
                }}
              >
                <div className="p-6 sm:p-10">
                  <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                    <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">
                      Floor flow
                    </h3>
                    <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                      <Users className="h-4 w-4 text-[#ff4b29]" />
                      Broker view
                    </span>
                  </div>

                  <FloorIllustration />

                  <p className="mt-6 text-sm text-neutral-500">
                    A lead lands, the right agent gets it, and you see it happen —
                    with the reason logged.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* The pillars — pastel gradient card, white glass cells */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
            {/* Pastel decor orbs */}
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />

            <div className="relative p-6 sm:p-10 lg:p-14">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[11px] text-neutral-600">
                {'// THE BROKERAGE LAYER'}
              </span>
              <h2 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                Three pillars hold the floor
              </h2>
              <p className="mt-4 max-w-2xl text-base text-neutral-600 md:text-lg">
                Routing on the way in, visibility on the way through, control
                over who sees what — with approval-first underneath all three.
              </p>

              <div className="mt-10 grid gap-6 md:grid-cols-3">
                {PILLARS.map(({ icon: Icon, title, body }) => (
                  <div
                    key={title}
                    className="rounded-2xl bg-white/80 p-6 ring-1 ring-black/5 backdrop-blur"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                      <Icon className="h-5 w-5 text-[#ff4b29]" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight text-zinc-950">
                      {title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-600">{body}</p>
                  </div>
                ))}
              </div>

              {/* Honest enterprise notes */}
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-black/10 pt-6">
                {ENTERPRISE_NOTES.map((note) => (
                  <span key={note} className="flex items-center gap-2 text-sm text-neutral-700">
                    <Check className="h-4 w-4 flex-shrink-0 text-[#ff4b29]" />
                    {note}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The ask — centered closing CTA, demo-first for brokers */}
      <section className="mt-24 px-6 pb-8 sm:mt-32 sm:pb-12">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Put a Chippi behind every agent.
          </h2>
          <div className="mt-8 flex justify-center">
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Book a demo
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-4 text-sm text-neutral-500">
            7 days free, then $97/mo. Cancel anytime.
          </p>
        </div>
      </section>
    </div>
  );
}
