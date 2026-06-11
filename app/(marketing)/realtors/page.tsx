/**
 * `/realtors` — the solo agent's story, on the white + pastel system.
 *
 * Arc: PageHero ("Your book, worked while you close") → the follow-up loop
 * as a features-split-style section (copy beside a composed skeleton
 * illustration: inbox → draft → booked) → the 2×2 owner-image bento →
 * the centered closing CTA.
 *
 * Layout law: open white split → white shadow cards → open CTA, with
 * mt-24 sm:mt-32 air between beats. No stock photography, no mock-UI
 * panels — owner image slots and skeleton illustrations only. Honesty:
 * Chippi drafts and proposes; the realtor approves every send.
 */

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  ImagePlus,
  Inbox,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';

export const metadata = {
  title: 'For realtors · Chippi',
  description:
    'Chippi works your book while you close — reading the inbox, drafting replies in your voice, and proposing tour times against your real calendar. Nothing sends without your tap.',
};

/* ── Copy ──────────────────────────────────────────────────────────────── */

const LOOP_FEATURES = [
  {
    icon: Inbox,
    title: 'Reads every inbound',
    body: 'Gmail or Outlook connects in minutes. Chippi reads each thread against your live deals and surfaces the one to answer first.',
  },
  {
    icon: MessageSquare,
    title: 'Drafts in your voice',
    body: 'The reply is waiting before you open the thread, written the way you actually write. Edit it, send it, or skip it.',
  },
  {
    icon: CalendarCheck,
    title: 'Books against your real calendar',
    body: 'Approve a time and the tour lands on the calendar, the confirmation goes back in the thread, and the deal updates itself.',
  },
];

