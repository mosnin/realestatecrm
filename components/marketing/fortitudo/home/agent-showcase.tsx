'use client';

/**
 * Agent showcase: the "Chippi, working" section — modeled on ClickUp Brain's
 * agent block, rebuilt in the fortitudo studio-ASCII system and carrying
 * Chippi's real-estate substance.
 *
 * Three beats, top to bottom:
 *   1. The orbit — a dark ASCII panel with the Chippi mark at center and its
 *      jobs floating around it (the screenshot's signature motif).
 *   2. Proof cards — three SpotlightCards that SHOW Chippi working (scores a
 *      lead, drafts the reply, books the tour) rather than describing it.
 *   3. The platform strip — trained on your voice / connected to your stack /
 *      every model. The multi-model + integrations story the home was missing.
 *
 * Placeholders: the centre mark, the app tiles, and the model dots are clearly
 * marked TODOs for real logos/art. Everything else is final.
 */

import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarCheck,
  CheckCheck,
  PenLine,
  TrendingUp,
} from 'lucide-react';
import { AsciiField } from '../ascii-field';
import { SpotlightCard } from '../spotlight-card';

// The jobs that orbit the mark. `pos` places each pill on the md+ orbit.
const orbitJobs = [
  { label: 'scores the lead', Icon: TrendingUp, pos: 'top-6 left-[6%]', float: 0 },
  { label: 'drafts the reply', Icon: PenLine, pos: 'top-10 right-[8%]', float: 0.6 },
  { label: 'books the tour', Icon: CalendarCheck, pos: 'top-1/2 left-[1%] -translate-y-1/2', float: 1.2 },
  { label: 'updates the deal', Icon: ArrowUpRight, pos: 'top-1/2 right-[1%] -translate-y-1/2', float: 0.3 },
  { label: 'logs the touch', Icon: CheckCheck, pos: 'bottom-8 left-[12%]', float: 0.9 },
  { label: 'chases follow-ups', Icon: Bell, pos: 'bottom-6 right-[14%]', float: 1.5 },
];

function OrbitPill({ Icon, label }: { Icon: typeof Bell; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 backdrop-blur-md">
      <Icon className="h-3.5 w-3.5 text-brand" />
      {label}
    </span>
  );
}

