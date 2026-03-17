'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Sparkles, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { track } from '@vercel/analytics';
import { Navbar } from '@/components/navbar';
import { BrandLogo } from '@/components/brand-logo';

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] },
});

const scaleIn = (delay = 0) => ({
  initial: { opacity: 0, scale: 0.95 },
  whileInView: { opacity: 1, scale: 1 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] },
});

export default function HomePage() {
  return (
    <div className="min-h-svh w-full">
      <Navbar />

      <main className="overflow-x-hidden">

        {/* ═══════════════════════════════════════════════════════════════════
            HERO — Dark, cinematic, Apple keynote energy
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="relative min-h-[100svh] flex flex-col justify-center section-dark overflow-hidden">
          {/* Subtle grid */}
          <div className="absolute inset-0 grid-pattern opacity-50" />

          {/* Central glow */}
          <div className="hero-glow left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          <div className="hero-glow right-0 top-0 opacity-20" style={{ width: 600, height: 600 }} />

          <div className="relative z-10 px-6 md:px-12 lg:px-20 max-w-7xl mx-auto w-full">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-6"
            >
              <span className="pill-badge-dark">
                Leasing CRM for modern realtors
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] xl:text-[6.5rem] font-bold tracking-[-0.03em] leading-[0.92] max-w-[16ch]"
            >
              Your pipeline,{' '}
              <span className="gradient-text">finally</span>{' '}
              under control.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="mt-6 md:mt-8 text-base md:text-lg text-[#A39889] max-w-xl leading-relaxed"
            >
              One intake link. AI lead scoring. A command center
              that keeps every deal moving — so you close faster
              with less busywork.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="mt-10 flex flex-col sm:flex-row items-start gap-4"
            >
              <Link
                href="/sign-up"
                onClick={() => onTrack('hero_cta_click', { location: 'hero' })}
                className="group flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-[#D4B87A] text-[#0C0A09] text-sm font-bold tracking-wide hover:bg-[#E8D5A8] transition-colors uppercase"
              >
                Get early access
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/features"
                className="flex items-center gap-2 px-7 py-3.5 rounded-full border border-[#3A3530] text-sm font-medium text-[#A39889] hover:text-[#F5F0EB] hover:border-[#5A5550] transition-colors"
              >
                See how it works
              </Link>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.0 }}
              className="mt-5 text-xs text-[#6A6050] tracking-wide"
            >
              7-day free trial &middot; No credit card required
            </motion.p>
          </div>

          {/* Bottom fade into next section */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            SCROLLING STATS STRIP — social proof through numbers
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="py-8 border-b border-border/60 overflow-hidden bg-background">
          <div className="scroll-strip">
            {[...Array(2)].map((_, dupeIdx) => (
              <div key={dupeIdx} className="flex items-center gap-16 px-8 shrink-0">
                {[
                  { number: '92%', label: 'faster follow-up' },
                  { number: '3x', label: 'more qualified leads' },
                  { number: '< 2 min', label: 'to score a lead' },
                  { number: '100%', label: 'structured intake' },
                  { number: '0', label: 'spreadsheets needed' },
                  { number: '$97', label: 'flat monthly price' },
                ].map((stat) => (
                  <div key={`${dupeIdx}-${stat.label}`} className="flex items-center gap-3 shrink-0">
                    <span className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{stat.number}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{stat.label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            PRODUCT SHOWCASE — The product IS the hero visual
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-24 md:py-32 bg-background">
          <div className="max-w-6xl mx-auto">
            <motion.div {...fadeUp()} className="text-center mb-16">
              <span className="pill-badge">Product</span>
              <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
                Everything in one place.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-lg mx-auto">
                Leads, scores, pipeline stages, contacts, and follow-ups — all in a single command center.
              </p>
            </motion.div>

            {/* Mockup — large rounded card simulating the dashboard */}
            <motion.div
              {...scaleIn(0.1)}
              className="rounded-2xl md:rounded-3xl overflow-hidden mockup-shadow border border-border/60 bg-card"
            >
              <div className="bg-card border-b border-border/60 px-4 py-2.5 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#27CA40]" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="px-4 py-1 rounded-md bg-muted/50 text-[10px] text-muted-foreground font-mono">
                    app.chippi.io/dashboard
                  </div>
                </div>
              </div>

              {/* Dashboard mockup content */}
              <div className="p-4 md:p-6 grid md:grid-cols-[220px_1fr] gap-4">
                {/* Sidebar mock */}
                <div className="hidden md:flex flex-col gap-2 border-r border-border/40 pr-4">
                  {['Dashboard', 'Leads', 'Pipeline', 'Contacts', 'Analytics'].map((item, i) => (
                    <div
                      key={item}
                      className={`px-3 py-2 rounded-lg text-xs font-medium ${
                        i === 0
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>

                {/* Main content mock */}
                <div className="space-y-4">
                  {/* Stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Active Leads', value: '24', change: '+3 today' },
                      { label: 'Avg Score', value: '72', change: 'Above target' },
                      { label: 'Tours Scheduled', value: '8', change: 'This week' },
                      { label: 'Response Rate', value: '94%', change: '+12% MoM' },
                    ].map((stat) => (
                      <div key={stat.label} className="rounded-xl border border-border/40 bg-background p-3">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                        <p className="text-xl font-bold mt-1">{stat.value}</p>
                        <p className="text-[10px] text-primary font-medium mt-0.5">{stat.change}</p>
                      </div>
                    ))}
                  </div>

                  {/* Recent leads */}
                  <div className="rounded-xl border border-border/40 bg-background overflow-hidden">
                    <div className="px-3 py-2 border-b border-border/40">
                      <p className="text-xs font-semibold">Recent Leads</p>
                    </div>
                    {[
                      { name: 'Jordan Reyes', score: 92, status: 'Hot', time: 'Just now' },
                      { name: 'Ava Thompson', score: 68, status: 'Warm', time: '2m ago' },
                      { name: 'Carlos Mendez', score: 45, status: 'New', time: '5m ago' },
                    ].map((lead) => (
                      <div key={lead.name} className="px-3 py-2.5 border-b border-border/20 last:border-0 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {lead.score}
                          </div>
                          <div>
                            <p className="text-xs font-semibold">{lead.name}</p>
                            <p className="text-[10px] text-muted-foreground">{lead.time}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          lead.status === 'Hot'
                            ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                            : lead.status === 'Warm'
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400'
                            : 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                        }`}>
                          {lead.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            FEATURE 1 — Intake Link (light bg, asymmetric split)
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-24 md:py-32 bg-background">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Text */}
            <motion.div {...fadeUp()}>
              <span className="pill-badge">Smart Intake</span>
              <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05]">
                One link captures{' '}
                <span className="gradient-text">every</span>{' '}
                inquiry.
              </h2>
              <p className="mt-5 text-muted-foreground leading-relaxed max-w-lg">
                Drop your intake link in a bio, listing reply, or email signature. Every renter fills out the same
                structured form — budget, timeline, household details — so your pipeline starts clean.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Structured form captures every detail automatically',
                  'No more DM threads or scattered notes',
                  'Professional intake experience every time',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check size={16} className="text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/features/intake"
                className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Learn more <ArrowRight size={14} />
              </Link>
            </motion.div>

            {/* Visual — simulated intake form */}
            <motion.div {...scaleIn(0.15)} className="relative">
              <div className="rounded-2xl md:rounded-3xl bg-card border border-border/60 p-6 md:p-8 mockup-shadow">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <span className="text-sm">📝</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold">Renter Application</p>
                    <p className="text-[10px] text-muted-foreground">chippi.io/apply/downtown-lofts</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Full Name', value: 'Jordan Reyes', filled: true },
                    { label: 'Monthly Budget', value: '$2,800', filled: true },
                    { label: 'Move-in Date', value: 'August 1, 2026', filled: true },
                    { label: 'Preferred Areas', value: 'Midtown, Downtown', filled: true },
                  ].map((field) => (
                    <div key={field.label}>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{field.label}</p>
                      <div className="rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm font-medium">
                        {field.value}
                      </div>
                    </div>
                  ))}

                  <button className="w-full mt-2 py-3 rounded-xl bg-foreground text-background text-sm font-bold">
                    Submit Application
                  </button>
                </div>
              </div>

              {/* Floating notification */}
              <motion.div
                initial={{ opacity: 0, x: 20, y: -10 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="absolute -top-4 -right-4 md:top-4 md:-right-8 rounded-2xl bg-card border border-border/60 p-3 shadow-lg max-w-[200px]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-500/15 flex items-center justify-center">
                    <Check size={12} className="text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold">New lead captured</p>
                    <p className="text-[9px] text-muted-foreground">Score: 92 · Hot</p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            FEATURE 2 — AI Scoring (DARK section — contrast break)
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="section-dark relative overflow-hidden">
          <div className="absolute inset-0 grid-pattern opacity-30" />
          <div className="hero-glow left-1/4 top-1/2 -translate-y-1/2 opacity-30" />

          <div className="relative z-10 px-6 md:px-12 lg:px-20 py-24 md:py-32">
            <div className="max-w-7xl mx-auto">
              {/* Centered header */}
              <motion.div {...fadeUp()} className="text-center max-w-3xl mx-auto mb-16 md:mb-20">
                <span className="pill-badge-dark">AI Lead Scoring</span>
                <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight leading-[1.02]">
                  Stop guessing who to call first.
                </h2>
                <p className="mt-5 text-[#A39889] text-base md:text-lg leading-relaxed">
                  Every submission is scored across budget fit, move-in timeline, and qualification signals.
                  You get clear priorities and context — not just a number.
                </p>
              </motion.div>

              {/* Three score cards */}
              <div className="grid md:grid-cols-3 gap-4 md:gap-6">
                {[
                  {
                    name: 'Jordan Reyes',
                    score: 92,
                    tier: 'Hot',
                    tierColor: 'bg-red-500/15 text-red-400',
                    signals: ['Budget match: Strong', 'Timeline: Immediate', 'Area: Exact match'],
                    action: 'Call today — ready to tour',
                  },
                  {
                    name: 'Ava Thompson',
                    score: 68,
                    tier: 'Warm',
                    tierColor: 'bg-amber-500/15 text-amber-400',
                    signals: ['Budget match: Good', 'Timeline: 6 weeks', 'Area: Partial match'],
                    action: 'Schedule intro call this week',
                  },
                  {
                    name: 'Carlos Mendez',
                    score: 45,
                    tier: 'Nurture',
                    tierColor: 'bg-blue-500/15 text-blue-400',
                    signals: ['Budget: Below range', 'Timeline: Flexible', 'Area: Exploring'],
                    action: 'Add to drip, check back in 30d',
                  },
                ].map((lead, i) => (
                  <motion.div
                    key={lead.name}
                    {...fadeUp(i * 0.1)}
                    className="rounded-2xl border border-[#2A2622] bg-[#151311] p-6 hover:border-[#3A3530] transition-colors"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4B87A]/20 to-[#D4B87A]/5 flex items-center justify-center text-sm font-black text-[#D4B87A]">
                          {lead.score}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#F5F0EB]">{lead.name}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${lead.tierColor}`}>
                        {lead.tier}
                      </span>
                    </div>

                    {/* Signals */}
                    <div className="space-y-2 mb-5">
                      {lead.signals.map((sig) => (
                        <div key={sig} className="flex items-center gap-2 text-xs text-[#8A7E70]">
                          <div className="w-1 h-1 rounded-full bg-[#D4B87A]/40" />
                          {sig}
                        </div>
                      ))}
                    </div>

                    {/* Recommended action */}
                    <div className="pt-4 border-t border-[#2A2622]">
                      <p className="text-[10px] text-[#6A6050] uppercase tracking-wider mb-1">Next step</p>
                      <p className="text-xs text-[#D4B87A] font-medium">{lead.action}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            FEATURE 3 — Pipeline (light, full-width photo + overlay)
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-24 md:py-32 bg-background">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Visual — Pipeline stages */}
            <motion.div {...scaleIn()} className="order-2 lg:order-1">
              <div className="rounded-2xl md:rounded-3xl overflow-hidden border border-border/60 bg-card mockup-shadow">
                <div className="px-5 py-3 border-b border-border/40 flex items-center justify-between">
                  <p className="text-xs font-bold">Deal Pipeline</p>
                  <p className="text-[10px] text-muted-foreground">18 active deals</p>
                </div>

                <div className="p-4 space-y-2">
                  {[
                    { stage: 'New Lead', count: 8, width: '100%', color: 'bg-primary' },
                    { stage: 'Contacted', count: 5, width: '62%', color: 'bg-amber-400 dark:bg-amber-500' },
                    { stage: 'Touring', count: 3, width: '37%', color: 'bg-green-400 dark:bg-green-500' },
                    { stage: 'Applied', count: 2, width: '25%', color: 'bg-blue-400 dark:bg-blue-500' },
                  ].map((stage, i) => (
                    <motion.div
                      key={stage.stage}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                      className="flex items-center gap-3"
                    >
                      <p className="text-xs font-medium w-20 shrink-0">{stage.stage}</p>
                      <div className="flex-1 h-8 bg-muted/30 rounded-lg overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          whileInView={{ width: stage.width }}
                          viewport={{ once: true }}
                          transition={{ duration: 1, delay: 0.4 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                          className={`h-full ${stage.color} rounded-lg flex items-center justify-end pr-2`}
                        >
                          <span className="text-[10px] font-bold text-white">{stage.count}</span>
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Recent activity */}
                <div className="border-t border-border/40 px-4 py-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</p>
                  {[
                    { action: 'Jordan Reyes moved to Touring', time: '2m ago' },
                    { action: 'Nina Patel submitted application', time: '15m ago' },
                  ].map((act) => (
                    <div key={act.action} className="flex items-center justify-between py-1.5">
                      <p className="text-xs text-muted-foreground">{act.action}</p>
                      <p className="text-[10px] text-muted-foreground/60">{act.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Text */}
            <motion.div {...fadeUp(0.1)} className="order-1 lg:order-2">
              <span className="pill-badge">Pipeline</span>
              <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05]">
                See every deal at a{' '}
                <span className="gradient-text">glance</span>.
              </h2>
              <p className="mt-5 text-muted-foreground leading-relaxed max-w-lg">
                Track every lead from first inquiry to signed lease. Pipeline stages update automatically
                as leads progress — no dragging cards or manual updates.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  'Automatic stage progression based on activity',
                  'Visual funnel shows exactly where leads drop off',
                  'One-click actions: schedule tour, send follow-up, close deal',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check size={16} className="text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/features/pipeline"
                className="inline-flex items-center gap-2 mt-8 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Learn more <ArrowRight size={14} />
              </Link>
            </motion.div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            BIG NUMBERS — Full-width statement, dark
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="section-dark py-20 md:py-28">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            <motion.div {...fadeUp()} className="grid md:grid-cols-3 gap-8 md:gap-12 text-center">
              {[
                { number: '< 2 min', label: 'Average time to score a new lead' },
                { number: '92%', label: 'Faster follow-up vs. manual workflow' },
                { number: '3x', label: 'More qualified conversations per week' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  {...fadeUp(i * 0.1)}
                >
                  <p className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight gradient-text">
                    {stat.number}
                  </p>
                  <p className="mt-3 text-sm text-[#8A7E70] max-w-[200px] mx-auto leading-relaxed">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            TESTIMONIAL — Editorial quote block
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-24 md:py-32 bg-background">
          <div className="max-w-5xl mx-auto">
            <motion.div {...fadeUp()} className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-8">
                <span className="text-3xl font-serif text-primary">&ldquo;</span>
              </div>

              <blockquote className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight leading-snug max-w-4xl mx-auto">
                I was burning hours bouncing between half-a-dozen tools just
                to follow up with one lead. Chippi turned that into{' '}
                <span className="gradient-text">two clicks</span>.
              </blockquote>

              <div className="mt-10">
                <p className="text-sm font-bold">Built for realtors, by realtors.</p>
                <p className="text-xs text-muted-foreground mt-1 tracking-wide uppercase">
                  The Chippi team
                </p>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            FEATURE 4 — Analytics + CRM (full-width image section)
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1400&h=600&fit=crop"
              alt="Modern real estate"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-[#0C0A09]/85 backdrop-blur-sm" />
          </div>

          <div className="relative z-10 px-6 md:px-12 lg:px-20 py-24 md:py-32">
            <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 lg:gap-20">
              <motion.div {...fadeUp()}>
                <span className="pill-badge-dark">Analytics</span>
                <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] text-[#F5F0EB]">
                  Data that drives decisions.
                </h2>
                <p className="mt-5 text-[#A39889] leading-relaxed">
                  Track qualification rates, lead velocity, and conversion performance.
                  No spreadsheet required.
                </p>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  {[
                    { label: 'Qualification Rate', value: '73%' },
                    { label: 'Avg Response Time', value: '4 min' },
                    { label: 'Leads This Month', value: '47' },
                    { label: 'Conversion Rate', value: '28%' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-[#2A2622] bg-[#151311]/80 p-4">
                      <p className="text-[10px] text-[#6A6050] uppercase tracking-wider">{stat.label}</p>
                      <p className="text-2xl font-bold text-[#F5F0EB] mt-1">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div {...fadeUp(0.15)}>
                <span className="pill-badge-dark">Contact CRM</span>
                <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.05] text-[#F5F0EB]">
                  Every detail, one tap away.
                </h2>
                <p className="mt-5 text-[#A39889] leading-relaxed">
                  Full contact profiles with activity logs, email history,
                  deal tracking, and follow-up scheduling.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    'Complete activity timeline per contact',
                    'Email and call log integration',
                    'Smart follow-up reminders',
                    'Deal history and notes',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm">
                      <Check size={16} className="text-[#D4B87A] mt-0.5 shrink-0" />
                      <span className="text-[#A39889]">{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            PRICING — Clean, standalone
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-24 md:py-32 bg-background">
          <div className="max-w-4xl mx-auto">
            <motion.div {...fadeUp()} className="text-center mb-12">
              <span className="pill-badge">Pricing</span>
              <h2 className="mt-5 text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
                One plan. Everything included.
              </h2>
            </motion.div>

            <motion.div
              {...scaleIn(0.1)}
              className="rounded-2xl md:rounded-3xl border border-border/60 bg-card overflow-hidden mockup-shadow"
            >
              <div className="grid md:grid-cols-2">
                <div className="p-8 md:p-10 lg:p-12 border-b md:border-b-0 md:border-r border-border/40">
                  <div className="flex items-end gap-1.5">
                    <span className="text-5xl md:text-6xl font-black tracking-tight">$97</span>
                    <span className="text-muted-foreground text-lg mb-1.5">/ month</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">7-day free trial &middot; Cancel any time</p>

                  <div className="mt-8 flex flex-col gap-3">
                    <Link
                      href="/sign-up"
                      onClick={() => onTrack('pricing_cta_click', { location: 'home' })}
                      className="group flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-foreground text-background text-sm font-bold tracking-wide hover:opacity-90 transition-opacity"
                    >
                      Start free trial <Sparkles size={14} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-border text-sm font-medium hover:bg-accent/50 transition-colors"
                    >
                      Compare plans <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                <div className="p-8 md:p-10 lg:p-12">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-5">Includes</p>
                  <div className="space-y-3.5">
                    {[
                      'Custom intake link',
                      'AI lead scoring & prioritization',
                      'Full pipeline CRM',
                      'Contact management',
                      'Analytics dashboard',
                      'Follow-up workflow',
                      'Unlimited leads',
                      'Email notifications',
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-3 text-sm">
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


        {/* ═══════════════════════════════════════════════════════════════════
            CLOSING CTA — Dark, dramatic, final
           ═══════════════════════════════════════════════════════════════════ */}
        <section className="section-dark relative overflow-hidden">
          <div className="absolute inset-0 grid-pattern opacity-30" />
          <div className="hero-glow left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40" />

          <div className="relative z-10 px-6 md:px-12 lg:px-20 py-28 md:py-40">
            <div className="max-w-4xl mx-auto text-center">
              <motion.h2
                {...fadeUp()}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-[-0.03em] leading-[0.95] text-[#F5F0EB]"
              >
                Close more deals.{' '}
                <br className="hidden sm:block" />
                <span className="gradient-text">Starting today.</span>
              </motion.h2>
              <motion.p
                {...fadeUp(0.1)}
                className="mt-6 text-base md:text-lg text-[#8A7E70] max-w-md mx-auto"
              >
                Join the realtors who stopped juggling tools and started closing.
              </motion.p>
              <motion.div
                {...fadeUp(0.2)}
                className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <Link
                  href="/sign-up"
                  onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
                  className="group flex items-center gap-2.5 px-8 py-4 rounded-full bg-[#D4B87A] text-[#0C0A09] text-sm font-bold tracking-wide hover:bg-[#E8D5A8] transition-colors uppercase"
                >
                  Get early access <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/features"
                  className="flex items-center gap-2 px-8 py-4 rounded-full border border-[#3A3530] text-sm font-medium text-[#A39889] hover:text-[#F5F0EB] hover:border-[#5A5550] transition-colors"
                >
                  View all features
                </Link>
              </motion.div>
            </div>
          </div>
        </section>


        {/* ═══════════════════════════════════════════════════════════════════
            FOOTER — Minimal, dark
           ═══════════════════════════════════════════════════════════════════ */}
        <footer className="bg-[#0C0A09] text-[#F5F0EB]">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            <div className="py-16 md:py-20 grid md:grid-cols-[1fr_auto] gap-12 items-end">
              <div>
                <BrandLogo className="h-10 md:h-12" alt="Chippi" />
                <p className="mt-4 text-sm text-[#6A6050] max-w-sm">
                  The leasing CRM that works the way you do — capturing leads, scoring them, and keeping your pipeline moving.
                </p>
              </div>
              <div className="flex flex-col gap-4 md:items-end">
                <div className="flex flex-wrap gap-6">
                  {[
                    { href: '/features', label: 'Features' },
                    { href: '/pricing', label: 'Pricing' },
                    { href: '/faq', label: 'FAQ' },
                    { href: '/sign-up', label: 'Get started' },
                  ].map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="flex items-center gap-1 text-sm text-[#6A6050] hover:text-[#F5F0EB] transition-colors"
                    >
                      {link.label}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap gap-6">
                  {[
                    { href: '/legal/terms', label: 'Terms' },
                    { href: '/legal/privacy', label: 'Privacy' },
                    { href: '/legal/cookies', label: 'Cookies' },
                  ].map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      className="text-xs text-[#4A4540] hover:text-[#8A7E70] transition-colors"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-[#1A1816] py-6">
              <p className="text-xs text-[#3A3530]">
                &copy; {new Date().getFullYear()} Chippi. All rights reserved.
              </p>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
