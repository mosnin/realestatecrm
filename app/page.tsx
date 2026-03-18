'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Link2,
  MessageSquareMore,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { track } from '@vercel/analytics';
import { HeroSection } from '@/components/ui/hero-section-1';
import { VideoPlayer } from '@/components/ui/video-player';
import AnimatedFooter from '@/components/ui/animated-footer';
import {
  AnimatedCard,
  CardVisual,
  CardBody,
  CardTitle,
  CardDescription,
  Visual3,
} from '@/components/ui/animated-card-chart';
import {
  AnimatedCard as AnimatedCard2,
  CardVisual as CardVisual2,
  CardBody as CardBody2,
  CardTitle as CardTitle2,
  CardDescription as CardDescription2,
  Visual2,
} from '@/components/ui/animated-card-diagram';
import {
  AnimatedCard as AnimatedCard3,
  CardVisual as CardVisual3,
  CardBody as CardBody3,
  CardTitle as CardTitle3,
  CardDescription as CardDescription3,
  Visual1,
} from '@/components/ui/animated-card-line';
import { Stats } from '@/components/ui/statistics-card';

const leadFeedItems = [
  {
    name: 'New rental application',
    description: 'Jordan Reyes · Budget $2,800 · Midtown · Move-in Aug 1',
    time: 'just now',
    icon: '📝',
    color: '#d97706',
  },
  {
    name: 'Lead scored: warm',
    description: 'Ava Thompson · Score 68 · Strong timeline match',
    time: '2m ago',
    icon: '📊',
    color: '#f59e0b',
  },
  {
    name: 'New renter inquiry',
    description: 'Carlos Mendez · 2BR · Pet friendly · Downtown',
    time: '4m ago',
    icon: '🏠',
    color: '#3b82f6',
  },
  {
    name: 'Priority lead',
    description: 'Nina Patel · Score 82 · Ready to tour this week',
    time: '7m ago',
    icon: '⚡',
    color: '#ef4444',
  },
];

const animatedLeadFeed = Array.from({ length: 3 }, () => leadFeedItems).flat();

const featureHighlights = [
  {
    icon: Link2,
    title: 'One intake link',
    description:
      'Share a single clean link in your bio, listing replies, or email signature. Every renter inquiry starts in the same place.',
  },
  {
    icon: ClipboardList,
    title: 'Structured qualification',
    description:
      'Capture budget, move-in date, neighborhoods, household details, and deal blockers in a guided flow.',
  },
  {
    icon: Gauge,
    title: 'AI lead scoring',
    description:
      'Get assistive lead priority with context so you know who to call first and why — not just a number.',
  },
  {
    icon: MessageSquareMore,
    title: 'Faster follow-up',
    description:
      'Review qualified records in one lightweight command center instead of piecing together DMs and notes.',
  },
  {
    icon: Users,
    title: 'Contact CRM',
    description:
      'Full contact profiles with activity logs, email history, deal tracking, and follow-up scheduling.',
  },
  {
    icon: TrendingUp,
    title: 'Pipeline analytics',
    description:
      'Track qualification rates, lead velocity, and conversion trends in one view — no spreadsheet required.',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Share your intake link',
    body: 'Drop it in your bio, listing replies, or email signature. Renters fill out a structured form in minutes.',
  },
  {
    step: '02',
    title: 'Capture structured details',
    body: 'Budget, move-in date, neighborhoods, household size — every submission lands as a clean lead record.',
  },
  {
    step: '03',
    title: 'Review with AI context',
    body: 'See which leads to prioritize with practical scoring and supporting context already attached.',
  },
  {
    step: '04',
    title: 'Follow up from one workflow',
    body: 'Status, notes, contacts, and next steps — all in one command center instead of scattered threads.',
  },
];

