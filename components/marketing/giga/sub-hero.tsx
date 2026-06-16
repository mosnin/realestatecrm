'use client';

/**
 * SubHero, the non-home page hero (reference-matched).
 *
 * Centered gradient product label + big serif headline, then a description on
 * the left and three mini-features on the right. Below, a large, subtly animated
 * facsimile of the REAL Chippi workspace rises out of the dark and fades into
 * the background at the bottom (over a page-geared photo, faded). Always dark
 * (cinematic), like the reference.
 *
 * The mockup is a light app window (the product is light-themed) showing the
 * actual dashboard chrome: the workspace sidebar (Chippi, People, Deals,
 * Calendar, Mailbox, Properties, Studio, Files, Settings) and the Deals
 * pipeline (stat strip + kanban with serif deal values, health dots, and
 * next-action lines), so it reads as a real screenshot, not an invented UI.
 *
 * Mobile: the window is intentionally oversized and the section clips it
 * (overflow-hidden) so it reads as a zoomed crop occupying the lower half, and
 * crucially never causes horizontal overflow, so the page scrolls cleanly.
 */

import {
  Search,
  Bell,
  Sun,
  SquarePen,
  MessageCircle,
  Users,
  Briefcase,
  Calendar,
  Inbox,
  Building2,
  Aperture,
  FolderOpen,
  Settings,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import { FEATURE_ICONS, type FeatureIconName } from './icons';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif-display), "Times New Roman", Times, serif' } as const;

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
  /** Deprecated. Kept so existing callers keep type-checking; no longer used. */
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

      {/* Big animated app window, rises out of the dark, fades at the bottom.
          On mobile it's oversized and clipped (no horizontal scroll). */}
      <div className="relative mt-16 sm:mt-20">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.3 }}
          className="mx-auto w-full max-w-[1400px] px-0 sm:px-8 lg:px-10"
        >
          {/* min-width keeps the UI from squishing; the parent section clips it */}
          <div className="mx-auto min-w-[820px] max-w-[1400px] sm:min-w-0">
            <AppMockup reduce={!!reduce} />
          </div>
        </motion.div>
        {/* fade the mockup bottom into the page */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
      </div>
    </section>
  );
}

/* ── The dashboard facsimile (a light app window) ───────────────────────────
 * A faithful miniature of the real Chippi workspace: light neutral theme,
 * serif focal values, paper-flat cards, the real sidebar nav, and the Deals
 * pipeline as the active view. */

const NAV: { icon: React.ElementType; label: string; badge?: string; active?: boolean }[] = [
  { icon: MessageCircle, label: 'Chippi' },
  { icon: Users, label: 'People', badge: '3 new' },
  { icon: Briefcase, label: 'Deals', active: true },
  { icon: Calendar, label: 'Calendar' },
  { icon: Inbox, label: 'Mailbox' },
  { icon: Building2, label: 'Properties' },
  { icon: Aperture, label: 'Studio' },
  { icon: FolderOpen, label: 'Files' },
];

const STATS = [
  { label: 'Active deals', value: '12' },
  { label: 'Closing this week', value: '3' },
  { label: 'At risk', value: '2' },
  { label: 'Total value', value: '$4.2M' },
];

const HEALTH: Record<string, string> = {
  ok: 'bg-[#15803d]',
  stuck: 'bg-[#a16207]',
  risk: 'bg-[#b91c1c]',
};

type Deal = { title: string; addr: string; value: string; gci: string; health: keyof typeof HEALTH | string; next: string };

const COLUMNS: { name: string; count: number; deals: Deal[] }[] = [
  {
    name: 'New',
    count: 3,
    deals: [{ title: 'Daniel Mercer', addr: '214 Larch Ave', value: '$650,000', gci: 'GCI $19,500', health: 'ok', next: 'Send tour times' }],
  },
  {
    name: 'Qualified',
    count: 2,
    deals: [{ title: 'The Ortega', addr: '88 Pine St', value: '$880,000', gci: 'GCI $26,400', health: 'stuck', next: 'Confirm pre-approval' }],
  },
  {
    name: 'Touring',
    count: 4,
    deals: [
      { title: 'Jade Lin', addr: '12 Harbor Rd', value: '$1.2M', gci: 'GCI $36,000', health: 'ok', next: 'Sat 2:00 showing' },
      { title: 'Priya Raman', addr: '5 Maple Ct', value: '$420,000', gci: 'GCI $12,600', health: 'risk', next: '3 days quiet' },
    ],
  },
  {
    name: 'Offer',
    count: 2,
    deals: [{ title: 'The Bauers', addr: '40 Cedar Ln', value: '$735,000', gci: 'GCI $22,050', health: 'ok', next: 'Counter sent' }],
  },
];

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.5 } },
};
const cardV = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

