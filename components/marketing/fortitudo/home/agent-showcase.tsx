'use client';

/**
 * Agent showcase ("Chippi, working") — reference layout (ClickUp Brain block)
 * rendered in the calm light fortitudo system so it harmonizes with the rest of
 * the home instead of reading as a dark clone.
 *
 * Every surface shares one vocabulary (SpotlightCard chrome, hairline borders,
 * the subtle ASCII signature) so the section reads as a single cohesive unit:
 *   header
 *   → orbit card (Chippi mark + jobs floating around it, on the light card)
 *   → three proof cards with realistic multi-element mockups (triage / thread / agenda)
 *   → one wide flagship card ("ask Chippi anything")
 *   → platform strip (voice / connected / every model)
 *
 * Placeholders: the centre mark, the app tiles, and the model dots are marked
 * TODO for real art.
 */

import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Bell,
  CalendarCheck,
  CheckCheck,
  PenLine,
  TrendingUp,
} from 'lucide-react';
import { AsciiField } from '../ascii-field';
import { SpotlightCard } from '../spotlight-card';

// Jobs that float around the mark. `pos` places each on the md+ orbit; kept
// airy and spread to the edges (not clustered) to echo the reference.
const orbitJobs = [
  { label: 'scores the lead', Icon: TrendingUp, pos: 'top-[8%] left-[4%]', float: 0 },
  { label: 'drafts the reply', Icon: PenLine, pos: 'top-[14%] right-[5%]', float: 0.7 },
  { label: 'books the tour', Icon: CalendarCheck, pos: 'top-1/2 left-[1%] -translate-y-1/2', float: 1.3 },
  { label: 'updates the deal', Icon: ArrowRight, pos: 'top-1/2 right-[1%] -translate-y-1/2', float: 0.4 },
  { label: 'logs the touch', Icon: CheckCheck, pos: 'bottom-[10%] left-[8%]', float: 1.0 },
  { label: 'chases follow-ups', Icon: Bell, pos: 'bottom-[8%] right-[9%]', float: 1.6 },
];

function OrbitPill({ Icon, label }: { Icon: typeof Bell; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-foreground/75 shadow-sm backdrop-blur-md">
      <Icon className="h-3.5 w-3.5 text-brand" />
      {label}
    </span>
  );
}