function LeadFeedItem({
  name,
  description,
  icon,
  color,
  time,
}: {
  name: string;
  description: string;
  icon: string;
  color: string;
  time: string;
}) {
  return (
    <figure className="mx-auto w-full rounded-2xl border border-border bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-transform duration-200 hover:scale-[1.02]">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl text-lg"
          style={{ backgroundColor: color }}
        >
          <span>{icon}</span>
        </div>
        <div className="min-w-0 flex-1">
          <figcaption className="flex items-center gap-1 text-sm font-semibold text-foreground">
            <span className="truncate">{name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-xs font-normal text-muted-foreground">{time}</span>
          </figcaption>
          <p className="truncate text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </figure>
  );
}

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

export default function HomePage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      {/* Hero (includes its own header/nav) */}
      <HeroSection />

      {/* Metrics strip */}
      <section className="w-full bg-surface py-20 px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {[
              {
                stat: '< 5 min',
                label: 'Time to go live',
                body: 'From sign-up to a shareable intake link — no setup calls, no configuration headaches.',
              },
              {
                stat: '3×',
                label: 'Faster lead triage',
                body: 'Stop piecing together DMs and notes. One workflow replaces the scattered back-and-forth.',
              },
              {
                stat: '100%',
                label: 'Of submissions scored',
                body: 'Every renter application is automatically prioritized with context before you even open it.',
              },
            ].map(({ stat, label, body }) => (
              <div key={label} className="flex flex-col items-center text-center px-8 py-10 sm:py-0 first:pt-0 last:pb-0 sm:first:pt-0 sm:last:pb-0">
                <span className="text-6xl md:text-7xl font-bold text-primary tracking-tight" style={{ fontFamily: '"Times New Roman MT", "Times New Roman", Times, serif' }}>
                  {stat}
                </span>
                <p className="mt-3 text-sm font-semibold text-foreground uppercase tracking-widest">
                  {label}
                </p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-[220px]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product demo video */}
      <section className="px-6 pb-20 pt-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Product walkthrough</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              See Chippi in action
            </h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
              Watch how a solo realtor sets up their intake link, scores incoming leads, and follows up from one clean workflow — all in minutes.
            </p>
          </div>
          <div className="mx-auto flex justify-center">
            <VideoPlayer
              src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
              poster="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1920&h=1080&fit=crop"
              size="full"
              className="rounded-2xl shadow-lg shadow-amber-900/10 border border-border"
            />
          </div>
        </div>
      </section>

      {/* ─── The Chippi Effect ─────────────────────────────── */}
      <section className="relative bg-background py-24 px-6 overflow-hidden">
        {/* Decorative sparkles */}
        <span aria-hidden className="absolute top-14 left-10 text-primary/25 text-3xl select-none pointer-events-none">✦</span>
        <span aria-hidden className="absolute top-24 right-14 text-primary/15 text-xl select-none pointer-events-none">✦</span>
        <span aria-hidden className="absolute bottom-16 left-1/3 text-border text-2xl select-none pointer-events-none">✦</span>
        <span aria-hidden className="absolute top-1/2 right-1/4 text-primary/10 text-lg select-none pointer-events-none">○</span>

        <div className="mx-auto max-w-6xl">
          {/* Heading */}
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">Client Results</p>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight">
              The Chippi <em className="not-italic text-primary">effect</em>
            </h2>
          </div>

          {/* Bento grid */}
          <div className="grid md:grid-cols-2 gap-4">

            {/* Card 1 — Intake pipeline (left, large) */}
            <div className="rounded-2xl border border-border bg-card p-7 shadow-sm flex flex-col justify-between min-h-[280px]">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-5">Intake pipeline</p>
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-5xl font-bold text-foreground tracking-tight">82</span>
                  <span className="text-muted-foreground mb-1 text-sm">applications this week</span>
                </div>
                <div className="space-y-3.5">
                  {[
                    { label: 'Hot leads', count: 18, pct: 22, bar: 'bg-red-400' },
                    { label: 'Warm leads', count: 41, pct: 50, bar: 'bg-amber-400' },
                    { label: 'Cold leads', count: 23, pct: 28, bar: 'bg-blue-400' },
                  ].map(({ label, count, pct, bar }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-6 text-xs text-muted-foreground border-t border-border pt-4">
                Updated in real time as applications come in
              </p>
            </div>

            {/* Right column — two stacked cards */}
            <div className="flex flex-col gap-4">

              {/* Card 2 — AI scoring breakdown */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">AI lead scoring</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { emoji: '🔥', label: 'Hot',  count: 18, delta: '+12', color: 'text-red-500' },
                    { emoji: '♨',  label: 'Warm', count: 41, delta: '+28', color: 'text-amber-500' },
                    { emoji: '❄',  label: 'Cold', count: 23, delta: '+8',  color: 'text-blue-500' },
                  ].map(({ emoji, label, count, delta, color }) => (
                    <div key={label} className="rounded-xl bg-muted/60 p-3">
                      <p className="text-xs text-muted-foreground mb-1.5">{emoji} {label}</p>
                      <p className={`text-2xl font-bold ${color} leading-none`}>{count}</p>
                      <p className="text-xs text-emerald-600 font-semibold mt-1">{delta}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground border-t border-border pt-3">
                  88 applications auto-scored this week
                </p>
              </div>

              {/* Card 3 — Response time comparison */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">Response efficiency</p>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Before Chippi</p>
                    <p className="text-3xl font-bold text-muted-foreground/50 tracking-tight">18 h</p>
                    <p className="text-xs text-muted-foreground mt-1">avg. first response</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">With Chippi</p>
                    <p className="text-3xl font-bold text-primary tracking-tight">1.8 h</p>
                    <p className="text-xs text-emerald-600 font-semibold mt-1">↓ 74% faster</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-full bg-muted-foreground/25 rounded-full" />
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: '26%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-14 text-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              Start free trial <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Your Problem / Our Solution ───────────────────── */}
      <section className="bg-surface py-24 px-6">
        <div className="mx-auto max-w-6xl">
          {/* Heading */}
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-4">Problems &amp; Solution</p>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
              Your problem<br />Our solution
            </h2>
          </div>

          {/* 2-col layout */}
          <div className="grid lg:grid-cols-2 gap-10 items-start">

            {/* Left — problems */}
            <div className="space-y-4">
              {[
                {
                  avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop',
                  text: (
                    <>
                      Renter inquiries buried in{' '}
                      <span className="text-destructive font-semibold">DMs, texts, and email</span>
                      {' '}— no single place to see who's actually serious.
                    </>
                  ),
                },
                {
                  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop',
                  text: (
                    <>
                      Re-asking the same qualification questions every time —{' '}
                      <span className="text-destructive font-semibold">losing hours on leads that were never going to close.</span>
                    </>
                  ),
                },
                {
                  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&h=80&fit=crop',
                  text: (
                    <>
                      <span className="text-destructive font-semibold">Following up without context</span>
                      {' '}— forgetting details and losing deals you could have closed.
                    </>
                  ),
                },
              ].map(({ avatar, text }, i) => (
                <div key={i} className="flex items-start gap-4">
                  <img
                    src={avatar}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0 mt-1 ring-2 ring-border"
                  />
                  <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm text-foreground leading-relaxed flex-1 shadow-sm">
                    {text}
                  </div>
                </div>
              ))}
            </div>

            {/* Right — solution card */}
            <div className="rounded-3xl bg-gradient-to-br from-amber-500 to-amber-800 p-7 shadow-xl shadow-amber-900/25">
              {/* Brand mark */}
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Sparkles size={15} className="text-white" />
                </div>
                <span className="text-white font-bold text-lg tracking-tight">Chippi</span>
              </div>

              {/* Inner white card */}
              <div className="rounded-2xl bg-white/95 p-5">
                <p className="text-sm font-semibold text-foreground mb-4">
                  One clean workflow replaces the chaos:
                </p>
                <ul className="space-y-2.5">
                  {[
                    'Custom intake link for every inquiry',
                    'Structured rental application capture',
                    'AI lead scoring & prioritization',
                    'Contact CRM with full activity history',
                    'Deal pipeline & follow-up scheduling',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                      <CheckCircle2 size={14} className="text-amber-600 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href="/sign-up"
                className="mt-5 flex items-center justify-center gap-2 bg-white text-amber-800 rounded-full py-2.5 text-sm font-semibold hover:bg-amber-50 transition-colors"
              >
                Start free trial <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>

        {/* Live lead flow */}
        <section className="px-6 py-16 border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">Live workflow signal</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                See new applications and lead context arrive in real time.
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
                Chippi captures structured renter submissions, adds scoring context, and keeps your next actions clear — so you can respond faster with less back-and-forth.
              </p>
              <Link
                href="/features"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition-opacity"
              >
                See all features <ArrowRight size={14} />
              </Link>
            </div>

            <div className="relative h-[460px] overflow-hidden rounded-2xl border border-border bg-surface/60 p-3">
              <div className="lead-feed-scroll space-y-3">
                {animatedLeadFeed.map((item, idx) => (
                  <LeadFeedItem key={`${item.name}-${idx}`} {...item} />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
            </div>
          </div>
        </section>

        {/* Stats / Problem */}
        <Stats />

        {/* Features bento grid */}
        <section className="py-20 px-6 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">Everything you need</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                  A complete leasing lead system.
                </h2>
              </div>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition-opacity"
              >
                View all features <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {featureHighlights.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border bg-card px-6 py-6 shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:-translate-y-px transition-transform"
                >
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/8 text-primary">
                    <feature.icon size={20} />
                  </div>
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 px-6 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-primary">How it works</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">From inquiry to action in four steps.</h2>
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {howItWorks.map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl border border-border bg-card px-5 py-5 hover:-translate-y-px transition-transform shadow-[0_1px_4px_rgba(0,0,0,0.05)]"
                >
                  <p className="text-2xl font-bold text-primary/20 tabular-nums">{item.step}</p>
                  <p className="mt-3 font-semibold text-sm leading-snug">{item.title}</p>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Animated feature cards */}
        <section className="py-20 px-6 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Product depth</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight mb-8">Built for clear intake and clear action.</h2>

            {/* Pipeline card */}
            <div className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden mb-4">
              <div className="grid md:grid-cols-2">
                <AnimatedCard3 className="rounded-none border-0 border-r border-border shadow-none">
                  <CardVisual3>
                    <Visual1 mainColor="#d97706" secondaryColor="#b45309" />
                  </CardVisual3>
                  <CardBody3>
                    <CardTitle3>Intake pipeline over time</CardTitle3>
                    <CardDescription3>Hover to see weekly qualification volume.</CardDescription3>
                  </CardBody3>
                </AnimatedCard3>
                <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit">
                    Pipeline
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">One link captures every inquiry, automatically</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Share a single intake link in your bio, listing replies, or email signature. Every renter fills out the same structured form so your pipeline stays clean and consistent.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Structured form captures budget, dates & household details',
                      'Every submission lands as a clean lead record',
                      'No duplicate data entry or manual logging',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* AI Scoring card */}
            <div className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden mb-4">
              <div className="grid md:grid-cols-2">
                <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit">
                    AI Scoring
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">Know who to call before you pick up the phone</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Every submission is scored across budget fit, move-in timeline, neighborhood match, and household criteria — so you always have context before reaching out.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Multi-signal lead scoring on every intake',
                      'Context attached — not just a number',
                      'Instant priority ranking across all leads',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <AnimatedCard2 className="rounded-none border-0 border-l border-border shadow-none">
                  <CardVisual2>
                    <Visual2 mainColor="#d97706" secondaryColor="#b45309" />
                  </CardVisual2>
                  <CardBody2>
                    <CardTitle2>AI qualification breakdown</CardTitle2>
                    <CardDescription2>Hover to reveal scoring signals.</CardDescription2>
                  </CardBody2>
                </AnimatedCard2>
              </div>
            </div>

            {/* Analytics card */}
            <div className="rounded-xl border border-border bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="grid md:grid-cols-2">
                <AnimatedCard className="rounded-none border-0 border-r border-border shadow-none">
                  <CardVisual>
                    <Visual3 mainColor="#d97706" secondaryColor="#b45309" />
                  </CardVisual>
                  <CardBody>
                    <CardTitle>Lead performance at a glance</CardTitle>
                    <CardDescription>Hover to explore conversion trends.</CardDescription>
                  </CardBody>
                </AnimatedCard>
                <div className="flex flex-col justify-center px-6 py-8 md:px-8">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary w-fit">
                    Analytics
                  </div>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">See exactly where your pipeline stands</h3>
                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                    Track qualification rates, lead velocity, and conversion performance in one view — no spreadsheet juggling required.
                  </p>
                  <ul className="mt-5 space-y-2.5">
                    {[
                      'Qualified vs. disqualified lead ratio',
                      'Weekly intake volume trends',
                      'Average time-to-follow-up',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center">
              <Link
                href="/features"
                onClick={() => onTrack('features_cta_click', { location: 'proof_section' })}
                className="inline-flex items-center gap-2 border border-border bg-card px-6 py-3 rounded-full text-sm font-medium hover:bg-muted transition-colors"
              >
                Explore all features <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="py-20 px-6 border-t border-border">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-primary/20 bg-card shadow-[0_4px_24px_-8px_rgba(180,83,9,0.18)] overflow-hidden">
              <div className="grid md:grid-cols-2">
                <div className="px-8 py-10 md:px-10 border-b md:border-b-0 md:border-r border-border">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">Pricing</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">One simple plan, everything included.</h2>
                  <div className="mt-6 flex items-end gap-1">
                    <span className="text-5xl font-bold tracking-tight">$97</span>
                    <span className="text-muted-foreground text-lg mb-1">/ mo</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">7-day free trial · Cancel any time</p>
                  <div className="mt-6 flex gap-3 flex-wrap">
                    <Link
                      href="/sign-up"
                      onClick={() => onTrack('pricing_cta_click', { location: 'home_teaser' })}
                      className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-full text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Start free trial <Sparkles size={14} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center gap-2 border border-border bg-background px-6 py-2.5 rounded-full text-sm font-medium hover:bg-muted transition-colors"
                    >
                      See full details <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>
                <div className="px-8 py-10 md:px-10">
                  <p className="text-sm font-medium text-foreground mb-4">Everything in one plan:</p>
                  <ul className="space-y-3">
                    {[
                      'Custom intake link',
                      'Structured lead capture',
                      'AI lead scoring & prioritization',
                      'Leasing pipeline CRM',
                      'Contact management',
                      'Deal tracking',
                      'Analytics dashboard',
                      'Full follow-up workflow',
                    ].map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-24 px-6 border-t border-border">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-1.5 text-xs font-semibold text-primary mb-6">
              <Zap size={12} />
              7-day free trial — no card required
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
              One link.<br className="hidden md:block" /> Clear leads. Fast action.
            </h2>
            <p className="mt-5 text-muted-foreground text-lg">
              Start your free trial and feel the workflow compression in your first week.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/sign-up"
                onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity shadow-sm"
              >
                Start free trial <ArrowRight size={16} />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 border border-border px-8 py-3.5 rounded-full font-medium hover:bg-card transition-colors"
              >
                View features <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <AnimatedFooter
          leftLinks={[
            { href: '/features', label: 'Features' },
            { href: '/pricing', label: 'Pricing' },
            { href: '/faq', label: 'FAQ' },
            { href: '/sign-up', label: 'Get started' },
          ]}
          rightLinks={[
            { href: '/legal/privacy', label: 'Privacy' },
            { href: '/legal/terms', label: 'Terms' },
            { href: '/legal/cookies', label: 'Cookies' },
            { href: '/sign-in', label: 'Log in' },
          ]}
          copyrightText={`© ${new Date().getFullYear()} Chippi. Leasing workflow clarity for modern realtors.`}
        />
    </div>
  );
}
