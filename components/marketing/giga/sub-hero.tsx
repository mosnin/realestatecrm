'use client';

/**
 * SubHero, the non-home page hero (reference-matched).
 *
 * Centered gradient product label + big serif headline, then a description on
 * the left and three mini-features on the right. Below, a large, subtly animated
 * app-UI mockup rises out of the dark and fades into the background at the
 * bottom (over a page-geared photo, faded). Always dark (cinematic), like the
 * reference.
 *
 * Mobile: the mockup is intentionally oversized and the section clips it
 * (overflow-hidden) so it reads as a zoomed crop occupying the lower half, and
 * crucially never causes horizontal overflow, so the page scrolls cleanly.
 */

import {
  Search,
  KanbanSquare,
  Database,
  UserCog,
  Workflow,
  Code2,
  Folder,
  CornerDownRight,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import { FEATURE_ICONS, type FeatureIconName } from './icons';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';

const MONO = { fontFamily: 'var(--font-mono)' } as const;

export interface SubHeroFeature {
  icon: FeatureIconName;
  title: string;
  desc: string;
}

export interface SubHeroProps {
  /** Gradient product label + its small icon (by registry name). */
  label: string;
  labelIcon: FeatureIconName;
  headline: React.ReactNode;
  description: string;
  features: [SubHeroFeature, SubHeroFeature, SubHeroFeature];
  /** Page-geared background photo (faded at the bottom). Placeholder for now. */
  image?: string;
  /** Heading for the mockup's active workflow (keeps it page-relevant). */
  workflow?: string;
}

const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 16, filter: 'blur(8px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.8, ease: EASE_OUT, delay },
});

