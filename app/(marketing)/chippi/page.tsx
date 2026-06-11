/**
 * `/chippi` — Meet Chippi. PageHero ("Not another tool. A teammate.") →
 * what Chippi does (open split: the five verbs + a skeleton illustration in
 * the pastel frame) → where it works (trio of white shadow cards into
 * /realtors /deals /studio) → the approval promise (pastel card) → CTA.
 * White canvas, Bricolage inherited, mt-24/32 air between every beat.
 */

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  Gauge,
  Inbox,
  PenLine,
} from 'lucide-react';
import { PageHero } from '@/components/marketing/site/page-hero';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';

export const metadata = {
  title: 'Meet Chippi',
  description:
    'Chippi is the agent inside your CRM — it reads every inbound, scores it with the reason, drafts in your voice, books against your real calendar, and logs it all in plain language. Nothing sends without your approval.',
};

/* What Chippi does — the five verbs, features-split list style. */
const VERBS = [
  {
    icon: Inbox,
    title: 'Reads',
    body: 'Every inbound read the moment it lands, with the history already in context.',
  },
  {
    icon: Gauge,
    title: 'Scores',
    body: 'Hot, warm, cold — with the reason, so you call the right person first.',
  },
  {
    icon: PenLine,
    title: 'Drafts',
    body: 'A reply in your voice, waiting for your tap. Edit, send, or skip.',
  },
  {
    icon: CalendarCheck,
    title: 'Books',
    body: 'Tour times proposed against your real availability.',
  },
  {
    icon: FileText,
    title: 'Logs',
    body: 'Every action on the record, in plain language you can audit.',
  },
];

/* Where it works — white cards linking into the product pages. */
const SURFACES = [
  {
    kicker: 'The inbox',
    title: 'In your inbox',
    body: 'Reads every inbound and drafts the reply in your voice — nothing sends without your tap.',
    href: '/realtors',
  },
  {
    kicker: 'The pipeline',
    title: 'On your deals',
    body: 'Advances deals as things happen and logs every move in plain language.',
    href: '/deals',
  },
  {
    kicker: 'The marketing',
    title: 'In your content',
    body: 'Drafts the just-listed post, the story, and the email — formatted for every channel.',
    href: '/studio',
  },
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      <span aria-hidden className="text-[13px] leading-none text-[#ff4b29]">
        ✦
      </span>
      {children}
    </p>
  );
}

/** Skeleton illustration — lead in, draft waiting, everything logged. */
function ChippiAtWork() {
  return (
    <div className="rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
      <div
        className="overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.72)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">
              Chippi at work
            </h3>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
              <span className="h-2 w-2 rounded-full bg-[#ff4b29]" />
              Approval-first
            </span>
          </div>

          <div className="relative h-64 rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] ring-1 ring-inset ring-black/5 sm:h-72">
            {/* New lead */}
            <div className="absolute left-3 top-4 w-[54%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:left-6 sm:top-6">
              <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                <span className="text-[10px] tracking-widest text-neutral-500">NEW LEAD</span>
                <span className="rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[9px] font-medium text-[#ff4b29]">
                  Hot · scored
                </span>
              </div>
              <div className="space-y-1.5 p-3">
                <div className="h-2 w-24 rounded bg-neutral-900/80" />
                <div className="h-2 w-full rounded bg-neutral-200/80" />
                <div className="h-2 w-4/5 rounded bg-neutral-200/80" />
              </div>
            </div>

            {/* Draft awaiting approval */}
            <div className="absolute right-3 top-[34%] w-[52%] rounded-2xl border border-black/5 bg-white/90 shadow-sm backdrop-blur sm:right-6">
              <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
                <span className="text-[10px] tracking-widest text-neutral-500">DRAFT · YOUR VOICE</span>
                <PenLine className="h-3 w-3 text-[#ff4b29]" />
              </div>
              <div className="space-y-1.5 p-3">
                <div className="h-2 w-full rounded bg-neutral-200/80" />
                <div className="h-2 w-5/6 rounded bg-neutral-200/80" />
                <div className="flex gap-2 pt-1">
                  <div className="flex h-6 w-20 items-center justify-center rounded-lg bg-emerald-100">
                    <div className="h-1 w-10 rounded bg-emerald-600" />
                  </div>
                  <div className="h-6 w-12 rounded-lg bg-neutral-100" />
                </div>
              </div>
            </div>

            {/* Booked */}
            <div className="absolute bottom-4 left-3 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/90 px-3 py-2 shadow-sm sm:bottom-6 sm:left-6">
              <CalendarCheck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] text-neutral-700">Tour proposed · Sat 2:00</span>
            </div>

            {/* Logged */}
            <div className="absolute bottom-4 right-3 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/90 px-3 py-2 shadow-sm sm:bottom-6 sm:right-6">
              <div className="h-3 w-3 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
              <span className="text-[10px] text-neutral-700">Logged in plain language</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MeetChippiPage() {
  return (
    <>
      <PageHero
        eyebrow="Meet Chippi"
        title="Not another tool. A teammate."
        sub="Chippi lives inside your CRM and works the hours between closings — reading, scoring, drafting, booking, logging. You get the decisions, not the busywork."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* What Chippi does — open split, skeleton illustration */}
      <section className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <FadeUp>
            <Eyebrow>What Chippi does</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              It works the lead end to end.
            </h2>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-4">
                {VERBS.map((v) => (
                  <div key={v.title} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                      <v.icon className="h-4 w-4 text-[#ff4b29]" />
                    </div>
                    <div>
                      <h3 className="font-medium text-zinc-950">{v.title}</h3>
                      <p className="mt-1 text-sm text-neutral-600">{v.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">
                    Chippi works your book around the clock
                  </p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                  <p className="mt-1 text-xs text-neutral-600">
                    Approval-first — nothing sends without you
                  </p>
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <ChippiAtWork />
          </FadeUp>
        </div>
      </section>

      {/* Where it works — white shadow cards into the product pages */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FadeUp>
            <Eyebrow>Where it works</Eyebrow>
            <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              One teammate. Every surface.
            </h2>
          </FadeUp>
          <Stagger className="mt-10 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {SURFACES.map((s) => (
              <StaggerItem key={s.href} className="h-full">
                <Link
                  href={s.href}
                  className="group flex h-full flex-col rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 transition-transform duration-200 hover:-translate-y-1 sm:p-9"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff4b29]">
                    {s.kicker}
                  </p>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                    {s.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-neutral-500">{s.body}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-zinc-950">
                    See it work
                    <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* The approval promise — pastel card */}
      <section className="mt-24 px-4 sm:mt-32">
        <FadeUp>
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />
            <div className="relative mx-auto max-w-3xl px-6 py-20 text-center sm:py-28">
              <Eyebrow>The approval promise</Eyebrow>
              <h2 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-zinc-950 sm:text-6xl">
                Nothing leaves without your name on it.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                Chippi drafts; you approve. Every reply waits for your tap — edit,
                send, or skip. On every thread, every time.
              </p>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* CTA */}
      <section className="mt-24 px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-3xl text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
            Put Chippi on your book.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-neutral-600">
            Connect your inbox and it starts working the leads today.
          </p>
          <div className="mt-9 flex justify-center">
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
        </FadeUp>
      </section>
    </>
  );
}