const BENTO_CELLS = [
  {
    slot: 'realtor-inbox',
    title: 'Follow-up never slips.',
    sub: 'Chippi watches the inbox 24/7 and\nkeeps a next step on every thread.',
  },
  {
    slot: 'realtor-drafts',
    title: 'Drafts in your voice.',
    sub: 'Every reply written and waiting —\nsent only when you tap send.',
  },
  {
    slot: 'realtor-tours',
    title: 'Tours book themselves.',
    sub: 'Approve a time and the calendar,\nthe thread, and the deal all update.',
  },
  {
    slot: 'realtor-log',
    title: 'A log you can trust.',
    sub: 'Every action written down in plain\nlanguage — what happened, and why.',
  },
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

/** Owner image slot — exactly the FeaturesBento vocabulary. */
function ImageSlot({ name }: { name: string }) {
  return (
    <div
      data-slot={name}
      className="mt-8 flex h-64 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5 sm:h-72"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-5 w-5 text-neutral-300" />
        <p className="text-xs text-neutral-400">
          Image placeholder — <span className="font-medium text-neutral-500">{name}</span>
        </p>
      </div>
    </div>
  );
}

/* ── The loop — skeleton illustration (inbox → draft → booked) ─────────── */

function LoopIllustration() {
  return (
    <div className="relative h-64 rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] ring-1 ring-inset ring-black/5 sm:h-72">
      {/* Inbox */}
      <div className="absolute left-3 top-4 w-[46%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:left-5 sm:top-5">
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
          <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">INBOX</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500/70" />
            <span className="text-[9px] text-green-600">3 new</span>
          </span>
        </div>
        <div className="space-y-1.5 p-2">
          <div className="flex items-center gap-2 text-[9px] text-neutral-700 sm:text-[10px]">
            <span className="h-2 w-2 flex-shrink-0 rounded bg-blue-500" />
            <span className="truncate">Maya · 14 Oak St</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-neutral-700 sm:text-[10px]">
            <span className="h-2 w-2 flex-shrink-0 rounded bg-yellow-500" />
            <span className="truncate">Tom · refi question</span>
          </div>
          <div className="h-1.5 w-3/4 rounded bg-neutral-100" />
        </div>
      </div>

      {/* Flow: inbox → draft */}
      <div className="absolute left-1/2 top-[22%] z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm">
        <ArrowRight className="h-3 w-3 text-[#ff4b29]" />
      </div>

      {/* Draft */}
      <div className="absolute right-3 top-12 w-[44%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:right-5">
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
          <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">DRAFT</span>
          <span className="text-[9px] text-amber-600">Waiting</span>
        </div>
        <div className="space-y-2 p-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-[9px] text-neutral-500">Chippi · your voice</div>
              <div className="space-y-1 rounded-lg bg-black/5 px-2 py-1.5">
                <div className="h-1 w-full rounded bg-neutral-300" />
                <div className="h-1 w-4/5 rounded bg-neutral-300" />
              </div>
            </div>
          </div>
          <div className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700">
            Awaiting your tap
          </div>
        </div>
      </div>

      {/* Flow: draft → booked */}
      <div className="absolute right-[24%] top-[60%] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm">
        <ArrowRight className="h-3 w-3 rotate-90 text-[#ff4b29]" />
      </div>

      {/* Booked */}
      <div className="absolute bottom-4 left-1/2 w-[64%] -translate-x-1/2 rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
          <span className="text-[9px] tracking-widest text-neutral-500 sm:text-[10px]">BOOKED</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500/70" />
            <span className="text-[9px] text-green-600">Confirmed</span>
          </span>
        </div>
        <div className="flex items-center justify-between p-2 text-[9px] sm:text-[10px]">
          <span className="flex items-center gap-1.5 text-neutral-700">
            <CalendarCheck className="h-3 w-3 flex-shrink-0 text-[#ff4b29]" />
            Tour · Sat 2:00
          </span>
          <span className="truncate pl-2 text-neutral-500">Logged to the deal</span>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function RealtorsPage() {
  return (
    <div>
      <PageHero
        eyebrow="For solo realtors"
        title="Your book, worked while you close"
        sub="Chippi reads your inbox, drafts every reply in your voice, and proposes tour times against your real calendar. Nothing sends without your tap."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* The loop — open white split, air after the hero */}
      <section className="pt-12 sm:pt-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Copy, stats, CTA */}
            <div>
              <Eyebrow>The loop</Eyebrow>
              <h2 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                Inbox in. Draft ready. Tour booked.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                Chippi runs one loop all day: read the inbound, draft the reply
                in your voice, propose times from your real calendar. You
                approve — it logs the rest.
              </p>

              <div className="mt-8 space-y-5 border-t border-neutral-200 pt-6">
                {LOOP_FEATURES.map(({ icon: Icon, title, body }) => (
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
                    <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                    <p className="mt-1 text-xs text-neutral-600">
                      Chippi watches your book around the clock
                    </p>
                  </div>
                  <div>
                    <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                    <p className="mt-1 text-xs text-neutral-600">
                      Approval-first — nothing sends without your tap
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 border-t border-neutral-200 pt-6">
                <Link
                  href="/chippi"
                  className="inline-flex cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-xl border-0 bg-gradient-to-b from-neutral-700 to-neutral-900 px-5 pb-2.5 pt-2.5 text-center align-baseline text-base leading-none text-white no-underline shadow-[0_2.8px_2.2px_rgba(0,_0,_0,_0.034),_0_6.7px_5.3px_rgba(0,_0,_0,_0.048),_0_12.5px_10px_rgba(0,_0,_0,_0.06),_0_22.3px_17.9px_rgba(0,_0,_0,_0.072),_0_41.8px_33.4px_rgba(0,_0,_0,_0.086),_0_100px_80px_rgba(0,_0,_0,_0.12)] outline-none transition-all duration-150 hover:opacity-85 focus:outline-none focus:ring-4 focus:ring-black/50"
                >
                  See Chippi at work
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
                      The follow-up loop
                    </h3>
                    <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                      <ShieldCheck className="h-4 w-4 text-[#ff4b29]" />
                      Approval-first
                    </span>
                  </div>

                  <LoopIllustration />

                  <p className="mt-6 text-sm text-neutral-500">
                    Chippi drafts and proposes. You approve. The log writes itself.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      {/* The proof grid — 2×2 bento, owner image slots */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 sm:gap-8">
            {BENTO_CELLS.map((cell) => (
              <div
                key={cell.slot}
                className="rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9"
              >
                <h3 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {cell.title}
                </h3>
                <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-neutral-500">
                  {cell.sub}
                </p>
                <ImageSlot name={cell.slot} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The ask — centered closing CTA */}
      <section className="mt-24 px-6 pb-8 sm:mt-32 sm:pb-12">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Your next deal is already in the inbox.
          </h2>
          <div className="mt-8 flex justify-center">
            <Link
              href="/login/realtor?intent=signup"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
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
