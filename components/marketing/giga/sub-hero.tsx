'use client';

/**
 * SubHero, the non-home page hero (reference-matched).
 *
 * Centered gradient product label + big serif headline, then a description on
 * the left and three mini-features on the right. Below, a large, subtly animated
 * facsimile of the REAL Chippi workspace (DARK theme) rises out of the dark and
 * fades into the background at the bottom (over a page-geared photo shown like
 * the home hero).
 *
 * The mockup is per-page via `variant`, so each hero shows a different, relevant
 * dashboard surface (inbox, floor, the Chippi brief, connections, or the deals
 * board) on the same app shell, instead of all looking identical.
 *
 * Mobile: the window is intentionally oversized and the section clips it
 * (overflow-hidden) so it reads as a zoomed crop, never causing horizontal
 * overflow.
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
  Phone,
  FileText,
  CornerUpLeft,
  Check,
  Mail,
  Database,
  MessageSquare,
  FileSignature,
  CalendarCheck,
  SendHorizontal,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import { FEATURE_ICONS, type FeatureIconName } from './icons';
import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';

const MONO = { fontFamily: 'var(--font-mono)' } as const;
const SERIF = { fontFamily: 'var(--font-serif-display), "Times New Roman", Times, serif' } as const;

export type DashVariant = 'deals' | 'inbox' | 'floor' | 'chippi' | 'integrations';

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
  /** Page-geared background photo (shown like the home hero). */
  image?: string;
  /** Which dashboard surface the hero window shows. @default 'deals' */
  variant?: DashVariant;
  /**
   * Real dashboard screenshot to show in the hero window instead of the
   * hand-built `AppMockup` facsimile. When set, `variant` is ignored. Used by
   * the pages that have a captured screenshot (agents, brokerages, chippi); the
   * remaining SubHero pages keep the live facsimile.
   */
  mockupSrc?: string;
  /** Accessible label for `mockupSrc`. */
  mockupAlt?: string;
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
  variant = 'deals',
  mockupSrc,
  mockupAlt = 'The Chippi dashboard',
}: SubHeroProps) {
  const reduce = useReducedMotion();
  const LabelIcon = FEATURE_ICONS[labelIcon];
  const r = (d = 0) => (reduce ? { initial: false as const } : reveal(d));

  return (
    <section className="relative isolate overflow-hidden bg-[#0a0a0a] text-white">
      {/* Page-geared photo, shown like the home hero: full-bleed at full opacity
          under dark scrims (top for the heading, bottom into the next section)
          plus a soft vignette so the copy always reads. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" className="h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/80 via-[#0a0a0a]/35 to-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_30%,transparent_30%,rgba(10,10,10,0.55)_100%)]" />
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
          <motion.p {...r(0.16)} className="max-w-sm text-[14.5px] leading-relaxed text-white/60">
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
                  <Icon className="h-[18px] w-[18px] text-white/60" />
                  <h3 style={{ fontFamily: 'var(--font-sans)' }} className="mt-3.5 text-[13.5px] font-medium text-white">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/50">{f.desc}</p>
                </div>
              );
            })}
          </motion.div>
        </div>
      </div>

      {/* Big animated app window (dark), rises out of the dark, fades at the
          bottom. On mobile it's oversized and clipped (no horizontal scroll). */}
      <div className="relative mt-16 sm:mt-20">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.3 }}
          className="mx-auto w-full max-w-[1400px] px-0 sm:px-8 lg:px-10"
        >
          <div className="mx-auto min-w-[820px] max-w-[1400px] sm:min-w-0">
            {mockupSrc ? (
              <HeroScreenshot reduce={!!reduce} src={mockupSrc} alt={mockupAlt} />
            ) : (
              <AppMockup reduce={!!reduce} variant={variant} />
            )}
          </div>
        </motion.div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
      </div>
    </section>
  );
}

