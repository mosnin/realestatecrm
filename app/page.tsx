'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Sparkles, Check, Link2, Gauge, Users, TrendingUp, BarChart3, MessageSquareMore } from 'lucide-react';
import { motion } from 'framer-motion';
import { track } from '@vercel/analytics';
import { Navbar } from '@/components/navbar';
import { BrandLogo } from '@/components/brand-logo';
import { ScoreRing } from '@/components/landing/score-ring';
import { PipelineDiagram } from '@/components/landing/pipeline-diagram';
import { IntakeFlow } from '@/components/landing/intake-flow';
import { ActivityFeed } from '@/components/landing/activity-feed';

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

export default function HomePage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />

      <main className="overflow-x-hidden">

        {/* ── HERO ──────────────────────────────────────────── */}
        <section className="relative min-h-[100svh] flex flex-col justify-center overflow-hidden">
          {/* Animated gradient bg (theme-aware: light + dark variants in CSS) */}
          <div className="absolute inset-0 animated-gradient-warm" />
          <div className="gradient-orb gradient-orb-1" />
          <div className="gradient-orb gradient-orb-2" />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 md:px-12 pt-28 md:pt-0">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <span className="pill-badge">The leasing CRM for modern realtors</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08]"
            >
              Capture leads.
              <br />
              Score instantly.
              <br />
              Close faster.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-6 text-base md:text-lg text-muted-foreground max-w-md leading-relaxed"
            >
              One intake link. AI-powered lead scoring. A pipeline that
              keeps every deal moving — from first inquiry to signed lease.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              className="mt-8 flex flex-col sm:flex-row items-start gap-3"
            >
              <Link
                href="/sign-up"
                onClick={() => onTrack('hero_cta_click', { location: 'hero' })}
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Start free trial
                <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-border text-sm font-medium text-foreground hover:bg-card/60 transition-colors"
              >
                See how it works
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.9 }}
              className="mt-4 text-xs text-muted-foreground/70 tracking-wide"
            >
              7-day free trial &middot; No credit card required
            </motion.p>
          </div>
        </section>


        {/* ── FEATURE 1: INTAKE ──────────────────────────── */}
        <section className="bg-background px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-5xl">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <motion.div {...fade()}>
                <span className="pill-badge">Smart Intake</span>
                <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  One link replaces the chaos.
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  Share a single intake link in your bio, listing replies, or email
                  signature. Every renter fills out the same structured form — budget,
                  timeline, household details — so your pipeline starts clean.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'Captures budget, move-in date, and area preferences',
                    'Replaces DM threads, emails, and scattered notes',
                    'Professional experience your renters will trust',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Check size={15} className="text-primary mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div {...fade(0.1)}>
                <IntakeFlow />
              </motion.div>
            </div>
          </div>
        </section>


        {/* ── FEATURE 2: AI SCORING ──────────────────────── */}
        <section className="bg-surface px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-5xl">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Visuals first on desktop */}
              <motion.div {...fade()} className="order-2 lg:order-1 grid sm:grid-cols-2 gap-4">
                <ScoreRing
                  score={92}
                  label="Jordan Reyes"
                  tier="Hot"
                  signals={[
                    { label: 'Budget fit', value: 95 },
                    { label: 'Timeline', value: 90 },
                    { label: 'Area match', value: 88 },
                  ]}
                />
                <ScoreRing
                  score={64}
                  label="Ava Thompson"
                  tier="Warm"
                  signals={[
                    { label: 'Budget fit', value: 72 },
                    { label: 'Timeline', value: 60 },
                    { label: 'Area match', value: 55 },
                  ]}
                />
              </motion.div>

              <motion.div {...fade(0.1)} className="order-1 lg:order-2">
                <span className="pill-badge">AI Lead Scoring</span>
                <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                  Know exactly who to call first.
                </h2>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  Every submission is scored across budget fit, move-in timeline, and
                  qualification signals. You get clear priorities with context — not
                  just a number.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {[
                    'Multi-signal scoring on every intake submission',
                    'Context attached so you know why — not just the score',
                    'Instant prioritization across your entire pipeline',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Check size={15} className="text-primary mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>


        {/* ── FEATURE 3: PIPELINE + ACTIVITY ──────────────── */}
        <section className="bg-background px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-5xl">
            <motion.div {...fade()} className="text-center max-w-2xl mx-auto mb-14">
              <span className="pill-badge">Command Center</span>
              <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                Your entire workflow, one screen.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Track every lead from inquiry to lease. See pipeline health,
                live activity, and next actions — no spreadsheet juggling.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-4">
              <motion.div {...fade(0.05)}>
                <PipelineDiagram />
              </motion.div>
              <motion.div {...fade(0.12)}>
                <ActivityFeed />
              </motion.div>
            </div>
          </div>
        </section>


        {/* ── FEATURE GRID ────────────────────────────────── */}
        <section className="bg-surface px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-5xl">
            <motion.div {...fade()} className="mb-12">
              <span className="pill-badge">Everything you need</span>
              <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight">
                Built for the full leasing workflow.
              </h2>
            </motion.div>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { icon: Link2, title: 'One intake link', desc: 'A single clean link for every listing. Share it anywhere — renter data flows in structured.' },
                { icon: Gauge, title: 'AI lead scoring', desc: 'Budget, timeline, and area match scored automatically. Context attached so you know why.' },
                { icon: MessageSquareMore, title: 'Faster follow-up', desc: 'Review qualified leads in one view. Status, notes, and next actions — no scattered threads.' },
                { icon: Users, title: 'Contact CRM', desc: 'Full profiles with activity logs, email history, deal tracking, and follow-up scheduling.' },
                { icon: TrendingUp, title: 'Deal pipeline', desc: 'Visual pipeline from new lead to signed lease. Stages update as leads progress.' },
                { icon: BarChart3, title: 'Analytics', desc: 'Qualification rates, lead velocity, and conversion trends in one dashboard.' },
              ].map((feature, i) => (
                <motion.div
                  key={feature.title}
                  {...fade(i * 0.05)}
                  className="rounded-2xl border border-border bg-card p-6 hover:shadow-sm transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon size={18} className="text-primary" />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{feature.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>


        {/* ── STATS ───────────────────────────────────────── */}
        <section className="bg-background px-6 md:px-12 py-20 md:py-28 border-y border-border">
          <div className="mx-auto max-w-4xl">
            <motion.div {...fade()} className="grid grid-cols-3 gap-6 md:gap-12 text-center">
              {[
                { value: '< 2 min', label: 'To score a new lead' },
                { value: '92%', label: 'Faster follow-up' },
                { value: '3x', label: 'More qualified conversations' },
              ].map((stat, i) => (
                <motion.div key={stat.label} {...fade(i * 0.06)}>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-primary">
                    {stat.value}
                  </p>
                  <p className="mt-1.5 text-xs md:text-sm text-muted-foreground">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>


        {/* ── PRICING ─────────────────────────────────────── */}
        <section className="bg-background px-6 md:px-12 py-24 md:py-36">
          <div className="mx-auto max-w-3xl">
            <motion.div {...fade()} className="text-center mb-12">
              <span className="pill-badge">Pricing</span>
              <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight">
                One plan. Everything included.
              </h2>
            </motion.div>

            <motion.div
              {...fade(0.08)}
              className="rounded-2xl border border-border bg-card card-elevated overflow-hidden"
            >
              <div className="grid md:grid-cols-2">
                <div className="p-8 md:p-10 border-b md:border-b-0 md:border-r border-border">
                  <div className="flex items-end gap-1">
                    <span className="text-5xl font-black tracking-tight">$97</span>
                    <span className="text-muted-foreground text-base mb-1">/ month</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">7-day free trial &middot; Cancel any time</p>

                  <div className="mt-8 flex flex-col gap-2.5">
                    <Link
                      href="/sign-up"
                      onClick={() => onTrack('pricing_cta_click', { location: 'home' })}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                      Start free trial <Sparkles size={14} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-border text-sm font-medium hover:bg-accent transition-colors"
                    >
                      Full pricing details <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                <div className="p-8 md:p-10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">Includes</p>
                  <div className="space-y-3">
                    {[
                      'Custom intake link',
                      'AI lead scoring',
                      'Full pipeline CRM',
                      'Contact management',
                      'Analytics dashboard',
                      'Follow-up workflow',
                      'Unlimited leads',
                      'Email notifications',
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2.5 text-sm">
                        <Check size={14} className="text-primary shrink-0" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ── CLOSING CTA ─────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 animated-gradient-warm" />
          <div className="gradient-orb gradient-orb-2" />

          <div className="relative z-10 mx-auto max-w-3xl px-6 md:px-12 py-28 md:py-40 text-center">
            <motion.h2
              {...fade()}
              className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight"
            >
              Your pipeline deserves better than a spreadsheet.
            </motion.h2>
            <motion.p
              {...fade(0.06)}
              className="mt-5 text-muted-foreground max-w-sm mx-auto"
            >
              Start your free trial and feel the difference in your first week.
            </motion.p>
            <motion.div
              {...fade(0.12)}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Link
                href="/sign-up"
                onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Get early access <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-border text-sm font-medium hover:bg-card/60 transition-colors"
              >
                View features
              </Link>
            </motion.div>
          </div>
        </section>


        {/* ── FOOTER ──────────────────────────────────────── */}
        <footer className="bg-card border-t border-border">
          <div className="mx-auto max-w-5xl px-6 md:px-12">
            <div className="py-12 md:py-16 flex flex-col md:flex-row justify-between gap-8">
              <div>
                <BrandLogo className="h-7" alt="Chippi" />
                <p className="mt-3 text-sm text-muted-foreground max-w-xs">
                  Leasing workflow clarity for modern realtors.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {[
                  { href: '/features', label: 'Features' },
                  { href: '/pricing', label: 'Pricing' },
                  { href: '/faq', label: 'FAQ' },
                  { href: '/sign-up', label: 'Get started' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                    <ArrowUpRight className="size-3" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-border py-5 flex flex-col sm:flex-row justify-between gap-3">
              <p className="text-xs text-muted-foreground/60">
                &copy; {new Date().getFullYear()} Chippi. All rights reserved.
              </p>
              <div className="flex gap-5">
                {[
                  { href: '/legal/terms', label: 'Terms' },
                  { href: '/legal/privacy', label: 'Privacy' },
                  { href: '/legal/cookies', label: 'Cookies' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
