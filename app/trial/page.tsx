'use client';

import React from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { BrandLogo } from '@/components/brand-logo';
import {
  ArrowRight,
  CheckCircle2,
  Users,
  Zap,
  BarChart2,
  Clock,
  Shield,
  Star,
  Sparkles,
  TrendingUp,
  PhoneIncoming,
  CalendarDays,
} from 'lucide-react';

// ── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
  {
    text: 'Chippi helped me stop guessing. I can see qualified renter leads first and follow up with confidence.',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&h=120&fit=crop&crop=faces',
    name: 'Sofia Bennett',
    role: 'Leasing Agent',
  },
  {
    text: 'The intake form made my workflow cleaner overnight. Every application arrives with usable context.',
    image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&h=120&fit=crop&crop=faces',
    name: 'Marcus Hill',
    role: 'Independent Realtor',
  },
  {
    text: 'I finally have one place to review budgets, move-in dates, and score signals before calling.',
    image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&crop=faces',
    name: 'Elena Brooks',
    role: 'Rental Specialist',
  },
  {
    text: 'The scoring summaries are practical. I can quickly decide who needs priority follow-up each morning.',
    image: 'https://images.unsplash.com/photo-1544725176-7c40e5a71c5e?w=120&h=120&fit=crop&crop=faces',
    name: 'Daniel Carter',
    role: 'Broker Associate',
  },
  {
    text: 'Chippi gives me a polished intake flow that clients trust, and it saves me hours every week.',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=faces',
    name: 'Priya Shah',
    role: 'Solo Agent',
  },
  {
    text: 'I used to juggle DMs and notes. Now I open one dashboard and know exactly where to start.',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=faces',
    name: 'Noah Reed',
    role: 'Leasing Consultant',
  },
];

// ── Funnel metrics ───────────────────────────────────────────────────────────

const funnelSteps = [
  { label: 'Leads captured', value: '10,000+', width: '100%', icon: PhoneIncoming },
  { label: 'AI-scored & qualified', value: '8,200+', width: '82%', icon: Sparkles },
  { label: 'Tours booked', value: '5,400+', width: '54%', icon: CalendarDays },
  { label: 'Applications submitted', value: '3,100+', width: '31%', icon: TrendingUp },
  { label: 'Deals closed', value: '1,800+', width: '18%', icon: BarChart2 },
];

// ── Stats ────────────────────────────────────────────────────────────────────

const stats = [
  { value: '2,400+', label: 'Active agents', icon: Users },
  { value: '47%', label: 'Faster response times', icon: Zap },
  { value: '3.2x', label: 'More qualified leads', icon: TrendingUp },
  { value: '12 min', label: 'Avg. setup time', icon: Clock },
];

// ── Features ─────────────────────────────────────────────────────────────────

const features = [
  'AI-powered lead scoring & prioritization',
  'Custom intake forms with instant CRM sync',
  'Automated follow-up reminders & scheduling',
  'Tour booking with calendar integration',
  'Deal pipeline with drag-and-drop stages',
  'Team dashboards for brokerages',
];

// ── Logos / trust badges ─────────────────────────────────────────────────────

const trustItems = [
  { icon: Shield, label: 'SOC 2 compliant' },
  { icon: Star, label: '4.9/5 rating' },
  { icon: Users, label: '2,400+ agents' },
  { icon: Clock, label: '99.9% uptime' },
];

// ── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
} as Variants;

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.06, type: 'spring', stiffness: 300, damping: 24 },
  }),
} as Variants;

// ── Scrolling testimonial column ─────────────────────────────────────────────

