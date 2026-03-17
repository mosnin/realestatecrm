'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { track } from '@vercel/analytics';
import { Navbar } from '@/components/navbar';
import { BrandLogo } from '@/components/brand-logo';

function onTrack(name: string, props?: Record<string, string>) {
  track(name, props);
}

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
};

const fadeIn = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.8 },
};

const stagger = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
};

export default function HomePage() {
  return (
    <div className="min-h-svh w-full bg-background text-foreground">
      <Navbar />

      <main className="overflow-x-hidden">

        {/* ════════════════════════════════════════════════════════════════
            HERO — Full-bleed editorial, Breezy-inspired
           ════════════════════════════════════════════════════════════════ */}
        <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
          {/* Animated gradient background */}
          <div className="absolute inset-0 animated-gradient-warm" />
          <div className="gradient-orb gradient-orb-1" />
          <div className="gradient-orb gradient-orb-2" />
          <div className="gradient-orb gradient-orb-3" />

          <div className="relative z-10 px-6 md:px-12 lg:px-20 pb-16 md:pb-24 pt-32">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mb-8"
            >
              <span className="pill-badge">
                The new standard for real estate
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold tracking-tight leading-[0.95] max-w-[14ch]"
            >
              Get more done.{' '}
              <br className="hidden sm:block" />
              Close more deals.
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-8 md:mt-12 flex flex-col sm:flex-row items-start gap-6 md:gap-8"
            >
              <p className="text-base md:text-lg text-muted-foreground max-w-md leading-relaxed">
                Chippi is your always-on partner — capturing renter leads,
                scoring them with AI, and keeping your pipeline moving in real time.
              </p>

              <Link
                href="/sign-up"
                onClick={() => onTrack('hero_cta_click', { location: 'hero' })}
                className="flex items-center gap-2 px-7 py-3.5 rounded-full bg-foreground text-background text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity shrink-0 uppercase"
              >
                Get early access
                <ArrowRight size={16} />
              </Link>
            </motion.div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            FEATURE 1 — AI Lead Scoring (Breezy "Personalized Assistant" style)
           ════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <div>
                <motion.span {...fadeUp} className="pill-badge inline-flex">
                  AI Lead Scoring
                </motion.span>
                <motion.h2
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: 0.1 }}
                  className="mt-5 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.02]"
                >
                  Know who to call first.
                </motion.h2>
              </div>
              <motion.p
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.2 }}
                className="text-base md:text-lg text-muted-foreground leading-relaxed md:pt-12"
              >
                Every renter submission is scored across budget fit, move-in timeline,
                and qualification signals — delivering clear priorities and next steps,
                not just a number.
              </motion.p>
            </div>

            {/* Two-column image grid */}
            <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-4">
              <motion.div
                {...fadeIn}
                className="relative rounded-3xl overflow-hidden bg-surface aspect-[4/3]"
              >
                <img
                  src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=900&h=675&fit=crop"
                  alt="Real estate agent reviewing property"
                  className="w-full h-full object-cover"
                />
              </motion.div>
              <motion.div
                {...fadeIn}
                transition={{ ...fadeIn.transition, delay: 0.15 }}
                className="rounded-3xl bg-accent/60 p-6 md:p-8 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {[
                    { name: 'Jordan Reyes', score: 92, detail: 'Budget $2,800 · Midtown · Move-in Aug 1', tier: 'Hot' },
                    { name: 'Ava Thompson', score: 68, detail: 'Score match · Strong timeline', tier: 'Warm' },
                    { name: 'Carlos Mendez', score: 45, detail: '2BR · Pet friendly · Downtown', tier: 'Cold' },
                  ].map((lead, i) => (
                    <motion.div
                      key={lead.name}
                      {...stagger}
                      transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                      className="flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-sm border border-border/40"
                    >
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {lead.score}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{lead.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.detail}</p>
                      </div>
                      <span className="pill-badge text-[10px] shrink-0">{lead.tier}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="mt-6 flex items-center gap-3 pt-4 border-t border-border/30">
                  <div className="flex -space-x-2">
                    {['🔴', '🟡', '🔵'].map((dot, i) => (
                      <div key={i} className="w-6 h-6 rounded-full bg-card border-2 border-accent/60 flex items-center justify-center text-[10px]">{dot}</div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">3 leads scored today</p>
                </div>
              </motion.div>
            </div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            FEATURE 2 — Connected Pipeline (Breezy "A clear view" style)
           ════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <div>
                <motion.span {...fadeUp} className="pill-badge inline-flex">
                  Connected Pipeline
                </motion.span>
                <motion.h2
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: 0.1 }}
                  className="mt-5 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.02]"
                >
                  A clear view of every deal.
                </motion.h2>
              </div>
              <motion.p
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.2 }}
                className="text-base md:text-lg text-muted-foreground leading-relaxed md:pt-12"
              >
                Chippi automatically tracks conversations, follow-ups, and deal stages
                back to your pipeline — giving you a live view of every renter and listing.
              </motion.p>
            </div>

            <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-4">
              {/* Pipeline cards */}
              <motion.div
                {...fadeIn}
                className="rounded-3xl bg-accent/60 p-6 md:p-8"
              >
                <div className="space-y-3">
                  {[
                    { stage: 'New Lead', count: 8, color: 'bg-primary/20 text-primary' },
                    { stage: 'Touring', count: 3, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
                    { stage: 'Applied', count: 5, color: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
                    { stage: 'Approved', count: 2, color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.stage}
                      {...stagger}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.08 }}
                      className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm border border-border/40"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${item.color.split(' ')[0]}`} />
                        <span className="text-sm font-medium">{item.stage}</span>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${item.color}`}>
                        {item.count}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                {...fadeIn}
                transition={{ ...fadeIn.transition, delay: 0.15 }}
                className="relative rounded-3xl overflow-hidden bg-surface aspect-[4/3]"
              >
                <img
                  src="https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?w=900&h=675&fit=crop"
                  alt="Modern apartment building"
                  className="w-full h-full object-cover"
                />
              </motion.div>
            </div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            FEATURE 3 — Intake Link (Breezy "Nothing missed" style)
           ════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-7xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-start mb-12 md:mb-16">
              <div>
                <motion.span {...fadeUp} className="pill-badge inline-flex">
                  Smart Intake
                </motion.span>
                <motion.h2
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: 0.1 }}
                  className="mt-5 text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.02]"
                >
                  Nothing missed. Nothing forgotten.
                </motion.h2>
              </div>
              <motion.p
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: 0.2 }}
                className="text-base md:text-lg text-muted-foreground leading-relaxed md:pt-12"
              >
                From rental inquiries to applications, Chippi captures every detail —
                delivering clear summaries, lead scores, and next steps automatically.
              </motion.p>
            </div>

            <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-4">
              <motion.div
                {...fadeIn}
                className="relative rounded-3xl overflow-hidden bg-surface aspect-[4/3]"
              >
                <img
                  src="https://images.unsplash.com/photo-1556761175-4b46a572b786?w=900&h=675&fit=crop"
                  alt="Professional real estate meeting"
                  className="w-full h-full object-cover"
                />
              </motion.div>
              <motion.div
                {...fadeIn}
                transition={{ ...fadeIn.transition, delay: 0.15 }}
                className="rounded-3xl bg-accent/60 p-6 md:p-8 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {[
                    { title: 'Rental Application', who: 'Jordan Reyes', time: 'Just now', detail: 'Budget · Timeline · Move-in' },
                    { title: 'Lead Scored', who: 'Ava Thompson', time: '2m ago', detail: 'Score 68 · Strong fit' },
                    { title: 'Follow-up Set', who: 'Carlos Mendez', time: '5m ago', detail: 'Tour scheduled Thursday' },
                    { title: 'Application Complete', who: 'Nina Patel', time: '12m ago', detail: 'All documents received' },
                  ].map((item, i) => (
                    <motion.div
                      key={item.title + i}
                      {...stagger}
                      transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                      className="flex items-start gap-3 rounded-2xl bg-card p-3.5 shadow-sm border border-border/40"
                    >
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold truncate">{item.title}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.who} · {item.detail}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            TESTIMONIAL — Founder quote, Breezy-style editorial block
           ════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-7xl mx-auto">
            <motion.div
              {...fadeUp}
              className="rounded-3xl overflow-hidden bg-card border border-border/40"
            >
              <div className="grid md:grid-cols-[0.8fr_1.2fr]">
                {/* Photo */}
                <div className="relative aspect-square md:aspect-auto overflow-hidden bg-surface">
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=700&fit=crop"
                    alt="Founder portrait"
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Quote */}
                <div className="p-8 md:p-12 lg:p-16 flex flex-col justify-center">
                  <span className="pill-badge w-fit mb-6">
                    Built from experience, not a boardroom.
                  </span>

                  <blockquote className="text-xl md:text-2xl lg:text-3xl font-medium leading-snug tracking-tight">
                    &ldquo;I was burning hours, bouncing between half-a-dozen tools
                    just to prepare for one meeting. Nothing was built with agents
                    in mind. So I built what I&rsquo;d wished I had years ago.&rdquo;
                  </blockquote>

                  <div className="mt-8">
                    <p className="font-bold text-lg">Chippi</p>
                    <p className="text-sm text-muted-foreground tracking-wide uppercase">
                      Built for realtors, by realtors
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            PRICING — Minimal, editorial
           ════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-20 md:py-32">
          <div className="max-w-7xl mx-auto">
            <motion.div
              {...fadeUp}
              className="rounded-3xl overflow-hidden animated-gradient-card border border-primary/15"
            >
              <div className="grid md:grid-cols-2">
                <div className="p-8 md:p-12 lg:p-16 border-b md:border-b-0 md:border-r border-border/30">
                  <span className="pill-badge">Pricing</span>
                  <h2 className="mt-6 text-4xl md:text-5xl font-bold tracking-tight leading-[1.02]">
                    One plan.<br />Everything included.
                  </h2>
                  <div className="mt-8 flex items-end gap-1.5">
                    <span className="text-6xl md:text-7xl font-bold tracking-tight">$97</span>
                    <span className="text-muted-foreground text-xl mb-2">/ mo</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">7-day free trial · No credit card · Cancel any time</p>

                  <div className="mt-8 flex flex-col sm:flex-row gap-3">
                    <Link
                      href="/sign-up"
                      onClick={() => onTrack('pricing_cta_click', { location: 'home' })}
                      className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-foreground text-background text-sm font-semibold tracking-wide hover:opacity-90 transition-opacity uppercase"
                    >
                      Start free trial <Sparkles size={14} />
                    </Link>
                    <Link
                      href="/pricing"
                      className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-border text-sm font-medium hover:bg-accent/50 transition-colors"
                    >
                      See details <ArrowRight size={14} />
                    </Link>
                  </div>
                </div>

                <div className="p-8 md:p-12 lg:p-16">
                  <p className="text-sm font-semibold mb-6">Everything in one plan:</p>
                  <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                    {[
                      'Custom intake link',
                      'AI lead scoring',
                      'Contact CRM',
                      'Deal pipeline',
                      'Analytics dashboard',
                      'Follow-up workflow',
                      'Email notifications',
                      'Unlimited leads',
                    ].map((f) => (
                      <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            CLOSING CTA
           ════════════════════════════════════════════════════════════════ */}
        <section className="px-6 md:px-12 lg:px-20 py-24 md:py-40">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h2
              {...fadeUp}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.98]"
            >
              Your pipeline,{' '}
              <br className="hidden sm:block" />
              finally under control.
            </motion.h2>
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="mt-6 text-lg text-muted-foreground max-w-lg mx-auto"
            >
              Start your free trial and feel the difference in your first week.
            </motion.p>
            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.2 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link
                href="/sign-up"
                onClick={() => onTrack('footer_cta_click', { location: 'close_cta' })}
                className="flex items-center gap-2 px-8 py-4 rounded-full bg-foreground text-background font-semibold tracking-wide hover:opacity-90 transition-opacity uppercase text-sm"
              >
                Get early access <ArrowRight size={16} />
              </Link>
              <Link
                href="/features"
                className="flex items-center gap-2 px-8 py-4 rounded-full border border-border font-medium hover:bg-accent/50 transition-colors text-sm"
              >
                View features <ArrowRight size={16} />
              </Link>
            </motion.div>
          </div>
        </section>


        {/* ════════════════════════════════════════════════════════════════
            FOOTER — Dark contrast, Breezy-style
           ════════════════════════════════════════════════════════════════ */}
        <footer className="bg-foreground text-background">
          <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-20">
            {/* Large brand */}
            <div className="pt-16 md:pt-24 pb-16 md:pb-24 grid md:grid-cols-[1fr_auto] gap-12 items-end">
              <div>
                <BrandLogo className="h-10 md:h-14 brightness-0 invert" alt="Chippi" />
              </div>
              <div className="rounded-2xl overflow-hidden w-64 h-48 md:w-80 md:h-56 hidden md:block">
                <img
                  src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=300&fit=crop"
                  alt="Real estate"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Links */}
            <div className="border-t border-background/10 py-8 flex flex-col md:flex-row justify-between gap-6">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[
                  { href: '/features', label: 'Features' },
                  { href: '/pricing', label: 'Pricing' },
                  { href: '/faq', label: 'FAQ' },
                  { href: '/sign-up', label: 'Get started' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="flex items-center gap-1 text-sm text-background/50 hover:text-background transition-colors"
                  >
                    {link.label}
                    <ArrowUpRight className="size-3" />
                  </Link>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[
                  { href: '/legal/terms', label: 'Terms' },
                  { href: '/legal/privacy', label: 'Privacy Policy' },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-sm text-background/50 hover:text-background transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Copyright */}
            <div className="border-t border-background/10 py-6">
              <p className="text-xs text-background/30">
                &copy; {new Date().getFullYear()} Chippi. All rights reserved.
              </p>
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}
