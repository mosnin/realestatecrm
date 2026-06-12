/**
 * `/studio` — the content studio, on the white + pastel system.
 *
 * Arc: PageHero opener → open light split (copy beside a pastel-framed
 * glass card showing one listing becoming the post, the story, and the
 * email) → soft white bento with owner image slots → pastel CTA card.
 * One idea: the listing becomes the content — drafted in your voice,
 * formatted per channel, on the go.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDown,
  CalendarClock,
  Camera,
  Clapperboard,
  ImagePlus,
  Instagram,
  Mail,
  PenLine,
  Share2,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';
import { CloudCta } from '@/components/marketing/site/home/cloud-cta';

export const metadata = {
  title: 'Content studio · Chippi',
  description:
    'Chippi drafts your listing posts, stories, and emails — in your voice, from your phone. Just listed, open house, just sold, market updates: written and ready while you’re in the field.',
};

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

const CHANNELS: { label: string; icon: LucideIcon; tone: string }[] = [
  { label: 'Post', icon: Instagram, tone: 'text-purple-600' },
  { label: 'Story', icon: Camera, tone: 'text-blue-600' },
  { label: 'Email', icon: Mail, tone: 'text-emerald-600' },
];

/* What Chippi writes — the content types it drafts from one listing. */
const CONTENT_TYPES: { icon: LucideIcon; kicker: string; title: string; body: string }[] = [
  {
    icon: Instagram,
    kicker: 'Just listed',
    title: 'The feed post.',
    body: 'A caption sized for the grid — the hook, the details, the call to come see it.',
  },
  {
    icon: Camera,
    kicker: 'Story',
    title: 'The vertical story.',
    body: 'A full-bleed story frame for the open house, worded to swipe up and tour.',
  },
  {
    icon: Mail,
    kicker: 'Email',
    title: 'The just-listed email.',
    body: 'A note to your sphere with the listing, the photos, and the showing times.',
  },
  {
    icon: Clapperboard,
    kicker: 'Reel',
    title: 'The walkthrough reel.',
    body: 'A shot list and on-screen captions for the tour clip, ready to film and post.',
  },
];

const BENTO = [
  {
    slot: 'studio-compose',
    title: 'Compose on the go.',
    sub: 'Point Chippi at the listing — the post, the story, and the email draft themselves between showings.',
  },
  {
    slot: 'studio-brand',
    title: 'Your brand voice, learned.',
    sub: 'Captions that sound like you wrote them, because Chippi learned from how you actually write.',
  },
  {
    slot: 'studio-schedule',
    title: 'Scheduled around showings.',
    sub: 'Approve once and the campaign queues for the open-house window while you keep driving.',
  },
  {
    slot: 'studio-library',
    title: 'A library that remembers.',
    sub: 'Every draft, caption, and asset filed by listing — ready to reuse on the next one.',
  },
];

/** Floating STEP pill — the HowItWorks step marker, on the white system. */
function StepPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute -top-3 left-6 inline-flex items-center rounded-full border border-neutral-200 bg-white px-3.5 py-1 text-xs font-medium tracking-tight text-neutral-800">
      {children}
    </span>
  );
}