function TestimonialColumn({ items, duration, className }: { items: typeof testimonials; duration: number; className?: string }) {
  return (
    <div className={className}>
      <motion.div
        animate={{ translateY: '-50%' }}
        transition={{ duration, repeat: Infinity, ease: 'linear', repeatType: 'loop' }}
        className="flex flex-col gap-5 pb-5"
      >
        {[0, 1].map((_, idx) => (
          <React.Fragment key={idx}>
            {items.map((t, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl border border-border bg-card shadow-lg shadow-primary/5 max-w-xs w-full"
              >
                <p className="text-sm leading-relaxed text-muted-foreground">{t.text}</p>
                <div className="flex items-center gap-2.5 mt-4">
                  <img src={t.image} alt={t.name} className="w-9 h-9 rounded-full object-cover" width={36} height={36} />
                  <div>
                    <p className="text-sm font-medium text-foreground leading-tight">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
}

// ── Counter animation ────────────────────────────────────────────────────────

function AnimatedCounter({ value }: { value: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.5 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
      className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
    >
      {value}
    </motion.span>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function TrialPage() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-background/80 border-b border-border/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <BrandLogo className="h-5 sm:h-6" alt="Chippi" />
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            Start free trial
            <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28">
        {/* Radial glow */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,150,79,0.12), transparent 70%)',
          }}
        />

        <div className="relative max-w-3xl mx-auto text-center px-6">
          <motion.div
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* Badge */}
            <motion.div variants={fadeUp} custom={0} className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[12px] font-semibold text-primary">
                <Sparkles size={12} />
                7-day free trial &middot; No credit card required
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]"
            >
              The CRM that helps you
              <br />
              <span className="text-primary">close rentals faster</span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              variants={fadeUp}
              custom={2}
              className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed"
            >
              Chippi scores your leads with AI, automates follow-ups, and gives you
              a pipeline built for rental agents. Join 2,400+ agents already using it.
            </motion.p>

            {/* CTA */}
            <motion.div variants={fadeUp} custom={3} className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg transition-all"
              >
                Start your 7-day free trial
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View pricing
                <ArrowRight size={13} />
              </Link>
            </motion.div>

            {/* Trust row */}
            <motion.div variants={fadeUp} custom={4} className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-4">
              {trustItems.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <t.icon size={13} className="text-primary/70" />
                  <span>{t.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats strip ────────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/30 py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
            {stats.map((s, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                variants={scaleIn}
                custom={i}
                className="text-center space-y-1"
              >
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <s.icon size={18} className="text-primary" />
                  </div>
                </div>
                <AnimatedCounter value={s.value} />
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Funnel visualization ───────────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-14"
          >
            <span className="inline-block border border-border rounded-lg px-3 py-1 text-sm bg-card mb-4">
              The funnel
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              From lead to lease — tracked end to end
            </h2>
            <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
              See how Chippi agents convert renter inquiries into signed leases with AI-powered scoring at every stage.
            </p>
          </motion.div>

          <div className="space-y-3">
            {funnelSteps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -40, filter: 'blur(6px)' }}
                whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                viewport={{ once: true, margin: '-20px' }}
                transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  className="relative rounded-xl border border-border bg-card overflow-hidden"
                  style={{ width: step.width, minWidth: '260px' }}
                >
                  {/* Progress fill */}
                  <motion.div
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 + 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 origin-left bg-primary/[0.06]"
                  />
                  <div className="relative flex items-center gap-3 px-5 py-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <step.icon size={16} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.label}</p>
                    </div>
                    <span className="text-lg font-bold text-foreground tabular-nums flex-shrink-0">{step.value}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features checklist ─────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28 bg-muted/20">
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-12"
          >
            <span className="inline-block border border-border rounded-lg px-3 py-1 text-sm bg-card mb-4">
              Everything included
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              All Pro features, free for 7 days
            </h2>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto">
              No feature gates, no credit card. Try the full platform and decide if it fits your workflow.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-20px' }}
                variants={fadeUp}
                custom={i}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-sm font-medium text-foreground">{f}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-12"
          >
            <span className="inline-block border border-border rounded-lg px-3 py-1 text-sm bg-card mb-4">
              Testimonials
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Trusted by agents who close
            </h2>
            <p className="text-muted-foreground mt-3 max-w-md mx-auto">
              Real feedback from leasing agents, realtors, and brokers using Chippi every day.
            </p>
          </motion.div>

          <div className="flex justify-center gap-5 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)] max-h-[600px] overflow-hidden">
            <TestimonialColumn items={testimonials.slice(0, 3)} duration={18} />
            <TestimonialColumn items={testimonials.slice(3, 6)} duration={22} className="hidden md:block" />
            <TestimonialColumn items={[...testimonials.slice(4), ...testimonials.slice(0, 1)]} duration={20} className="hidden lg:block" />
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="relative py-20 sm:py-28">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(255,150,79,0.10), transparent 70%)',
          }}
        />
        <div className="relative max-w-2xl mx-auto text-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
              Ready to close more rentals?
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Set up in under 15 minutes. Start receiving scored leads today.
              Cancel anytime during your trial.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3.5 text-base font-semibold text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg transition-all"
              >
                Start your 7-day free trial
                <ArrowRight size={16} />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground/70">
              No credit card required &middot; Cancel anytime &middot; Full access to all features
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-8 text-center">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo className="h-4 opacity-60" alt="Chippi" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/login/realtor" className="hover:text-foreground transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