/* ── Real dashboard screenshot ──────────────────────────────────────────────
 * A captured screenshot instead of the hand-built facsimile below. The asset
 * already carries its own window chrome (rounded corners + light fill) on a
 * TRANSPARENT canvas, so we add no dark panel/border/shadow of our own — that
 * would box the shot in a black card. The transparent margins fall straight
 * onto the page, and the section's bottom gradient fades the shot into it.
 * Just the slow float; the image keeps its own aspect ratio. */

function HeroScreenshot({ reduce, src, alt }: { reduce: boolean; src: string; alt: string }) {
  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, -8, 0] }}
      transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: 'easeInOut' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block h-auto w-full select-none" draggable={false} />
    </motion.div>
  );
}

/* ── The dashboard facsimile (a DARK app window) ────────────────────────────
 * A faithful miniature of the real Chippi workspace in dark mode: the same
 * sidebar + chrome, with a per-variant main panel so each page's hero is
 * distinct. */

const NAV: { icon: React.ElementType; label: string; badge?: string }[] = [
  { icon: MessageCircle, label: 'Chippi' },
  { icon: Users, label: 'People', badge: '3 new' },
  { icon: Briefcase, label: 'Deals' },
  { icon: Calendar, label: 'Calendar' },
  { icon: Inbox, label: 'Mailbox' },
  { icon: Building2, label: 'Properties' },
  { icon: Aperture, label: 'Studio' },
  { icon: FolderOpen, label: 'Files' },
];

const VARIANT_META: Record<DashVariant, { page: string; active: string }> = {
  deals: { page: 'Deals', active: 'Deals' },
  inbox: { page: 'People', active: 'People' },
  floor: { page: 'Floor', active: 'Deals' },
  chippi: { page: 'Chippi', active: 'Chippi' },
  integrations: { page: 'Integrations', active: 'Settings' },
};

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.45 } } };
const cardV = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } } };

const Avatar = ({ initials }: { initials: string }) => (
  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-[10px] font-semibold text-black">
    {initials}
  </span>
);

