/**
 * `/capture`, intake forms that feed the loop, on the white + pastel system.
 *
 * Arc: PageHero opener → open light split (copy beside a pastel-framed
 * glass card: intake form → scored lead with drafted-reply chips) → white
 * shadow trio (Instant scoring / Your voice / On the record) → pastel CTA
 * card. One idea: a lead lands, gets scored, a reply drafts itself, tour
 * times are proposed, you just approve.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  ArrowRight,
  CalendarCheck,
  Gauge,
  ImagePlus,
  Inbox,
  MessageSquare,
  PenLine,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';
import { LeadOrbit } from '@/components/marketing/site/home/lead-orbit';

export const metadata = {
  title: 'Capture leads · Chippi',
  description:
    'Intake forms that feed the loop, every lead lands in Chippi scored, with a reply sent in your voice and tour times ready to book.',
};

const TRIO: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Zap,
    title: 'Instant scoring.',
    body: 'Hot, warm, or cold the second the form lands, with the reason attached, not just a number.',
  },
  {
    icon: PenLine,
    title: 'Your voice.',
    body: 'The first reply drafts itself from how you actually write. Leads hear you, not a template.',
  },
  {
    icon: ShieldCheck,
    title: 'On the record.',
    body: 'Every send in your voice, logged in plain words, every thread stays yours.',
  },
];

/* The capture channels, 2×2 owner image-slot bento, FeaturesBento style. */
const CHANNELS = [
  {
    slot: 'web-form',
    title: 'On your website.',
    sub: 'Embed the form anywhere, every\nfill comes back scored and drafted.',
  },
  {
    slot: 'qr-sign',
    title: 'At the open house.',
    sub: 'A QR on the sign-in sheet routes\nthe walk-up straight into the loop.',
  },
  {
    slot: 'social-link',
    title: 'In your link in bio.',
    sub: 'Drop the form on your public page, \nthe profile link that actually books.',
  },
  {
    slot: 'import',
    title: 'From your old list.',
    sub: 'Bring a spreadsheet of contacts and\nChippi scores and sorts them on arrival.',
  },
];

/* The three steps, capture → score → first reply, HowItWorks style. */
const STEPS: { label: string; title: string; body: string }[] = [
  {
    label: 'STEP 1',
    title: 'A lead lands.',
    body: 'From your form, your QR, or your bio link, the moment someone asks, it lands in Chippi with the request in context.',
  },
  {
    label: 'STEP 2',
    title: 'It scores itself.',
    body: 'Hot, warm, or cold with the reason spelled out, budget, timeline, intent, so you know who to call first.',
  },
  {
    label: 'STEP 3',
    title: 'A reply is ready.',
    body: 'The first message goes out in your voice with tour times from your real calendar, seconds after the lead lands.',
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

function ImageSlot({ name }: { name: string }) {
  return (
    <div
      data-slot={name}
      className="mt-8 flex h-64 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5 sm:h-72"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-5 w-5 text-neutral-300" />
        <p className="text-xs text-neutral-600">
          Image placeholder, <span className="font-medium text-neutral-500">{name}</span>
        </p>
      </div>
    </div>
  );
}

/** A floating STEP pill, how-it-works style. */
function StepPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute -top-3.5 left-6 inline-flex items-center rounded-full border border-neutral-200 bg-white px-3.5 py-1 text-xs font-medium tracking-tight text-neutral-700">
      {children}
    </span>
  );
}

/** One step card, pill + skeleton mock + title + body. */
function StepCard({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col rounded-[28px] border border-neutral-200 bg-white p-6 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] transition-transform duration-200 hover:-translate-y-1 sm:p-8">
      <StepPill>{label}</StepPill>
      {children}
      <h3 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-950 sm:text-[26px]">
        {title}
      </h3>
      <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-neutral-600 sm:text-base">
        {body}
      </p>
    </div>
  );
}

/** The shared skeleton frame each step mock sits in. */
function StepMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-44 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 p-4 sm:h-48">
      {children}
    </div>
  );
}