export function SubHero({
  label,
  labelIcon,
  headline,
  description,
  features,
  image = '/marketing/home-hero.jpg',
  workflow = 'New buyer lead',
}: SubHeroProps) {
  const reduce = useReducedMotion();
  const LabelIcon = FEATURE_ICONS[labelIcon];
  const r = (d = 0) => (reduce ? { initial: false as const } : reveal(d));

  return (
    <section className="relative isolate overflow-hidden bg-[#0a0a0a] text-white">
      {/* Page-geared photo, faded into the dark along the bottom */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[70%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover opacity-25" style={{ filter: 'saturate(0.8) brightness(0.7)' }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/40 via-[#0a0a0a]/70 to-[#0a0a0a]" />
      </div>

      {/* Heading block */}
      <div className="mx-auto max-w-[1728px] px-5 pt-36 text-center sm:px-8 sm:pt-44 lg:px-10">
        <motion.div {...r(0)}>
          <span className="inline-flex items-center gap-2">
            <LabelIcon className="h-6 w-6" stroke="url(#chippi-grad)" strokeWidth={1.75} />
            <AnimatedGradientText
              speed={2}
              colorFrom="#ff7a45"
              colorTo="#c77dff"
              className="text-[26px] font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {label}
            </AnimatedGradientText>
          </span>
        </motion.div>
        <motion.h1
          {...r(0.08)}
          className="mx-auto mt-6 max-w-4xl text-balance text-[clamp(2.25rem,5vw,4rem)] leading-[1.04] tracking-[-0.02em] text-white"
        >
          {headline}
        </motion.h1>

        {/* Description (left) + three mini-features (right) */}
        <div className="mx-auto mt-14 grid max-w-5xl gap-8 text-left lg:grid-cols-[1fr_1.25fr] lg:gap-16">
          <motion.p {...r(0.16)} className="max-w-sm text-[14.5px] leading-relaxed text-white/55">
            {description}
          </motion.p>
          <motion.div
            {...r(0.22)}
            className="grid grid-cols-1 gap-y-7 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/[0.08]"
          >
            {features.map((f) => {
              const Icon = FEATURE_ICONS[f.icon];
              return (
                <div key={f.title} className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
                  <Icon className="h-[18px] w-[18px] text-white/55" />
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="mt-3.5 text-[13.5px] font-medium text-white">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/45">{f.desc}</p>
                </div>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* Big animated app mockup, rises out of the dark, fades at the bottom.
          On mobile it's oversized and clipped (no horizontal scroll). */}
      <div className="relative mt-16 sm:mt-20">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.3 }}
          className="mx-auto w-full max-w-[1400px] px-0 sm:px-8 lg:px-10"
        >
          {/* min-width keeps the UI from squishing; the parent section clips it */}
          <div className="mx-auto min-w-[760px] max-w-[1400px] sm:min-w-0">
            <AppMockup reduce={!!reduce} workflow={workflow} />
          </div>
        </motion.div>
        {/* fade the mockup bottom into the page */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
      </div>
    </section>
  );
}

/* ── The app-UI mockup ──────────────────────────────────────────────────── */

const NAV = [
  { icon: KanbanSquare, label: 'Pipeline', active: true },
  { icon: Database, label: 'Data sources' },
  { icon: UserCog, label: 'Personalization' },
  { icon: Workflow, label: 'Automations' },
  { icon: Code2, label: 'Advanced' },
];

const WORKFLOWS = ['New buyer lead', 'Seller inquiry', 'Open-house follow-up', 'Past-client check-in'];
const DOCS = ['Buyer guide.pdf', 'Listing sheet.csv', 'Disclosures.pdf'];

const SCENARIOS = [
  {
    n: 1,
    title: 'Lead arrives',
    say: '“Hi Sarah, thanks for reaching out about 142 Oak St. Want me to set up a time to see it?”',
    branches: [
      { label: 'Replies, interested', chip: '@interested', tone: 'text-sky-300 bg-sky-400/12', to: 'Qualify' },
      { label: 'No reply in 24h', chip: '@cold', tone: 'text-white/60 bg-white/[0.06]', to: 'Nurture' },
    ],
  },
  {
    n: 2,
    title: 'Qualify',
    say: '“Great! Are you pre-approved, and what timeline are you working with?”',
    branches: [
      { label: 'Pre-approved', chip: 'verify_budget', tone: 'text-emerald-300 bg-emerald-400/12', to: 'Book tour' },
      { label: 'Not yet', chip: '@nurture', tone: 'text-amber-300 bg-amber-400/12', to: 'Send listings' },
    ],
  },
  {
    n: 3,
    title: 'Book tour',
    say: '“Perfect, I have Saturday at 2:00 or Sunday at 11:00. Which works?”',
    branches: [
      { label: 'Time confirmed', chip: 'accepted', tone: 'text-emerald-300 bg-emerald-400/12', to: 'Confirm & log' },
    ],
  },
];

function AppMockup({ reduce, workflow }: { reduce: boolean; workflow: string }) {
  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, -8, 0] }}
      transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      className="overflow-hidden rounded-t-2xl border border-white/12 bg-[#0c0c0d]/80 shadow-2xl shadow-black/70 backdrop-blur-2xl"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[11px] font-bold text-black">C</span>
          <span className="text-[13px] font-medium text-white">Chippi workspace</span>
          <span className="ml-2 hidden rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/50 sm:inline">Multi-modal</span>
        </span>
        <span className="flex items-center gap-2 text-[11px] text-white/55">
          <span className="hidden sm:inline">draft</span>
          <span className="flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-black">Deploy workflow</span>
        </span>
      </div>

      <div className="grid grid-cols-[230px_1fr] sm:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <div className="border-r border-white/[0.08] p-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[12px] text-white/45">
            <Search className="h-3.5 w-3.5" /> Search…
            <span className="ml-auto rounded bg-white/10 px-1 text-[9px] text-white/40">⌘K</span>
          </div>
          <div className="mt-3 space-y-0.5">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <div
                  key={n.label}
                  className={
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] ' +
                    (n.active ? 'bg-white/[0.07] text-white' : 'text-white/55')
                  }
                >
                  <Icon className={'h-4 w-4 ' + (n.active ? 'text-[#ff9a6e]' : 'text-white/45')} />
                  {n.label}
                </div>
              );
            })}
          </div>
          <p style={MONO} className="mt-5 px-2.5 text-[10px] uppercase tracking-[0.18em] text-white/35">Workflows</p>
          <div className="mt-2 space-y-0.5">
            {WORKFLOWS.map((w) => (
              <div
                key={w}
                className={
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ' +
                  (w === workflow ? 'bg-white/[0.06] text-white' : 'text-white/45')
                }
              >
                <Folder className="h-3.5 w-3.5 text-white/35" /> {w}
              </div>
            ))}
          </div>
          <p style={MONO} className="mt-5 px-2.5 text-[10px] uppercase tracking-[0.18em] text-white/35">Docs</p>
          <div className="mt-2 space-y-0.5">
            {DOCS.map((d) => (
              <div key={d} className="px-2.5 py-1.5 text-[12px] text-white/40">{d}</div>
            ))}
          </div>
        </div>

        {/* Main panel */}
        <div className="p-5">
          <h4 className="text-[18px] font-medium text-white">Workflow: {workflow}</h4>
          <motion.div
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.5 } } }}
            initial={reduce ? false : 'hidden'}
            animate="show"
            className="mt-5 space-y-5"
          >
            {SCENARIOS.map((s) => (
              <motion.div
                key={s.n}
                variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_OUT } } }}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/15 text-[10px] text-white/60">{s.n}</span>
                  <span className="text-[14px] font-medium text-white">{s.title}</span>
                </div>
                <div className="ml-2.5 border-l border-white/[0.08] pl-5 pt-2">
                  <div className="flex gap-2 text-[12.5px] text-white/60">
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">Say</span>
                    <span className="italic">{s.say}</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {s.branches.map((b) => (
                      <div key={b.label} className="flex flex-wrap items-center gap-2 text-[12.5px] text-white/70">
                        <CornerDownRight className="h-3.5 w-3.5 text-white/30" />
                        {b.label}
                        <span style={MONO} className={'rounded px-1.5 py-0.5 text-[10.5px] ' + b.tone}>{b.chip}</span>
                        <span className="text-white/40">proceed to</span>
                        <span className="flex items-center gap-1 text-white/80">
                          <span className="h-1.5 w-1.5 rounded-full border border-white/30" /> {b.to}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