function AppMockup({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, -8, 0] }}
      transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      className="overflow-hidden rounded-t-2xl border border-black/10 bg-white text-neutral-900 shadow-2xl shadow-black/70"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff964f] text-[11px] font-bold text-white">C</span>
          <span style={MONO} className="text-[12px] text-neutral-500">
            Maya Chen <span className="px-1 text-neutral-300">/</span> <span className="text-neutral-900">Deals</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-neutral-400">
          <span className="hidden items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] text-neutral-400 sm:flex">
            <Search className="h-3.5 w-3.5" /> Search
            <span className="ml-1 rounded bg-neutral-100 px-1 text-[9px] text-neutral-400">⌘K</span>
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-neutral-100">
            <Bell className="h-3.5 w-3.5" />
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-neutral-100">
            <Sun className="h-3.5 w-3.5" />
          </span>
          <span className="h-7 w-7 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-900" />
        </span>
      </div>

      <div className="grid grid-cols-[210px_1fr] sm:grid-cols-[230px_1fr]">
        {/* Sidebar */}
        <div className="border-r border-neutral-200 bg-neutral-50 p-3">
          {/* Workspace switcher */}
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff964f] text-[11px] font-bold text-white">C</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-neutral-900">Maya Chen</span>
              <span className="block text-[10px] text-neutral-400">My workspace</span>
            </span>
            <SquarePen className="h-3.5 w-3.5 text-neutral-400" />
          </div>

          <p style={MONO} className="mt-4 px-2 text-[9px] font-medium uppercase tracking-[0.14em] text-neutral-400">
            Records
          </p>
          <div className="mt-1.5 space-y-0.5">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <div
                  key={n.label}
                  className={
                    'relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] ' +
                    (n.active ? 'bg-neutral-900/[0.05] font-medium text-neutral-900' : 'text-neutral-500')
                  }
                >
                  {n.active ? (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-neutral-900" />
                  ) : null}
                  <Icon className={'h-[15px] w-[15px] ' + (n.active ? 'text-neutral-900' : 'text-neutral-400')} />
                  <span className="flex-1">{n.label}</span>
                  {n.badge ? (
                    <span className="rounded-md bg-[#ff964f]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#c2410c]">
                      {n.badge}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-neutral-200 pt-3">
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] text-neutral-500">
              <Settings className="h-[15px] w-[15px] text-neutral-400" />
              Settings
            </div>
          </div>
        </div>

        {/* Main panel: Deals */}
        <div className="bg-white p-5">
          <div className="flex items-center justify-between">
            <h4 style={SERIF} className="text-[24px] leading-none text-neutral-900">Deals</h4>
            <span className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-1.5 text-[11.5px] font-medium text-white">
              Tell Chippi
            </span>
          </div>

          {/* Stat strip */}
          <div className="mt-4 grid grid-cols-4 gap-2.5">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-xl border border-neutral-200 bg-white p-3">
                <span style={SERIF} className="block text-[18px] leading-none tabular-nums text-neutral-900">{s.value}</span>
                <span className="mt-1.5 block text-[10.5px] text-neutral-400">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Kanban */}
          <motion.div
            variants={stagger}
            initial={reduce ? false : 'hidden'}
            animate="show"
            className="mt-4 grid grid-cols-4 gap-2.5"
          >
            {COLUMNS.map((col) => (
              <div key={col.name} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-2">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span style={MONO} className="text-[9px] font-medium uppercase tracking-[0.12em] text-neutral-400">{col.name}</span>
                  <span className="text-[9px] text-neutral-300">{col.count}</span>
                </div>
                <div className="space-y-2">
                  {col.deals.map((d) => (
                    <motion.div
                      key={d.title}
                      variants={cardV}
                      className="rounded-lg border border-neutral-200 bg-white p-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[12px] font-medium text-neutral-900">{d.title}</span>
                        <span className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + (HEALTH[d.health] ?? 'bg-neutral-300')} />
                      </div>
                      <span className="mt-0.5 block text-[10px] text-neutral-400">{d.addr}</span>
                      <span style={SERIF} className="mt-2 block text-[17px] leading-none tabular-nums text-neutral-900">{d.value}</span>
                      <span className="mt-1 block text-[10px] text-neutral-400">{d.gci}</span>
                      <span
                        className={
                          'mt-2 block border-t border-neutral-100 pt-1.5 text-[10px] ' +
                          (d.health === 'risk' ? 'text-[#b91c1c]' : 'text-neutral-500')
                        }
                      >
                        {d.next}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
