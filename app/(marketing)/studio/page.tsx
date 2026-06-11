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
  ArrowRight,
  Camera,
  ImagePlus,
  Instagram,
  Mail,
  PenLine,
  Share2,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';

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

      {/* Pastel CTA card */}
      <section className="mt-24 px-4 sm:mt-32">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-gradient-to-b from-white via-[#fff7f1] to-[#ffeddd] shadow-[0_24px_70px_-30px_rgba(120,55,20,0.25)] ring-1 ring-black/5 sm:rounded-[2.75rem]">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ffb054]/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-[#ff4b29]/15 blur-3xl" />
          <FadeUp className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-16 text-center sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              Post the listing before you leave the driveway.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Chippi drafts the campaign the moment the listing goes live. You
              approve; it goes.
            </p>
            <Link
              href="/login/realtor?intent=signup"
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