// One lead row in the triage mockup.
function LeadRow({
  initials,
  name,
  note,
  score,
  tone,
  highlight,
}: {
  initials: string;
  name: string;
  note: string;
  score: string;
  tone: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
        highlight ? 'border-brand/30 bg-brand-subtle' : 'border-border/60 bg-muted/30'
      }`}
    >
      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{note}</p>
      </div>
      <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
        {score}
      </span>
    </div>
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

        {/* Orbit — light card, Chippi mark at centre, jobs floating around it. */}
        <div className="mx-auto mt-16 max-w-5xl">
          <SpotlightCard className="overflow-hidden">
            <div className="relative">
              <AsciiField className="absolute inset-0 h-full w-full opacity-[0.12]" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,var(--brand-subtle),transparent_60%)]" />

              <div className="relative z-10 px-6 py-16 sm:py-20">
                {/* md+ orbit stage */}
                <div className="relative mx-auto hidden h-[400px] max-w-3xl md:block">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/50"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/30"
                  />

                  {/* centre mark — TODO: replace placeholder tile with the Chippi logo mark */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <div className="absolute -inset-6 -z-10 rounded-full bg-[radial-gradient(circle,rgba(255,150,79,0.28),transparent_70%)]" />
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-marketing-2xl bg-gradient-to-br from-brand to-amber-400 shadow-lg shadow-brand/30">
                      <span className="font-brand text-3xl text-white">C</span>
                    </div>
                    <p className="font-brand mt-3 text-sm text-foreground">Chippi</p>
                    <p className="text-xs text-muted-foreground">always on</p>
                  </div>

                  {orbitJobs.map((job) => (
                    <motion.div
                      key={job.label}
                      className={`absolute ${job.pos}`}
                      animate={{ y: [0, -7, 0] }}
                      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: job.float }}
                    >
                      <OrbitPill Icon={job.Icon} label={job.label} />
                    </motion.div>
                  ))}
                </div>

                {/* mobile fallback */}
                <div className="md:hidden">
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-marketing-2xl bg-gradient-to-br from-brand to-amber-400 shadow-lg shadow-brand/30">
                      <span className="font-brand text-2xl text-white">C</span>
                    </div>
                    <p className="font-brand mt-3 text-sm text-foreground">Chippi</p>
                  </div>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {orbitJobs.map((job) => (
                      <OrbitPill key={job.label} Icon={job.Icon} label={job.label} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </div>

        {/* Three proof cards — richer, multi-element mockups. */}
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* triage */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <SpotlightCard className="h-full p-6">
              <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">In the inbox</p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Knows who to call first</h3>
              <div className="mt-5 space-y-2">
                <LeadRow
                  initials="MP"
                  name="Maya Patel"
                  note="new buyer inquiry · 14 Oak St"
                  score="hot · 82"
                  tone="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                  highlight
                />
                <LeadRow
                  initials="TR"
                  name="Tom Reyes"
                  note="refi question"
                  score="warm · 64"
                  tone="bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                />
                <LeadRow
                  initials="DL"
                  name="Dana Lee"
                  note="just browsing"
                  score="cold · 41"
                  tone="bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400"
                />
                <p className="pt-1 text-xs text-muted-foreground">
                  <span className="font-medium text-brand">Chippi</span> ranked your inbox against your
                  open deals. Maya first.
                </p>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* thread */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <SpotlightCard className="h-full p-6">
              <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">The reply</p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Written in your voice</h3>
              <div className="mt-5 space-y-3">
                {/* incoming */}
                <div className="flex gap-2">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-medium text-foreground/70">
                    MP
                  </span>
                  <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-relaxed text-foreground/80">
                    Is 14 Oak still available? Could I see it this weekend?
                  </div>
                </div>
                {/* Chippi draft */}
                <div className="rounded-2xl border border-brand/25 bg-brand-subtle px-3 py-2.5">
                  <p className="text-xs leading-relaxed text-foreground/85">
                    Hi Maya, thanks for reaching out about 14 Oak. I have Saturday at 2 open if
                    you&rsquo;d like to see it in person.
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-brand">Chippi</span> drafted · your voice
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        Edit
                      </span>
                      <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-medium text-background">
                        Approve
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </motion.div>

          {/* agenda */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.16 }}
          >
            <SpotlightCard className="h-full p-6">
              <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">The calendar</p>
              <h3 className="font-brand mt-2 text-xl text-foreground">Books it, then logs it</h3>
              <div className="mt-5">
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Saturday
                  </p>
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 rounded-lg border border-brand/25 bg-brand-subtle px-2.5 py-2">
                      <CalendarCheck className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-foreground">2:00 PM · Tour, 14 Oak St</p>
                        <p className="truncate text-[10px] text-muted-foreground">Maya Patel · confirmed</p>
                      </div>
                      <CheckCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    </div>
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-border" />
                      4:30 PM · open
                    </div>
                  </div>
                </div>
                <p className="pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-brand">Chippi</span> booked it, sent the
                  confirmation, and wrote it back to the deal.
                </p>
              </div>
            </SpotlightCard>
          </motion.div>
        </div>

        {/* Wide flagship card — the "ask Chippi anything" beat. */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-5"
        >
          <SpotlightCard className="p-6 sm:p-8">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <p className="font-brand text-xs uppercase tracking-[0.2em] text-brand">Ask anything</p>
                <h3 className="font-brand mt-2 text-2xl text-foreground sm:text-3xl">
                  It knows your whole book.
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Every deal, every thread, every tour. Ask Chippi in plain language and the answer
                  comes back with names and numbers, not a shrug.
                </p>
              </div>
              {/* composer mockup */}
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2">
                  <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand to-amber-400 text-[10px] text-white">
                    C
                  </span>
                  <span className="text-xs text-foreground/70">which buyers should I call today?</span>
                </div>
                <div className="mt-3 space-y-2 px-1">
                  <div className="flex items-start gap-2">
                    <CheckCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" />
                    <p className="text-xs leading-relaxed text-foreground/80">
                      <span className="font-medium">Maya Patel</span> — hot, tour Saturday. Confirm the time.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand" />
                    <p className="text-xs leading-relaxed text-foreground/80">
                      <span className="font-medium">Tom Reyes</span> — refi, gone quiet 4 days. Nudge him.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        {/* Platform strip — voice / connected / every model. */}
        <div className="mt-5 grid grid-cols-1 gap-px overflow-hidden rounded-marketing-3xl border border-border/60 bg-border/60 sm:grid-cols-3">
          <div className="bg-card px-6 py-8 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-subtle px-3 py-1.5">
              <PenLine className="h-3.5 w-3.5 text-brand" />
              <span className="text-xs font-medium text-foreground">sound like you</span>
            </div>
            <h3 className="font-brand mt-4 text-lg text-foreground">Trained on your voice</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Drafts that read like you wrote them, learned from how you actually reply.
            </p>
          </div>

          <div className="bg-card px-6 py-8 text-center">
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

          <div className="bg-card px-6 py-8 text-center">
            {/* TODO: swap dots for real model marks (ChatGPT / Claude / Gemini) */}
            <div className="flex items-center justify-center -space-x-2">
              {['bg-foreground/80', 'bg-brand', 'bg-foreground/40'].map((c) => (
                <span key={c} className={`h-8 w-8 rounded-full border-2 border-card ${c}`} />
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
