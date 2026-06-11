/**
 * `/bio` — the realtor&apos;s public page, on the white + pastel system.
 *
 * Arc: PageHero opener → open light split (copy beside a pastel-framed
 * glass card holding a skeleton bio page: avatar, links, listing tiles,
 * tap → scored lead strip) → soft white bento with owner image slots →
 * pastel CTA card. One idea: one link carries bio + listings + tour
 * booking, and every lead it captures lands in the same loop.
 */

import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck,
  Home,
  ImagePlus,
  Link2,
  MessageSquare,
} from 'lucide-react';
import { FadeUp, Stagger, StaggerItem } from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';

export const metadata = {
  title: 'Your public bio · Chippi',
  description:
    'One link with your bio, your listings, and tour booking built in. Every visitor who taps lands in the same loop — scored, with a reply drafted in your voice for your approval.',
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

const BENTO = [
  {
    slot: 'bio-page',
    title: 'Your page, your name.',
    sub: 'Bio, listings, and booking on one link you can drop anywhere — Instagram, Zillow, the QR by the door.',
  },
  {
    slot: 'bio-booking',
    title: 'Tour booking built in.',
    sub: 'Visitors pick from your real availability and the tour lands on your calendar.',
  },
  {
    slot: 'bio-leads',
    title: 'Every tap becomes a lead.',
    sub: 'Questions land in Chippi scored, with a reply drafted in your voice for your tap.',
  },
  {
    slot: 'bio-brand',
    title: 'On brand by default.',
    sub: 'Your photo, your markets, your story — set once, current everywhere the link lives.',
  },
];

export default function BioPage() {
  return (
    <div>
      <PageHero
        eyebrow="Your public page"
        title="One link. Bio, listings, bookings."
        sub="Your public page carries your story, your active listings, and a tour-booking link — and every lead it captures lands in the same loop: scored, drafted, ready for your tap."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split — air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, quiet link */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              A page that works the room.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Not a brochure — a front door. Everything a lead wants to do next
              is one tap deep, and every tap feeds the pipeline.
            </p>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <Link2 className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">One URL everywhere</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Instagram, Zillow, your email signature, the open-house
                      QR — one link feeding one pipeline.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                    <CalendarCheck className="h-4 w-4 text-[#ff4b29]" />
                  </div>
                  <div>
                    <h3 className="font-semibold tracking-tight text-zinc-950">Tours book themselves</h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Visitors pick from your real availability. The tour lands
                      on your calendar; the lead lands scored.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">24/7</span>
                  <p className="mt-1 text-xs text-neutral-600">Capturing while you are out showing</p>
                </div>
                <div>
                  <span className="text-2xl font-semibold tracking-tight text-zinc-950">100%</span>
                  <p className="mt-1 text-xs text-neutral-600">Approval-first on every drafted reply</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-neutral-200 pt-6">
              <Link
                href="/capture"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-950 transition-colors hover:text-neutral-600"
              >
                See every capture channel
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* Pastel frame, white glass card, skeleton bio page */}
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
                  <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">Your page</h3>
                  <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
                    <Link2 className="h-4 w-4 text-[#ff4b29]" />
                    One link
                  </span>
                </div>

                {/* Phone-shaped skeleton of the public page */}
                <div className="rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
                  <div className="mx-auto w-full max-w-[240px] rounded-2xl border border-black/5 bg-white/90 p-4 shadow-sm">
                    <div className="mx-auto h-12 w-12 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
                    <div className="mx-auto mt-3 h-2 w-20 rounded bg-neutral-900" />
                    <div className="mx-auto mt-1.5 h-2 w-28 rounded bg-neutral-200" />
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center gap-2 rounded-lg bg-[#ff4b29]/10 px-2.5 py-2">
                        <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0 text-[#ff4b29]" />
                        <span className="text-[10px] font-semibold text-zinc-950">Book a tour</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2 ring-1 ring-black/5">
                        <Home className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
                        <span className="text-[10px] font-medium text-neutral-700">Active listings</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2 ring-1 ring-black/5">
                        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
                        <span className="text-[10px] font-medium text-neutral-700">Ask a question</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-12 rounded-lg bg-gradient-to-br from-[#ffe3cf] to-[#ffc4dd]" />
                      <div className="h-12 rounded-lg bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5" />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[9px] text-neutral-400">
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Tap</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Scored lead</span>
                    <span aria-hidden>→</span>
                    <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Drafted reply</span>
                  </div>
                </div>

                {/* Two-up */}
                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">Every tap captured</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      Bookings, questions, and listing interest land in Chippi,
                      scored on arrival.
                    </p>
                  </div>
                  <div>
                    <h4 className="text-lg font-semibold tracking-tight text-zinc-950">A draft waiting</h4>
                    <p className="mt-2 text-sm text-neutral-500">
                      By the time you look, the reply is written in your voice
                      for your tap.
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
            One link
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            A public page that feeds the pipeline.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Your page, your bookings, your leads, your brand — wired into the
            same loop as everything else Chippi works.
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
              Put your link to work.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Claim your page, drop the link everywhere, and meet every tap
              with a draft.
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
