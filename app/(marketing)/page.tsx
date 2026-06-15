/**
 * `/` (home) — the dark, cinematic marketing homepage ("Giga" redesign).
 *
 * Sections, in order:
 *   1. Hero — full-bleed real-estate photo, centered thin serif headline, white
 *      pill CTA, a bottom-left video/testimonial card, and a logo cloud.
 *   2. FeatureCarousel — the auto-advancing tabbed feature showcase with
 *      per-tab progress bars (the signature interaction).
 *   3. FeatureSection ×4 — the alternating large-card feature blocks (the image
 *      side flips each section: right, left, right, left).
 *   4. Stats — the big-numbers band.
 *   5. Complexity — the "built to handle complexity" closer.
 *   (The closing CTA + footer live in the marketing layout's SiteFooter.)
 *
 * The aesthetic matches the reference; the copy stays Chippi/real-estate.
 * Auth users are bounced to their workspace before any of this renders.
 *
 * NOTE: this is a Server Component (it `auth()`s), so feature icons are passed
 * to the client FeatureSection BY NAME (a string) and resolved via the icon
 * registry — components/functions can't cross the server→client boundary.
 */

import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Hero } from '@/components/marketing/giga/hero';
import { FeatureCarousel } from '@/components/marketing/giga/feature-carousel';
import {
  FeatureSection,
  type FeatureSectionProps,
} from '@/components/marketing/giga/feature-section';
import { Stats } from '@/components/marketing/giga/stats';
import { Complexity } from '@/components/marketing/giga/complexity';

// The alternating large-card sections. `imageSide` flips each entry so the page
// reads right / left / right / left down the column.
const SECTIONS: FeatureSectionProps[] = [
  {
    eyebrow: 'Natural voice',
    heading: (
      <>
        Talk to your CRM
        <br className="hidden sm:block" /> like a teammate.
      </>
    ),
    blurbs: [
      { icon: 'Mic', title: 'Hands-free', desc: 'Capture a lead or update a deal between showings, out loud.' },
      { icon: 'Waves', title: 'Real conversation', desc: 'Ask follow-ups; Chippi holds the context like a person would.' },
      { icon: 'Languages', title: '30+ languages', desc: 'Speak and write to clients in the language they prefer.' },
    ],
    card: {
      icon: 'Mic',
      title: 'A cowork you can just talk to',
      body: 'Drive your whole book by voice — log a call, draft a reply, book a tour — without opening a single form. Chippi understands the ask and shows you exactly what it will do before it acts.',
      cta: { label: 'Explore voice', href: '/agents' },
    },
    image: { src: '/marketing/product/live-demo.jpg', alt: 'Chippi taking a voice instruction between showings' },
    imageSide: 'right',
  },
  {
    eyebrow: 'Smart insights',
    heading: (
      <>
        The next best move,
        <br className="hidden sm:block" /> always on top.
      </>
    ),
    blurbs: [
      { icon: 'Target', title: 'Intent scoring', desc: 'Every lead ranked against your real pipeline, not a generic rubric.' },
      { icon: 'TrendingUp', title: 'Live signals', desc: 'Opens, replies, and tour interest move a lead up the list.' },
      { icon: 'BarChart3', title: 'Plain-language why', desc: 'Each score comes with the reason, so you trust the order.' },
    ],
    card: {
      icon: 'Target',
      title: 'Know who to call first',
      body: 'Chippi reads the whole book and surfaces who is ready to move now — with the context and the suggested next step attached, so your first hour goes to the deals most likely to close.',
      cta: { label: 'Explore insights', href: '/agents' },
    },
    image: { src: '/marketing/product/brokerages.jpg', alt: 'Chippi ranking leads by intent' },
    imageSide: 'left',
  },
  {
    eyebrow: 'Pipeline automation',
    heading: (
      <>
        A pipeline that keeps
        <br className="hidden sm:block" /> itself current.
      </>
    ),
    blurbs: [
      { icon: 'CalendarCheck', title: 'Tours that book', desc: 'Approve a time and the calendar, thread, and deal all update.' },
      { icon: 'Workflow', title: 'Stages advance', desc: 'The board moves with the work — no dragging cards by hand.' },
      { icon: 'Bell', title: 'Nothing slips', desc: 'Follow-ups are queued and worked, day and night.' },
    ],
    card: {
      icon: 'Workflow',
      title: 'The busywork runs itself',
      body: 'From first reply to closing, Chippi keeps the record straight: confirmations sent, stages moved, the next touch scheduled — every action written down in plain language you can audit.',
      cta: { label: 'Explore automation', href: '/agents' },
    },
    image: { src: '/marketing/product/integrations.jpg', alt: 'Chippi advancing a deal on the pipeline board' },
    imageSide: 'right',
  },
  {
    eyebrow: 'Omnichannel inbox',
    heading: (
      <>
        Every channel, one
        <br className="hidden sm:block" /> queue that gets worked.
      </>
    ),
    blurbs: [
      { icon: 'Mail', title: 'Email', desc: 'Inbound mail read, sorted, and drafted against the right deal.' },
      { icon: 'Phone', title: 'Calls & text', desc: 'Missed calls and SMS captured and followed up automatically.' },
      { icon: 'Inbox', title: 'One worked queue', desc: 'No tab-hopping — everything to handle in a single list.' },
    ],
    card: {
      icon: 'Inbox',
      title: 'No lead goes cold',
      body: 'Email, text, and calls land in one queue Chippi keeps moving around the clock. While you are out showing, the first response still goes out in minutes — in your voice, on every channel.',
      cta: { label: 'Explore the inbox', href: '/agents' },
    },
    image: { src: '/marketing/product/realtors.jpg', alt: 'Chippi working an omnichannel inbox' },
    imageSide: 'left',
  },
];

export default async function MarketingHomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect('/auth/redirect?intent=realtor');
  }

  return (
    <>
      <Hero />
      <FeatureCarousel />
      {SECTIONS.map((s) => (
        <FeatureSection key={s.eyebrow} {...s} />
      ))}
      <Stats />
      <Complexity />
    </>
  );
}