/** Bordered step card with a skeleton mock above the copy. */
function StepCard({
  step,
  title,
  body,
  children,
}: {
  step: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-full flex-col rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] transition-transform duration-200 hover:-translate-y-1 sm:p-8">
      <StepPill>{step}</StepPill>
      {children}
      <h3 className="mt-6 text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
        {title}
      </h3>
      <p className="mt-2 text-base leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}

export default function StudioPage() {
  return (
    <div>
      <PageHero
        eyebrow="Content studio"
        title="The listing becomes the content."
        sub="Just listed, open house, just sold — Chippi drafts the post, the story, and the email in your voice, formatted for every channel, before you leave the driveway."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split — air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, dark button */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              One listing in. Every channel out.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Chippi turns the listing into the whole campaign — written the way
              you write, formatted for where it goes.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <PenLine className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Drafted in your voice</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Chippi learns from what you have already written. The
                      captions sound like you — not a content mill.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Share2 className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Formatted per channel</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      The Instagram post, the story, and the just-listed email
                      each arrive sized and worded for the channel.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">Drafting while you are at the showing</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                  <p className="mt-1 text-xs text-neutral-600">Approval-first — nothing posts without you</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <Link
                href="/chippi"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-b from-neutral-700 to-neutral-900 px-5 py-2.5 text-base leading-none text-white shadow-[0_2.8px_2.2px_rgba(0,_0,_0,_0.034),_0_6.7px_5.3px_rgba(0,_0,_0,_0.048),_0_12.5px_10px_rgba(0,_0,_0,_0.06),_0_22.3px_17.9px_rgba(0,_0,_0,_0.072),_0_41.8px_33.4px_rgba(0,_0,_0,_0.086),_0_100px_80px_rgba(0,_0,_0,_0.12)] transition-all duration-150 hover:opacity-85"
              >
                See Chippi at work
              </Link>
            </div>
          </div>

          {/* Pastel frame, white glass card, skeleton illustration */}
          <div className="relative rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
            <article
              className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.65)',
              }}
            >
              <div className="p-6 sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">From one listing</h3>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                    <PenLine className="h-4 w-4 text-[#ff4b29]" />
                    Drafts ready
                  </span>
                </div>

                {/* Listing → three channel drafts */}
                <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
                  <div className="rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="flex items-center justify-between border-b border-black/5 pb-2">
                      <span className="text-[10px] tracking-widest text-neutral-500">NEW LISTING</span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                        <span className="h-2 w-2 rounded-full bg-emerald-500/80" />
                        Live
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="h-10 w-14 flex-shrink-0 rounded-lg bg-gradient-to-br from-[#ffe3cf] to-[#ffc4dd]" />
                      <div className="min-w-0 flex-1">
                        <div className="h-2 w-28 rounded bg-neutral-900" />
                        <div className="mt-1.5 h-2 w-20 rounded bg-neutral-200" />
                      </div>
                      <span className="rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[9px] font-medium text-[#ff4b29]">
                        Just listed
                      </span>
                    </div>
                  </div>

                  <div className="my-3 flex justify-center">
                    <ArrowDown className="h-4 w-4 text-neutral-400" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {CHANNELS.map((c) => (
                      <div
                        key={c.label}
                        className="rounded-xl border border-black/5 bg-white/90 p-2.5 shadow-sm sm:p-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <c.icon className={`h-3 w-3 ${c.tone}`} strokeWidth={2} />
                          <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500">
                            {c.label}
                          </span>
                        </div>
                        <div className="mt-2 space-y-1">
                          <div className="h-1 w-full rounded bg-neutral-200" />
                          <div className="h-1 w-4/5 rounded bg-neutral-200" />
                          <div className="h-1 w-3/5 rounded bg-neutral-200" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Two-up */}
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Brand voice, learned</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Every caption is written the way you write — tuned per
                      channel, never copy-pasted.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Approve and go</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Tap to approve from your phone; the campaign queues for
                      the right window.
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Three steps to a post — HowItWorks rhythm, white shadow STEP cards */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            Three steps to a post
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Snap it. Approve it. It is everywhere.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            You take one photo at the listing. Chippi does the writing and the
            scheduling — you just tap approve.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid grid-cols-1 items-stretch gap-8 sm:gap-10 lg:grid-cols-3">
          {/* STEP 1 — Snap a photo */}
          <StaggerItem className="h-full">
            <StepCard
              step="STEP 1"
              title="Snap the photo"
              body="Take one shot at the door — just listed, open house, just sold. That is the whole input."
            >
              <div className="relative h-44 overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-b from-white to-[#fff1e6] p-4 sm:h-48">
                <div className="mx-auto flex h-full max-w-[12rem] items-center justify-center">
                  <div className="w-full rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                    <div className="aspect-[4/3] w-full rounded-lg bg-gradient-to-br from-[#ffe3cf] to-[#ffc4dd]" />
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[10px] text-neutral-600">
                        <Camera className="h-3 w-3 text-[#ff4b29]" />
                        14 Oak St
                      </span>
                      <span className="rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[9px] font-medium text-[#ff4b29]">
                        Just listed
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </StepCard>
          </StaggerItem>

          {/* STEP 2 — Chippi drafts */}
          <StaggerItem className="h-full">
            <StepCard
              step="STEP 2"
              title="Chippi drafts it"
              body="The caption, the story, and the email write themselves in your voice — sized for each channel."
            >
              <div className="relative h-44 overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-b from-white to-[#fff1e6] p-4 sm:h-48">
                <div className="grid h-full grid-cols-3 gap-2 sm:gap-3">
                  {CHANNELS.map((c) => (
                    <div
                      key={c.label}
                      className="flex flex-col rounded-xl border border-black/5 bg-white/90 p-2.5 shadow-sm"
                    >
                      <div className="flex items-center gap-1.5">
                        <c.icon className={`h-3 w-3 ${c.tone}`} strokeWidth={2} />
                        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-500">
                          {c.label}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="h-1 w-full rounded bg-neutral-200" />
                        <div className="h-1 w-4/5 rounded bg-neutral-200" />
                        <div className="h-1 w-3/5 rounded bg-neutral-200" />
                      </div>
                      <div className="mt-auto flex items-center gap-1 pt-2">
                        <PenLine className="h-2.5 w-2.5 text-[#ff4b29]" />
                        <div className="h-1 w-6 rounded bg-[#ff4b29]/40" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </StepCard>
          </StaggerItem>

          {/* STEP 3 — Schedule everywhere */}
          <StaggerItem className="h-full">
            <StepCard
              step="STEP 3"
              title="Schedule everywhere"
              body="Approve once from your phone and the campaign queues for the open-house window across every channel."
            >
              <div className="relative h-44 overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-b from-white to-[#fff1e6] p-4 sm:h-48">
                <div className="h-full w-full rounded-xl border border-black/5 bg-white/90 p-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-black/5 pb-2">
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-neutral-700">
                      <CalendarClock className="h-3 w-3 text-[#ff4b29]" />
                      Open-house window
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                      Queued
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    {CHANNELS.map((c) => (
                      <div key={c.label} className="flex items-center gap-2">
                        <c.icon className={`h-3 w-3 flex-shrink-0 ${c.tone}`} strokeWidth={2} />
                        <div className="h-1.5 flex-1 rounded bg-neutral-200" />
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-600">
                          Sat
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50/60 px-2 py-1.5 ring-1 ring-emerald-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-medium text-neutral-700">Approved · scheduled</span>
                  </div>
                </div>
              </div>
            </StepCard>
          </StaggerItem>
        </Stagger>
      </section>

      {/* What Chippi writes — content-type catalog, white feature cards */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            What Chippi writes
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            One photo. Four ways to show it off.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            The same listing, written four ways — each one sized and worded for
            where it lands.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
          {CONTENT_TYPES.map((c) => (
            <StaggerItem key={c.kicker} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <c.icon className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff4b29]">
                  {c.kicker}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">
                  {c.title}
                </h3>
                <p className="mt-2.5 text-sm leading-relaxed text-neutral-500">{c.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Soft bento — owner image slots, big air above */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
            <span aria-hidden className="text-[#ff4b29]">✦</span>
            Inside the studio
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            Everything the listing needs to make noise.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Compose, brand, schedule, library — one studio that fits in the
            time between showings.
          </p>
        </FadeUp>
        <Stagger className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
          {BENTO.map((cell) => (
            <StaggerItem key={cell.slot} className="h-full">
              <div className="h-full rounded-3xl bg-white p-7 shadow-[0_18px_60px_-24px_rgba(20,20,40,0.12)] ring-1 ring-black/5 sm:p-9">
                <h3 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
                  {cell.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-neutral-500">{cell.sub}</p>
                <ImageSlot name={cell.slot} />
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Break-up closer */}
      <div className="mt-24 sm:mt-32">
        <CloudCta />
      </div>
    </div>
  );
}
