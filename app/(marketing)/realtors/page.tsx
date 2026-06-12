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
  Link2,
  MessageSquare,
  PenLine,
  ShieldCheck,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import {
  EyebrowChip,
  FadeUp,
  Section,
  Stagger,
  StaggerItem,
} from '@/components/marketing/site/section';
import { FeatureList } from '@/components/marketing/site/home/feature-list';

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

/* Honest signal stats for the vermillion break-band — the same three claims
 * this site already stands behind, nothing invented. */
const BAND_STATS: { value: string; label: string }[] = [
  { value: '24/7', label: 'Working your book around the clock' },
  { value: '100%', label: 'Approval-first — nothing sends without your tap' },
  { value: '50+', label: 'Tools connect in two minutes' },
];

/* The first day, in three steps — white shadow steps, tinted-circle icons. */
const START_STEPS: { n: string; icon: typeof Inbox; title: string; body: string }[] = [
  {
    n: '01',
    icon: Link2,
    title: 'Connect your inbox',
    body: 'Link Gmail or Outlook and your calendar in two minutes. Chippi learns your voice from how you already write.',
  },
  {
    n: '02',
    icon: PenLine,
    title: 'Chippi drafts the replies',
    body: 'Every inbound is read and scored, the reply written in your voice, and tour times proposed from your real availability.',
  },
  {
    n: '03',
    icon: ShieldCheck,
    title: 'You tap to send',
    body: 'Approve, edit, or skip. The tour books, the thread updates, and the whole move lands in a plain-language log.',
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

/* ── Stack illustration — connected tools feeding one loop ─────────────── */

const STACK_ROWS: { icon: typeof Inbox; label: string; note: string }[] = [
  { icon: Inbox, label: 'Inbox', note: 'Gmail · Outlook' },
  { icon: CalendarCheck, label: 'Calendar', note: 'Google · Calendly' },
  { icon: MessageSquare, label: 'CRM', note: 'HubSpot · Salesforce' },
  { icon: PenLine, label: 'E-sign', note: 'DocuSign' },
];

function StackIllustration() {
  return (
    <div className="rounded-3xl bg-white/70 p-4 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.18)] ring-1 ring-black/5 backdrop-blur sm:p-5">
      <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] tracking-widest text-neutral-500">CONNECTED</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black/5 bg-white/90 px-2 py-0.5 text-[9px] text-neutral-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500/80" />
            OAuth · live
          </span>
        </div>

        {/* Connected tools */}
        <div className="space-y-2">
          {STACK_ROWS.map(({ icon: Icon, label, note }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/90 px-3 py-2 shadow-sm"
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                <Icon className="h-3.5 w-3.5 text-[#ff4b29]" />
              </div>
              <span className="text-[11px] font-semibold text-zinc-950">{label}</span>
              <span className="ml-auto truncate pl-2 text-[10px] text-neutral-500">{note}</span>
            </div>
          ))}
        </div>

        {/* Funnel into Chippi */}
        <div className="mt-3 flex items-center justify-center">
          <ArrowRight className="h-3.5 w-3.5 rotate-90 text-[#ff4b29]" />
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/90 px-3 py-2.5 shadow-sm">
          <span className="h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-zinc-950">Chippi</div>
            <div className="text-[10px] text-neutral-500">Reaches for each tool as it works</div>
          </div>
          <ShieldCheck className="ml-auto h-4 w-4 flex-shrink-0 text-[#ff4b29]" />
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

      {/* Signal break-band — vermillion, to snap the white run between the
          bento and the feature list. Honest stats only. */}
      <div className="mt-24 sm:mt-32">
        <Section tone="brand">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-end lg:justify-between">
            <FadeUp className="max-w-xl">
              <EyebrowChip light>The promise</EyebrowChip>
              <h2 className="mt-5 text-balance text-[2rem] font-semibold leading-[1.05] tracking-tight text-white sm:text-[2.75rem]">
                You close the deals. Chippi works the hours in between.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 sm:text-lg">
                Every reply still waits for your name on it. Chippi just makes
                sure there is always one ready.
              </p>
            </FadeUp>
            <Stagger className="grid flex-shrink-0 grid-cols-3 gap-8 sm:gap-12">
              {BAND_STATS.map((s) => (
                <StaggerItem key={s.label}>
                  <p className="text-[clamp(2.25rem,5vw,3.5rem)] font-semibold leading-none tracking-tight text-white">
                    {s.value}
                  </p>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                    {s.label}
                  </p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Section>
      </div>

      {/* The first day — white shadow steps, tinted-circle icons */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
              <span aria-hidden className="text-[#ff4b29]">✦</span>
              Getting started
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Live by this afternoon.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              No migration, no onboarding call. Connect the inbox you already
              use and Chippi starts working the leads today.
            </p>
          </FadeUp>
          <Stagger className="mt-12 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {START_STEPS.map(({ n, icon: Icon, title, body }) => (
              <StaggerItem key={n} className="h-full">
                <div className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                      <Icon className="h-4 w-4 text-[#ff4b29]" />
                    </div>
                    <span className="text-sm font-semibold tracking-[0.14em] text-[#ff4b29]">
                      {n}
                    </span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                    {title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-500">{body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Plugs into your stack — pastel-gradient band, the color break that
          snaps the white run between the white steps and the white feature
          list. Soft pastel wash + a page-local skeleton of the connected
          stack. Honest counts: 50+ tools, two minutes to connect. */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <FadeUp>
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />
            <div className="relative grid items-center gap-12 px-6 py-14 sm:px-10 sm:py-20 lg:grid-cols-2 lg:px-14">
              <div>
                <Eyebrow>Already in your stack</Eyebrow>
                <h2 className="mt-5 text-balance text-[2rem] font-semibold leading-[1.05] tracking-tight text-zinc-950 sm:text-[2.75rem]">
                  It works inside the tools you already pay for.
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-neutral-600 sm:text-lg">
                  Your inbox, your calendar, your CRM, your e-sign — Chippi
                  connects to each over OAuth and reaches for the right one as it
                  works. No migration, no rip-and-replace.
                </p>
                <div className="mt-8 grid max-w-md grid-cols-2 gap-6 border-t border-black/10 pt-6">
                  <div>
                    <span className="text-2xl font-semibold tracking-tight text-zinc-950">50+</span>
                    <p className="mt-1 text-xs text-neutral-600">Tools connect in two minutes</p>
                  </div>
                  <div>
                    <span className="text-2xl font-semibold tracking-tight text-zinc-950">OAuth</span>
                    <p className="mt-1 text-xs text-neutral-600">No keys to copy, no scripts to wire</p>
                  </div>
                </div>
                <div className="mt-8 border-t border-black/10 pt-6">
                  <Link
                    href="/integrations"
                    className="inline-flex items-center gap-2 text-sm font-medium text-zinc-950 transition-colors hover:text-neutral-600"
                  >
                    See every integration
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <StackIllustration />
            </div>
          </div>
        </FadeUp>
      </section>

      {/* Everything Chippi runs — interactive feature list */}
      <div className="mt-24 sm:mt-32">
        <FeatureList />
      </div>

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
