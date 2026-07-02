'use client';

/**
 * TestimonialsBand — "in their words," as a slow two-row marquee.
 *
 * Built on the kibo marquee primitives (react-fast-marquee) with cards in the
 * giga dark language: glassy white/[0.02] surfaces, hairline borders, serif
 * pull-quote type. Rows travel in opposite directions and pause on hover so a
 * quote can actually be read. Avatars are initial monograms — we never ship a
 * stranger's photo.
 *
 * ── CONTENT IS SAMPLE COPY ──────────────────────────────────────────────────
 * TODO(founder): replace QUOTES with real customer words + real attribution
 * before launch. Structured personas below are illustrative, matching the
 * site's existing placeholder convention (see the hero wordmarks).
 */

import { motion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import {
  Marquee,
  MarqueeContent,
  MarqueeFade,
  MarqueeItem,
} from '@/components/ui/marquee';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const reveal = {
  initial: { opacity: 0, y: 22 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
};

interface Quote {
  quote: string;
  name: string;
  tagline: string;
}

// TODO(founder): swap for real customer quotes.
const QUOTES: Quote[] = [
  {
    quote: 'It answered a lead while I was mid-showing. By the time I got to my car, the tour was on my calendar.',
    name: 'Solo agent',
    tagline: 'Residential · Austin',
  },
  {
    quote: 'The drafts actually sound like me. My clients can’t tell — and I read every one before it sends.',
    name: 'Team lead',
    tagline: 'Buyer team of 4 · Phoenix',
  },
  {
    quote: 'Our floor used to lose weekend leads by Monday. Now every one has a reply, a score, and a next step.',
    name: 'Managing broker',
    tagline: 'Brokerage of 40 agents · Tampa',
  },
  {
    quote: 'I stopped paying for three tools. The CRM, the dialer follow-up, the drip campaigns — this is all of it.',
    name: 'Solo agent',
    tagline: 'Condos · Chicago',
  },
  {
    quote: 'Set up on a Tuesday. First tour it booked on its own was Thursday morning, 7:41 AM.',
    name: 'Team lead',
    tagline: 'Listings team · Denver',
  },
  {
    quote: 'The pipeline finally reflects reality — the deals move because the follow-ups actually happen.',
    name: 'Managing broker',
    tagline: 'Boutique brokerage · Seattle',
  },
];

function QuoteCard({ q }: { q: Quote }) {
  return (
    <figure className="flex h-full w-[340px] flex-col justify-between rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6 backdrop-blur-sm transition-colors hover:border-white/[0.14] sm:w-[400px]">
      <blockquote
        style={{ fontFamily: 'var(--font-serif-display), Georgia, serif' }}
        className="text-pretty text-[17px] font-light leading-relaxed text-white/85"
      >
        “{q.quote}”
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.06] text-[12px] font-semibold text-white/80">
          {q.name.charAt(0)}
        </span>
        <span>
          <span className="block text-[13px] font-medium text-white">{q.name}</span>
          <span style={MONO} className="block text-[10px] uppercase tracking-[0.18em] text-white/40">
            {q.tagline}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

export function TestimonialsBand() {
  const rowA = QUOTES.filter((_, i) => i % 2 === 0);
  const rowB = QUOTES.filter((_, i) => i % 2 === 1);

  return (
    <section className="overflow-hidden px-0 py-20 sm:py-24">
      <motion.div
        {...reveal}
        transition={{ duration: 0.7, ease: EASE_OUT }}
        className="mx-auto w-full max-w-6xl px-5 sm:px-8"
      >
        <span
          style={MONO}
          className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/55"
        >
          <span className="inline-block size-1.5 rounded-full bg-[#ff7a45]" />
          In their words
        </span>
        <h2 className="mt-5 max-w-2xl text-[clamp(1.75rem,3.2vw,2.75rem)] leading-[1.08] tracking-[-0.02em] text-white">
          The hours come back.
          <span className="text-white/55"> That’s the whole point.</span>
        </h2>
      </motion.div>

      <motion.div
        {...reveal}
        transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.12 }}
        className="mt-12 space-y-4"
      >
        <Marquee>
          <MarqueeFade side="left" className="from-[#0a0a0a]" />
          <MarqueeFade side="right" className="from-[#0a0a0a]" />
          <MarqueeContent speed={28} direction="left">
            {rowA.map((q) => (
              <MarqueeItem key={q.quote} className="mx-2 py-1">
                <QuoteCard q={q} />
              </MarqueeItem>
            ))}
          </MarqueeContent>
        </Marquee>
        <Marquee>
          <MarqueeFade side="left" className="from-[#0a0a0a]" />
          <MarqueeFade side="right" className="from-[#0a0a0a]" />
          <MarqueeContent speed={22} direction="right">
            {rowB.map((q) => (
              <MarqueeItem key={q.quote} className="mx-2 py-1">
                <QuoteCard q={q} />
              </MarqueeItem>
            ))}
          </MarqueeContent>
        </Marquee>
      </motion.div>
    </section>
  );
}
