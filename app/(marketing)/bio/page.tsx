/**
 * `/bio`, the realtor&apos;s public page, on the white + pastel system.
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
  UserRound,
} from 'lucide-react';
import {
  FadeUp,
  FeatureGrid,
  Stagger,
  StaggerItem,
} from '@/components/marketing/site/section';
import { PageHero } from '@/components/marketing/site/page-hero';
import { CloudCta } from '@/components/marketing/site/home/cloud-cta';

export const metadata = {
  title: 'Your public bio · Chippi',
  description:
    'One link with your bio, your listings, and tour booking built in. Every visitor who taps lands in the same loop, scored, with a reply sent in your voice.',
};

/** ✦-glyph eyebrow chip, same treatment as the exemplar sub-pages. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
      <span aria-hidden className="text-[#ff4b29]">
        ✦
      </span>
      {children}
    </p>
  );
}

/** Owner image slot, exactly the FeaturesBento vocabulary. */
function ImageSlot({ name }: { name: string }) {
  return (
    <div
      data-slot={name}
      className="mt-8 flex h-64 items-center justify-center rounded-2xl bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-black/5 sm:h-72"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <ImagePlus className="h-5 w-5 text-neutral-300" />
        <p className="text-xs text-neutral-400">
          Image placeholder, <span className="font-medium text-neutral-500">{name}</span>
        </p>
      </div>
    </div>
  );
}

/** Page-local skeleton, the public bio page as a lead sees it: avatar, name,
 *  link buttons, listing tiles. Gray/white mock cards in the pastel glass
 *  frame, the same vocabulary as ChippiAtWork. */