export default function CapturePage() {
  return (
    <div>
      <PageHero
        eyebrow="Capture leads"
        title="Forms that feed the loop."
        sub="A lead lands on your form, gets scored with the reason, a reply drafts itself in your voice, and tour times are proposed. You tap approve, that is the whole job."
        primaryCta={{ label: 'Start free trial', href: '/sign-up' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split, air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, quiet link */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              From form fill to booked tour.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              The form is the front door of the loop. Everything after it
              happens before you even open the thread.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Zap className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Scored on arrival</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Hot, warm, or cold with the reason attached, the moment
                      the form lands, not at the end of the day.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <MessageSquare className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Drafted, not sent</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      The first reply waits in your voice, tour times included.
                      Sent in your voice, seconds later.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">The loop runs while you are out showing</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                  <p className="mt-1 text-xs text-neutral-600">Every send in your voice, on the record</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <Link
                href="/bio"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-950 transition-colors hover:text-neutral-600"
              >
                Put the form on your public page
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Pastel frame, white glass card, form → scored lead flow */}
          <div className="relative rounded-[36px] marketing-feature-frame p-5">
            <article
              className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.65)',
              }}
            >
              <div className="p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">The loop</h3>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-xs text-neutral-700 sm:text-xs">
                    <Zap className="h-4 w-4 text-[#ff4b29]" />
                    Live
                  </span>
                </div>

                {/* Form → scored lead */}
                <div className="rounded-2xl bg-gradient-to-b from-white to-[#f4f7fb] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-xs tracking-widest text-neutral-500">INTAKE FORM</span>
                      <span className="text-xs text-neutral-600">Your site · your page</span>
                    </div>
                    <div className="mt-2.5 space-y-2">
                      <div className="h-6 rounded-lg bg-neutral-100" />
                      <div className="h-6 rounded-lg bg-neutral-100" />
                      <div className="flex justify-end">
                        <span className="inline-flex h-6 items-center rounded-full bg-[#ff4b29] px-3 text-xs font-semibold text-white">
                          Request a tour
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="my-3 flex justify-center">
                    <ArrowDown className="h-4 w-4 text-neutral-600" />
                  </div>

                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-xs tracking-widest text-neutral-500">NEW LEAD</span>
                      <span className="rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-xs font-semibold text-[#ff4b29]">
                        Hot · 86
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-20 rounded bg-neutral-900" />
                        <div className="mt-1.5 h-2 w-28 rounded bg-neutral-200" />
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Reply drafted
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Tour times proposed
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Awaiting your tap
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-neutral-600">
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Lands</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Scored</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Drafted</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Booked</span>
                  </div>
                </div>

                {/* Two-up */}
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">The reason, not a number</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Every score explains itself, budget, timeline, intent, 
                      so you can trust the queue.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Times from your calendar</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Proposed slots come from your real availability, never a
                      guess.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* White shadow trio, big air above */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            Why it converts
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Fast. Yours. Under your thumb.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Three guarantees on every lead the form brings in.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:gap-8 lg:grid-cols-3">
          {TRIO.map((item) => (
            <StaggerItem key={item.title} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <item.icon className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {item.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{item.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Capture → score → first reply, HowItWorks-style steps card */}
      <section className="mx-auto mt-24 w-full max-w-7xl px-4 sm:mt-32 sm:px-6">
        <div className="rounded-3xl border border-neutral-200/70 bg-white p-6 shadow-[0_24px_70px_-30px_rgba(20,20,40,0.18)] sm:p-8">
          {/* Header, giant headline + hairline + sub, how-it-works exact */}
          <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:gap-6">
            <h2 className="text-[40px] font-semibold leading-[0.95] tracking-tight text-zinc-950 sm:text-5xl lg:text-6xl">
              Lands to first reply.
            </h2>
            <span
              aria-hidden
              role="separator"
              className="hidden h-10 w-px bg-neutral-200 sm:block"
            />
            <p className="text-sm tracking-tight text-zinc-400 sm:mt-1 sm:text-base">
              Three steps between a fill and a grounded reply sent on request
            </p>
          </div>
          <div className="mt-4 h-px bg-neutral-200" />

          <Stagger className="mt-8 grid grid-cols-1 gap-8 sm:gap-10 lg:grid-cols-3">
            {/* STEP 1, lands */}
            <StaggerItem className="h-full">
              <StepCard label={STEPS[0].label} title={STEPS[0].title} body={STEPS[0].body}>
                <StepMock>
                  <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="mb-2.5 flex items-center justify-between border-b border-neutral-100 pb-2">
                      <span className="text-xs tracking-widest text-neutral-500">INTAKE</span>
                      <Inbox className="h-3.5 w-3.5 text-[#ff4b29]" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-5 rounded-lg bg-neutral-100" />
                      <div className="h-5 w-4/5 rounded-lg bg-neutral-100" />
                      <div className="flex justify-end pt-0.5">
                        <span className="inline-flex h-5 items-center rounded-full bg-[#ff4b29] px-2.5 text-[8px] font-semibold text-white">
                          Request a tour
                        </span>
                      </div>
                    </div>
                  </div>
                </StepMock>
              </StepCard>
            </StaggerItem>

            {/* STEP 2, scores */}
            <StaggerItem className="h-full">
              <StepCard label={STEPS[1].label} title={STEPS[1].title} body={STEPS[1].body}>
                <StepMock>
                  <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 flex-shrink-0 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-20 rounded bg-neutral-900/80" />
                        <div className="mt-1.5 h-2 w-28 rounded bg-neutral-200" />
                      </div>
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-xs font-semibold text-[#ff4b29]">
                        <Gauge className="h-3 w-3" />
                        Hot
                      </span>
                    </div>
                    <div className="mt-2.5 rounded-lg bg-black/[0.03] px-2.5 py-1.5 text-xs text-neutral-600 ring-1 ring-black/5">
                      Why: pre-approved, touring this week
                    </div>
                  </div>
                </StepMock>
              </StepCard>
            </StaggerItem>

            {/* STEP 3, first reply ready */}
            <StaggerItem className="h-full">
              <StepCard label={STEPS[2].label} title={STEPS[2].title} body={STEPS[2].body}>
                <StepMock>
                  <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
                    <div className="mb-2.5 flex items-center justify-between border-b border-neutral-100 pb-2">
                      <span className="text-xs tracking-widest text-neutral-500">DRAFT · YOUR VOICE</span>
                      <PenLine className="h-3.5 w-3.5 text-[#ff4b29]" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2 w-full rounded bg-neutral-200" />
                      <div className="h-2 w-5/6 rounded bg-neutral-200" />
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 ring-1 ring-emerald-100">
                        <CalendarCheck className="h-3 w-3 text-emerald-600" />
                        <span className="text-[8px] font-medium text-emerald-700">Sat 2:00 · Sun 11:00</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <span className="inline-flex h-5 items-center rounded-full bg-[#ff4b29] px-2.5 text-[8px] font-semibold text-white">
                          Approve &amp; send
                        </span>
                        <span className="inline-flex h-5 items-center rounded-full bg-neutral-100 px-2.5 text-[8px] font-medium text-neutral-500">
                          Edit
                        </span>
                      </div>
                    </div>
                  </div>
                </StepMock>
              </StepCard>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* The capture channels, 2×2 owner image-slot bento */}
      <section className="mt-24 sm:mt-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <FadeUp className="mx-auto max-w-2xl text-center">
            <Eyebrow>Every front door</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              Wherever leads find you.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              One form, every channel. However a lead arrives, it enters the same
              loop, scored, acted on, and recorded.
            </p>
          </FadeUp>
          <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {CHANNELS.map((cell) => (
              <StaggerItem key={cell.slot} className="h-full">
                <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                    {cell.title}
                  </h3>
                  <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-neutral-500">
                    {cell.sub}
                  </p>
                  <ImageSlot name={cell.slot} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Lead qualification, run by a teammate, saturated brand beat */}
      <div className="mt-24 sm:mt-32">
        <LeadOrbit />
      </div>

      {/* Pastel CTA card */}
      <section className="mt-24 px-4 sm:mt-32">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-[#f8fafc] to-[#eef3fb] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />
          <FadeUp className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-16 text-center sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Put the form to work tonight.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Drop it on your site, your public page, the open-house QR, every
              fill comes back scored and drafted.
            </p>
            <Link
              href="/sign-up"
              className="mt-9 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#ff4b29] px-7 text-[15px] font-semibold text-white transition-all duration-150 hover:bg-[#e84418] active:scale-[0.98]"
            >
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-4 text-sm text-neutral-500">7 days free, then $97/mo. Cancel anytime.</p>
          </FadeUp>
        </div>
      </section>
    </div>
  );
}
