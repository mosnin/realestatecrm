'use client';

/**
 * ContentShowcase, the agent "Content Studio" feature section (image on the
 * LEFT). Same animated/frosted pattern as the other showcases, focused on
 * Chippi's real studio features: write listings, make visuals, schedule posts,
 * and stay on brand.
 */

import {
  PenTool,
  Palette,
  Share2,
  CalendarClock,
  Image as ImageIcon,
  Type,
  Hash,
  CalendarCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { FeatureShowcase, Frost, Row, rowV, type ShowcaseStep } from './feature-showcase';

const TOP_FEATURES = [
  { icon: Palette, title: 'On your brand', desc: 'Your colors, voice, and logo applied to everything by default.' },
  { icon: Share2, title: 'Every channel', desc: 'Listings, social posts, and emails from one place.' },
  { icon: CalendarClock, title: 'Scheduled ahead', desc: 'Queue a week of marketing in a few minutes.' },
];

const Chip = ({ label, tone }: { label: string; tone: string }) => (
  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + tone}>{label}</span>
);

const STEPS: ShowcaseStep[] = [
  {
    key: 'listing',
    title: 'Write the listing',
    desc: 'Drop in the address and the details; Chippi writes the listing description in your voice, ready to post.',
    mockup: (
      <Frost title="Listing draft" badge="In your voice">
        <Row icon={Type} title="142 Oak St" meta="3 bed · 2 bath · downtown" tone="text-[#ff9a6e]" />
        <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[12px] leading-relaxed text-white/75">
            Sun-filled 3 bedroom on a quiet downtown street, steps from the park. A renovated kitchen,
            original oak floors, and a private back patio made for slow mornings.
          </p>
        </motion.div>
        <motion.div variants={rowV} className="flex items-center justify-between px-1 pt-1">
          <span className="text-[11px] text-white/40">Matched to your past listings</span>
          <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black">Use draft</span>
        </motion.div>
      </Frost>
    ),
  },
  {
    key: 'visuals',
    title: 'Make the visuals',
    desc: 'Turn one listing into a set of branded posts and stories, sized for every platform.',
    mockup: (
      <Frost title="Social post" badge="Ready">
        <motion.div variants={rowV} className="overflow-hidden rounded-xl border border-white/10">
          <div className="relative h-28 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/research.jpg" alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <span className="absolute bottom-2 left-3 text-[12px] font-semibold text-white">Just listed, 142 Oak St</span>
          </div>
        </motion.div>
        <motion.div variants={rowV} className="flex items-center gap-2 px-1 pt-1 text-[11px] text-white/50">
          <Hash className="h-3.5 w-3.5" /> #justlisted #downtown #openhouse
        </motion.div>
        <Row icon={ImageIcon} title="3 sizes generated" meta="post · story · email header" tone="text-[#ff9a6e]" />
      </Frost>
    ),
  },
  {
    key: 'schedule',
    title: 'Schedule it all',
    desc: 'Queue a week of posts and emails across channels; Chippi spaces them out and posts on time.',
    mockup: (
      <Frost title="This week" badge="Queued">
        <Row icon={CalendarCheck} title="Mon, Just-listed post" meta="Instagram · 9:00 AM" right={<Chip label="Scheduled" tone="bg-emerald-400/15 text-emerald-300" />} />
        <Row icon={CalendarCheck} title="Wed, Open-house invite" meta="Email · 200 contacts" right={<Chip label="Scheduled" tone="bg-emerald-400/15 text-emerald-300" />} />
        <Row icon={CalendarCheck} title="Fri, Price improvement" meta="Facebook · 12:00 PM" right={<Chip label="Draft" tone="bg-white/10 text-white/60" />} active />
      </Frost>
    ),
  },
  {
    key: 'brand',
    title: 'Stay on brand',
    desc: 'Your colors, fonts, and logo are baked in, so everything Chippi makes looks unmistakably yours.',
    mockup: (
      <Frost title="Brand kit" badge="Applied">
        <Row icon={Palette} title="Brand colors" meta="3 saved" right={
          <span className="flex gap-1">
            <span className="h-4 w-4 rounded-full bg-[#ff7a45]" />
            <span className="h-4 w-4 rounded-full bg-[#1f2937]" />
            <span className="h-4 w-4 rounded-full bg-[#c77dff]" />
          </span>
        } />
        <Row icon={Type} title="Headline + body fonts" meta="Times · system sans" />
        <Row icon={PenTool} title="Logo + watermark" meta="auto-applied to media" tone="text-[#ff9a6e]" active />
      </Frost>
    ),
  },
];

export function ContentShowcase() {
  return (
    <FeatureShowcase
      eyebrow="Content studio"
      headline={
        <>
          Market every listing
          <br className="hidden sm:block" /> in minutes.
        </>
      }
      product={{
        name: 'Content Studio',
        icon: PenTool,
        desc: 'Every listing becomes a week of marketing. Chippi writes the copy, makes the visuals, and schedules it across channels, all in your brand.',
        cta: { label: 'Explore the studio', href: '/studio' },
      }}
      topFeatures={TOP_FEATURES}
      steps={STEPS}
      image="/marketing/agents-2.jpg"
      imageSide="left"
    />
  );
}