export function AgentShowcase() {
  return (
    <section id="the-agent" className="relative scroll-mt-24 bg-background py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-brand text-xs uppercase tracking-[0.25em] text-brand">The agent</p>
          <h2 className="font-brand mt-3 text-3xl text-foreground sm:text-4xl lg:text-5xl">
            Works where you <span className="text-gradient-brand">already work.</span>
          </h2>
          <p className="mt-4 text-lg text-foreground/60">
            Chippi lives in your inbox, your calendar, and your pipeline, and does the work across
            all three. Every send still waits for your tap.
          </p>
        </div>

        {/* 1. The orbit — dark ASCII panel with the mark at centre and jobs around it. */}
        <div className="relative mx-auto mt-16 max-w-5xl overflow-hidden rounded-marketing-3xl border border-white/10 bg-[#111113]">
          <AsciiField className="absolute inset-0 h-full w-full opacity-40" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(255,150,79,0.22),transparent_60%)]" />

          <div className="relative z-10 px-6 py-16 sm:py-20">
            {/* Orbit stage (md+): centre mark + floating job pills + concentric rings. */}
            <div className="relative mx-auto hidden h-[420px] max-w-3xl md:block">
              {/* concentric orbit rings */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06]"
              />

              {/* centre mark — TODO: replace placeholder with the Chippi logo mark */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-marketing-2xl bg-gradient-to-br from-brand to-amber-400 shadow-lg shadow-brand/30">
                  {/* placeholder glyph for the brand mark */}
                  <span className="font-brand text-3xl text-white">C</span>
                </div>
                <p className="font-brand mt-3 text-sm text-white">Chippi</p>
                <p className="text-xs text-white/50">always on</p>
              </div>

              {/* floating job pills */}
              {orbitJobs.map((job) => (
                <motion.div
                  key={job.label}
                  className={`absolute ${job.pos}`}
                  animate={{ y: [0, -7, 0] }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: job.float,
                  }}
                >
                  <OrbitPill Icon={job.Icon} label={job.label} />
                </motion.div>
              ))}
            </div>

            {/* Mobile: centre mark + wrapped pills (no absolute orbit). */}
            <div className="md:hidden">
              <div className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-marketing-2xl bg-gradient-to-br from-brand to-amber-400 shadow-lg shadow-brand/30">
                  <span className="font-brand text-2xl text-white">C</span>
                </div>
                <p className="font-brand mt-3 text-sm text-white">Chippi</p>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {orbitJobs.map((job) => (
                  <OrbitPill key={job.label} Icon={job.Icon} label={job.label} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Proof cards — show Chippi working, not just claim it. */}
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Card: scores the lead */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0 }}
          >
            <SpotlightCard className="h-full p-6">
              <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">In the inbox</p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Knows who to call first</h3>
              {/* mockup */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
                    MP
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">Maya Patel</p>
                    <p className="truncate text-xs text-muted-foreground">new buyer inquiry</p>
                  </div>
                  <span className="inline-flex flex-shrink-0 items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
                    hot · 82
                  </span>
                </div>
                <p className="pl-1 text-xs text-muted-foreground">
                  <span className="font-medium text-brand">Chippi</span> scored her against your 3 open
                  deals. call her first.
                </p>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card: drafts the reply */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <SpotlightCard className="h-full p-6">
              <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">The reply</p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Written in your voice</h3>
              {/* mockup */}
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                  <p className="text-sm leading-relaxed text-foreground/80">
                    &ldquo;Hi Maya, thanks for reaching out about 14 Oak. I have Saturday open if
                    you&rsquo;d like to see it in person&hellip;&rdquo;
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium text-brand">Chippi</span> drafted
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                      Edit
                    </span>
                    <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium text-background">
                      Approve
                    </span>
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* Card: books the tour */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.16 }}
          >
            <SpotlightCard className="h-full p-6">
              <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">The calendar</p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Books it, then logs it</h3>
              {/* mockup */}
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand/15">
                    <CalendarCheck className="h-3.5 w-3.5 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">Tour · 14 Oak St</p>
                    <p className="truncate text-xs text-muted-foreground">Saturday, 2:00 PM</p>
                  </div>
                  <CheckCheck className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                </div>
                <p className="pl-1 text-xs text-muted-foreground">
                  <span className="font-medium text-brand">Chippi</span> booked it, sent the
                  confirmation, and wrote it back to the deal.
                </p>
              </div>
            </SpotlightCard>
          </motion.div>
        </div>

        {/* 3. The platform strip — voice / connected / models. */}
        <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-3xl border border-border/60 bg-border/60 sm:grid-cols-3">
          {/* trained on your voice */}
          <div className="bg-background px-6 py-8 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-subtle px-3 py-1.5">
              <PenLine className="h-3.5 w-3.5 text-brand" />
              <span className="text-xs font-medium text-foreground">sound like you</span>
            </div>
            <h3 className="font-brand mt-4 text-lg text-foreground">Trained on your voice</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts that read like you wrote them, learned from how you actually reply.
            </p>
          </div>

          {/* connected to your stack */}
          <div className="bg-background px-6 py-8 text-center">
            {/* TODO: swap letter tiles for real Gmail / Outlook / Calendar logos */}
            <div className="flex items-center justify-center gap-1.5">
              {['G', 'O', 'C', '+'].map((t) => (
                <span
                  key={t}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-muted/40 text-xs font-medium text-muted-foreground"
                >
                  {t}
                </span>
              ))}
            </div>
            <h3 className="font-brand mt-4 text-lg text-foreground">Connected to your stack</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Gmail, Outlook, your calendar, and 50+ more. Two minutes, no migration.
            </p>
          </div>

          {/* every model */}
          <div className="bg-background px-6 py-8 text-center">
            {/* TODO: swap dots for real model marks (ChatGPT / Claude / Gemini) */}
            <div className="flex items-center justify-center -space-x-2">
              {['bg-foreground/80', 'bg-brand', 'bg-foreground/40'].map((c) => (
                <span
                  key={c}
                  className={`h-8 w-8 rounded-full border-2 border-background ${c}`}
                />
              ))}
            </div>
            <h3 className="font-brand mt-4 text-lg text-foreground">Every model</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Chippi routes each job to the model that does it best, so you never pick one.
            </p>
          </div>
        </div>

        {/* Section CTA */}
        <div className="mt-12 text-center">
          <Link
            href="/realtors"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 px-6 py-3 text-sm font-medium text-foreground/80 transition-colors hover:border-border hover:text-foreground"
          >
            See everything Chippi handles
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