function AppMockup({ reduce, variant }: { reduce: boolean; variant: DashVariant }) {
  const meta = VARIANT_META[variant];
  return (
    <motion.div
      animate={reduce ? undefined : { y: [0, -8, 0] }}
      transition={reduce ? undefined : { duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      className="overflow-hidden rounded-t-2xl border border-white/10 bg-[#0c0c0d] text-white shadow-2xl shadow-black/70"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2.5">
        <span className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff964f] text-[11px] font-bold text-white">C</span>
          <span style={MONO} className="text-[12px] text-white/45">
            Maya Chen <span className="px-1 text-white/25">/</span> <span className="text-white/90">{meta.page}</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-white/40">
          <span className="hidden items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] sm:flex">
            <Search className="h-3.5 w-3.5" /> Search
            <span className="ml-1 rounded bg-white/[0.06] px-1 text-[9px]">⌘K</span>
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/[0.06]"><Bell className="h-3.5 w-3.5" /></span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/[0.06]"><Sun className="h-3.5 w-3.5" /></span>
          <span className="h-7 w-7 rounded-full bg-gradient-to-br from-white/30 to-white/10" />
        </span>
      </div>

      <div className="grid grid-cols-[210px_1fr] sm:grid-cols-[230px_1fr]">
        {/* Sidebar */}
        <div className="border-r border-white/[0.06] bg-[#0e0e10] p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ff964f] text-[11px] font-bold text-white">C</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium text-white">Maya Chen</span>
              <span className="block text-[10px] text-white/35">My workspace</span>
            </span>
            <SquarePen className="h-3.5 w-3.5 text-white/35" />
          </div>
          <p style={MONO} className="mt-4 px-2 text-[9px] font-medium uppercase tracking-[0.14em] text-white/30">Records</p>
          <div className="mt-1.5 space-y-0.5">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = n.label === meta.active;
              return (
                <div
                  key={n.label}
                  className={
                    'relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] ' +
                    (active ? 'bg-white/[0.06] font-medium text-white' : 'text-white/45')
                  }
                >
                  {active ? <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-[#ff964f]" /> : null}
                  <Icon className={'h-[15px] w-[15px] ' + (active ? 'text-white' : 'text-white/40')} />
                  <span className="flex-1">{n.label}</span>
                  {n.badge ? <span className="rounded-md bg-[#ff964f]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#ff9a6e]">{n.badge}</span> : null}
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <div className={'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12.5px] ' + (meta.active === 'Settings' ? 'bg-white/[0.06] font-medium text-white' : 'text-white/45')}>
              <Settings className="h-[15px] w-[15px] text-white/40" /> Settings
            </div>
          </div>
        </div>

        {/* Main panel */}
        <motion.div variants={stagger} initial={reduce ? false : 'hidden'} animate="show" className="bg-[#0c0c0d] p-5">
          {variant === 'deals' && <DealsPanel />}
          {variant === 'inbox' && <InboxPanel />}
          {variant === 'floor' && <FloorPanel />}
          {variant === 'chippi' && <ChippiPanel />}
          {variant === 'integrations' && <IntegrationsPanel />}
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ── Panels ─────────────────────────────────────────────────────────────── */

function PanelHead({ title, cta = 'Tell Chippi' }: { title: string; cta?: string }) {
  return (
    <div className="flex items-center justify-between">
      <h4 style={SERIF} className="text-[24px] leading-none text-white">{title}</h4>
      <span className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-medium text-black">{cta}</span>
    </div>
  );
}

const HEALTH: Record<string, string> = { ok: 'bg-[#4ade80]', stuck: 'bg-[#fbbf24]', risk: 'bg-[#f87171]' };

function DealsPanel() {
  const COLUMNS: { name: string; count: number; deals: { t: string; a: string; v: string; g: string; h: string; n: string }[] }[] = [
    { name: 'New', count: 3, deals: [{ t: 'Daniel Mercer', a: '214 Larch Ave', v: '$650,000', g: 'GCI $19,500', h: 'ok', n: 'Send tour times' }] },
    { name: 'Qualified', count: 2, deals: [{ t: 'The Ortega', a: '88 Pine St', v: '$880,000', g: 'GCI $26,400', h: 'stuck', n: 'Confirm pre-approval' }] },
    { name: 'Touring', count: 4, deals: [
      { t: 'Jade Lin', a: '12 Harbor Rd', v: '$1.2M', g: 'GCI $36,000', h: 'ok', n: 'Sat 2:00 showing' },
      { t: 'Priya Raman', a: '5 Maple Ct', v: '$420,000', g: 'GCI $12,600', h: 'risk', n: '3 days quiet' },
    ] },
    { name: 'Offer', count: 2, deals: [{ t: 'The Bauers', a: '40 Cedar Ln', v: '$735,000', g: 'GCI $22,050', h: 'ok', n: 'Counter sent' }] },
  ];
  return (
    <>
      <PanelHead title="Deals" />
      <motion.div variants={cardV} className="mt-4 grid grid-cols-4 gap-2.5">
        {[{ n: '12', l: 'Active' }, { n: '3', l: 'Closing' }, { n: '2', l: 'At risk' }, { n: '$4.2M', l: 'Value' }].map((s) => (
          <div key={s.l} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <span style={SERIF} className="block text-[18px] leading-none tabular-nums text-white">{s.n}</span>
            <span className="mt-1.5 block text-[10.5px] text-white/40">{s.l}</span>
          </div>
        ))}
      </motion.div>
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {COLUMNS.map((col) => (
          <motion.div variants={cardV} key={col.name} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <span style={MONO} className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">{col.name}</span>
              <span className="text-[9px] text-white/25">{col.count}</span>
            </div>
            <div className="space-y-2">
              {col.deals.map((d) => (
                <div key={d.t} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[12px] font-medium text-white">{d.t}</span>
                    <span className={'h-1.5 w-1.5 flex-shrink-0 rounded-full ' + (HEALTH[d.h] ?? 'bg-white/30')} />
                  </div>
                  <span className="mt-0.5 block text-[10px] text-white/40">{d.a}</span>
                  <span style={SERIF} className="mt-2 block text-[17px] leading-none tabular-nums text-white">{d.v}</span>
                  <span className="mt-1 block text-[10px] text-white/40">{d.g}</span>
                  <span className={'mt-2 block border-t border-white/[0.06] pt-1.5 text-[10px] ' + (d.h === 'risk' ? 'text-[#f87171]' : 'text-white/55')}>{d.n}</span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function InboxPanel() {
  const TIERS: Record<string, string> = { Hot: 'text-[#f87171] bg-[#f87171]/12', Warm: 'text-[#fbbf24] bg-[#fbbf24]/12', Cold: 'text-[#60a5fa] bg-[#60a5fa]/12' };
  const LEADS = [
    { in: 'DM', n: 'Daniel Mercer', t: 'Hot', m: 'Is 214 Larch still open this weekend?', b: '$650k' },
    { in: 'PR', n: 'Priya Raman', t: 'Warm', m: 'Asking about financing options', b: '$420k' },
    { in: 'JL', n: 'Jade Lin', t: 'Hot', m: 'Loved the loft, wants two more', b: '$1.2M' },
    { in: 'TB', n: 'The Bauers', t: 'Warm', m: 'Counter looks good, reviewing', b: '$735k' },
    { in: 'ZL', n: 'Zillow lead', t: 'Cold', m: 'Saved 88 Pine three times', b: '$510k' },
  ];
  return (
    <>
      <PanelHead title="People" />
      <motion.div variants={cardV} className="mt-4 flex items-center gap-2 text-[11px] text-white/40">
        <span className="rounded-md bg-white/[0.05] px-2 py-1 text-white/70">All leads</span>
        <span className="rounded-md px-2 py-1">New</span>
        <span className="rounded-md px-2 py-1">Buyers</span>
        <span className="ml-auto flex items-center gap-1.5 text-[#ff9a6e]"><CornerUpLeft className="h-3 w-3" />4 drafts ready</span>
      </motion.div>
      <div className="mt-3 overflow-hidden rounded-xl border border-white/[0.07]">
        {LEADS.map((l, i) => (
          <motion.div variants={cardV} key={l.n} className={'flex items-center gap-3 px-3 py-2.5 ' + (i % 2 ? 'bg-white/[0.015]' : '')}>
            <Avatar initials={l.in} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium text-white">{l.n}</span>
                <span className={'rounded-full px-1.5 py-0.5 text-[9px] font-semibold ' + TIERS[l.t]}>{l.t}</span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-white/45">{l.m}</span>
            </span>
            <span style={SERIF} className="text-[14px] tabular-nums text-white/80">{l.b}</span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function FloorPanel() {
  const AGENTS = [
    { in: 'AR', n: 'Alex Rivera', vol: '$1.6M', w: '92%', rank: '#1' },
    { in: 'JK', n: 'Jordan Kim', vol: '$1.3M', w: '74%', rank: '#2' },
    { in: 'SP', n: 'Sam Patel', vol: '$1.1M', w: '63%', rank: '#3' },
    { in: 'MC', n: 'Mia Chen', vol: '$0.9M', w: '51%', rank: '#4' },
  ];
  return (
    <>
      <PanelHead title="Floor" cta="Route a lead" />
      <motion.div variants={cardV} className="mt-4 grid grid-cols-4 gap-2.5">
        {[{ n: '35', l: 'Agents' }, { n: '142', l: 'Deals' }, { n: '18', l: 'Closed MTD' }, { n: '$4.2M', l: 'Volume' }].map((s) => (
          <div key={s.l} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <span style={SERIF} className="block text-[18px] leading-none tabular-nums text-white">{s.n}</span>
            <span className="mt-1.5 block text-[10.5px] text-white/40">{s.l}</span>
          </div>
        ))}
      </motion.div>
      <motion.div variants={cardV} className="mt-3 flex items-center justify-between px-1">
        <span style={MONO} className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/35">Leaderboard, this month</span>
      </motion.div>
      <div className="mt-2 space-y-2">
        {AGENTS.map((a) => (
          <motion.div variants={cardV} key={a.n} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <Avatar initials={a.in} />
            <span className="w-28 flex-shrink-0 truncate text-[12.5px] font-medium text-white">{a.n}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#ff7a45] to-[#ff5fa2]" style={{ width: a.w }} />
            </span>
            <span style={SERIF} className="w-14 text-right text-[13px] tabular-nums text-white/80">{a.vol}</span>
            <span className="w-7 text-right text-[11px] font-medium text-white/45">{a.rank}</span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function ChippiPanel() {
  const ONDECK = [
    { icon: CornerUpLeft, t: 'Reply to Sarah Chen', m: 'drafted in your voice', tone: 'text-[#ff9a6e]' },
    { icon: Phone, t: 'Call Daniel Mercer', m: 'hot lead, asked to tour', tone: 'text-[#60a5fa]' },
    { icon: FileText, t: 'Review listing draft', m: '142 Oak St, ready', tone: 'text-[#4ade80]' },
  ];
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff964f] text-[11px] font-bold text-white">C</span>
        <h4 style={SERIF} className="text-[22px] leading-none text-white">Good morning, Maya.</h4>
      </div>
      <motion.p variants={cardV} className="mt-2 text-[12px] text-white/45">3 new leads, 4 follow-ups due, 2 drafts ready.</motion.p>

      <motion.p variants={cardV} style={MONO} className="mt-5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/30">On deck</motion.p>
      <div className="mt-2 space-y-2">
        {ONDECK.map((c) => {
          const Icon = c.icon;
          return (
            <motion.div variants={cardV} key={c.t} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <span className={'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] ' + c.tone}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-white">{c.t}</span>
                <span className="block text-[11px] text-white/45">{c.m}</span>
              </span>
              <span className="rounded-md bg-white px-2.5 py-1 text-[10px] font-semibold text-black">Open</span>
            </motion.div>
          );
        })}
      </div>

      <motion.div variants={cardV} className="mt-4 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2.5">
        <span className="flex-1 text-[12px] text-white/40">Ask Chippi to draft, book, or summarize...</span>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#ff964f] text-white"><SendHorizontal className="h-3.5 w-3.5" /></span>
      </motion.div>
    </>
  );
}

function IntegrationsPanel() {
  const APPS = [
    { icon: Mail, n: 'Gmail', d: 'reading + drafting' },
    { icon: CalendarCheck, n: 'Google Calendar', d: 'availability + booking' },
    { icon: Database, n: 'HubSpot', d: 'contacts + deals, two-way' },
    { icon: FileSignature, n: 'Documents', d: 'stored on the deal' },
    { icon: MessageSquare, n: 'WhatsApp', d: 'send + follow up' },
    { icon: Phone, n: 'WhatsApp', d: 'send + follow up' },
  ];
  return (
    <>
      <PanelHead title="Integrations" cta="Add tool" />
      <motion.p variants={cardV} className="mt-3 text-[12px] text-white/45">Connected through Composio. Inbox, calendar, CRM, and more.</motion.p>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {APPS.map((a) => {
          const Icon = a.icon;
          return (
            <motion.div variants={cardV} key={a.n} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/70">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-white">{a.n}</span>
                <span className="block truncate text-[10.5px] text-white/45">{a.d}</span>
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[#4ade80]/12 px-2 py-0.5 text-[9px] font-semibold text-[#4ade80]">
                <Check className="h-2.5 w-2.5" />On
              </span>
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