function BioPreview() {
  return (
    <div className="rounded-[36px] bg-gradient-to-br from-[#ffe3cf] via-[#ffd2b3] to-[#ffc4dd] p-5">
      <div
        className="overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(255, 255, 255, 0.72)',
          border: '1px solid rgba(255, 255, 255, 0.65)',
        }}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h3 className="text-2xl font-semibold tracking-tight text-zinc-950">The link, live</h3>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] text-neutral-700 sm:text-xs">
              <Link2 className="h-4 w-4 text-[#ff4b29]" />
              chip.bio/you
            </span>
          </div>

          <div className="mx-auto w-full max-w-[280px] rounded-2xl bg-gradient-to-b from-white to-[#fff1e6] p-4 ring-1 ring-inset ring-black/5 sm:p-5">
            {/* Avatar + name + markets */}
            <div className="rounded-xl border border-black/5 bg-white/90 p-4 text-center shadow-sm">
              <div className="mx-auto h-14 w-14 rounded-full bg-gradient-to-r from-[#ff7a47] to-[#ff4b29]" />
              <div className="mx-auto mt-3 h-2.5 w-24 rounded bg-neutral-900" />
              <div className="mx-auto mt-2 h-2 w-32 rounded bg-neutral-200" />
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <span className="rounded-full bg-[#ff4b29]/10 px-2 py-0.5 text-[9px] font-medium text-[#ff4b29]">
                  Brooklyn
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-600">
                  Queens
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[9px] font-medium text-neutral-600">
                  First-time buyers
                </span>
              </div>
            </div>

            {/* Link buttons */}
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 rounded-xl bg-[#ff4b29] px-3 py-2.5 shadow-sm">
                <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0 text-white" />
                <span className="text-[11px] font-semibold text-white">Book a tour</span>
                <ArrowRight className="ml-auto h-3 w-3 text-white/80" />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 py-2.5 shadow-sm">
                <Home className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
                <span className="text-[11px] font-medium text-neutral-700">Active listings</span>
                <ArrowRight className="ml-auto h-3 w-3 text-neutral-300" />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white/90 px-3 py-2.5 shadow-sm">
                <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
                <span className="text-[11px] font-medium text-neutral-700">Ask a question</span>
                <ArrowRight className="ml-auto h-3 w-3 text-neutral-300" />
              </div>
            </div>

            {/* Listing tiles */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="overflow-hidden rounded-xl border border-black/5 bg-white/90 shadow-sm">
                <div className="h-12 bg-gradient-to-br from-[#ffe3cf] to-[#ffc4dd]" />
                <div className="space-y-1 p-2">
                  <div className="h-1.5 w-12 rounded bg-neutral-900/80" />
                  <div className="h-1.5 w-16 rounded bg-neutral-200" />
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-black/5 bg-white/90 shadow-sm">
                <div className="h-12 bg-gradient-to-b from-[#f6f6f8] to-white ring-1 ring-inset ring-black/5" />
                <div className="space-y-1 p-2">
                  <div className="h-1.5 w-10 rounded bg-neutral-900/80" />
                  <div className="h-1.5 w-14 rounded bg-neutral-200" />
                </div>
              </div>
            </div>

            {/* Capture trail */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[9px] text-neutral-400">
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Tap</span>
              <span aria-hidden>&rarr;</span>
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Scored lead</span>
              <span aria-hidden>&rarr;</span>
              <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-black/5">Drafted reply</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const BENTO = [
  {
    slot: 'bio-page',
    title: 'Your page, your name.',
    sub: 'Bio, listings, and booking on one link you can drop anywhere, Instagram, Zillow, the QR by the door.',
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
    sub: 'Your photo, your markets, your story, set once, current everywhere the link lives.',
  },
];

/* What the page actually does, the four jobs of the link, as a tinted
 * FeatureGrid (a tonal half-step off the white canvas). */
const DOES = [
  {
    kicker: 'Capture',
    title: 'Captures every lead',
    body: 'A name, a number, a question, whoever taps lands in Chippi scored, with the context already attached.',
  },
  {
    kicker: 'Listings',
    title: 'Shows your listings',
    body: 'Active properties laid out as tiles, current the moment a status changes, no page to rebuild.',
  },
  {
    kicker: 'Booking',
    title: 'Books the tour',
    body: 'Visitors pick from your real availability and the showing lands on your calendar, confirmed.',
  },
  {
    kicker: 'Hand-off',
    title: 'Routes to Chippi',
    body: 'The moment a lead arrives, the reply is drafted in your voice and waiting for your tap.',
  },
];

export default function BioPage() {
  return (
    <div>
      <PageHero
        eyebrow="Your public page"
        title="One link. Bio, listings, bookings."
        sub="Your public page carries your story, your active listings, and a tour-booking link, and every lead it captures lands in the same loop: scored, drafted, ready for your tap."
        primaryCta={{ label: 'Start free trial', href: '/login/realtor?intent=signup' }}
        secondaryCta={{ label: 'Book a demo', href: '/demo' }}
      />

      {/* Open light split, air after the hero */}
      <section className="mx-auto mt-12 max-w-7xl px-6 sm:mt-16">
        <div className="grid gap-12 lg:grid-cols-2">
          {/* Copy, hairline list, stats, quiet link */}
          <div>
            <h2 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
              A page that works the room.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600">
              Not a brochure, a front door. Everything a lead wants to do next
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
                      QR, one link feeding one pipeline.
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
                  <p className="mt-1 text-xs text-neutral-600">Every reply sent in your voice</p>
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

      {/* Soft bento, owner image slots, big air above */}
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
            Your page, your bookings, your leads, your brand, wired into the
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

      {/* The four jobs of the link, tinted FeatureGrid, a tonal half-step off
          the white run above. */}
      <section className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6">
        <FadeUp className="mx-auto max-w-2xl text-center">
          <Eyebrow>What the link does</Eyebrow>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            One tap, four jobs, one loop.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
            Capture, listings, booking, hand-off, every tap does real work and
            ends up in the same pipeline Chippi runs.
          </p>
        </FadeUp>
        <FeatureGrid
          className="mt-12"
          columns={4}
          items={DOES.map((d) => ({ kicker: d.kicker, title: d.title, body: d.body }))}
        />
      </section>

      {/* The visitor&apos;s view, a fuller page-local phone-bio skeleton in
          the pastel glass frame. */}
      <section className="mx-auto mt-24 max-w-7xl px-6 sm:mt-32">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <FadeUp>
            <Eyebrow>The visitor&apos;s view</Eyebrow>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
              What a lead sees when they tap.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
              Your face, your name, your markets, then the three things they
              came to do, one tap deep. No app to download, no form to slog
              through.
            </p>
            <div className="mt-8 space-y-5 border-t border-neutral-200 pt-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <UserRound className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <div>
                  <h3 className="font-semibold tracking-tight text-zinc-950">Your story up top</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Photo, name, and the markets you work, set once, current
                    everywhere the link lives.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#ff4b29]/10">
                  <Home className="h-4 w-4 text-[#ff4b29]" />
                </div>
                <div>
                  <h3 className="font-semibold tracking-tight text-zinc-950">Listings, always live</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Active properties laid out as tiles, current the moment a
                    status changes, no page to rebuild.
                  </p>
                </div>
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <BioPreview />
          </FadeUp>
        </div>
      </section>

      {/* Break-up closer */}
      <div className="mt-24 sm:mt-32">
        <CloudCta />
      </div>
    </div>
  );
}
