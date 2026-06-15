'use client';

/**
 * AgentCanvas — the signature ANIMATED feature showcase (reference-matched).
 *
 * ONE component, exactly like the reference's "Built to handle complexity /
 * Agent Canvas" block:
 *   - eyebrow + big serif headline on the left, three plain-icon mini-features
 *     with vertical dividers on the right.
 *   - a big rounded card below, split:
 *       LEFT  → gradient icon + gradient product name + blurb + ghost pill +
 *               a vertical STEPPED LIST. The active step is highlighted with a
 *               filling progress bar and reveals its description.
 *       RIGHT → a fixed scenic background photo with a glassy product-UI panel
 *               composited over it. The panel CROSS-FADES to a different mockup
 *               for each step.
 *   - the active step AUTO-ADVANCES on a timer (the progress bar drives it),
 *     pauses on hover, and is clickable. Respects prefers-reduced-motion.
 *
 * Copy + mockups are Chippi/real-estate. Self-contained client component (no
 * props cross the server→client boundary).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LayoutGrid,
  Sparkles,
  PenLine,
  Inbox,
  ShieldCheck,
  GitBranch,
  CalendarCheck,
  Mail,
  Phone,
  Home,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { BlurRise, Eyebrow, PillGhost, Serif, Band } from './primitives';

/** Per-step dwell time before auto-advancing (ms). */
const DURATION = 6500;

const TOP_FEATURES = [
  { icon: Sparkles, title: 'Trained on your book', desc: 'Grounded in your listings, your voice, and how you actually work.' },
  { icon: PenLine, title: 'Drafts, never sends', desc: 'Every message is proposed; the send always goes through you.' },
  { icon: ShieldCheck, title: 'Audited end to end', desc: 'Every action written down in plain language you can review.' },
];

interface Step {
  key: string;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  { key: 'capture', title: 'Capture every lead', desc: 'New leads land from email, text, and your site — Chippi opens a record with the context already attached.' },
  { key: 'playbook', title: 'Set the playbook', desc: 'Tell Chippi the rules in plain language: who to prioritize, when to escalate, what to never send.' },
  { key: 'design', title: 'Design the follow-up', desc: 'Map the touches — first reply, tour offer, nurture cadence — and Chippi drafts each one in your voice.' },
  { key: 'launch', title: 'Test and launch', desc: 'Dry-run against your real book, confirm the drafts sound like you, then turn it on with one tap.' },
  { key: 'watch', title: 'Watch it work', desc: 'Leads worked, tours booked, follow-ups sent — live, around the clock, every action logged.' },
];

export function AgentCanvas() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);

  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const goTo = useCallback((i: number) => {
    setActive(i);
    setProgress(0);
    progressRef.current = 0;
    startRef.current = null;
  }, []);

  useEffect(() => {
    if (reduce) return;
    function tick(now: number) {
      if (pausedRef.current) {
        startRef.current = now - progressRef.current * DURATION;
      } else {
        if (startRef.current === null) startRef.current = now;
        const p = Math.min((now - startRef.current) / DURATION, 1);
        progressRef.current = p;
        setProgress(p);
        if (p >= 1) {
          startRef.current = null;
          progressRef.current = 0;
          setProgress(0);
          setActive((cur) => (cur + 1) % STEPS.length);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [reduce, active]);

  return (
    <Band className="py-24 sm:py-32">
      {/* Header: eyebrow + serif headline (left), three mini-features (right) */}
      <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-16">
        <BlurRise>
          <div>
            <Eyebrow>Your AI cowork</Eyebrow>
            <Serif className="mt-5 text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.02] text-white">
              Built to handle
              <br className="hidden sm:block" /> the whole deal.
            </Serif>
          </div>
        </BlurRise>
        <BlurRise delay={0.08}>
          <div className="grid grid-cols-1 gap-y-7 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-white/[0.08] lg:pt-3">
            {TOP_FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
                  <Icon className="h-[18px] w-[18px] text-white/55" />
                  <h3 className="mt-3.5 text-[13.5px] font-medium text-white">{f.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/45">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </BlurRise>
      </div>

      {/* The big animated card */}
      <BlurRise delay={0.12}>
        <div className="mt-12 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02]">
          <div
            className="grid lg:grid-cols-[0.66fr_1.34fr]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            {/* LEFT: product name + blurb + ghost pill + stepped list */}
            <div className="flex flex-col p-8 sm:p-10">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff9a6e] to-[#c77dff] text-black">
                  <LayoutGrid className="h-[18px] w-[18px]" />
                </span>
                <span
                  className="bg-gradient-to-r from-[#ffb59a] via-white to-[#d9b8ff] bg-clip-text text-[22px] font-semibold text-transparent"
                  style={{ fontFamily: 'var(--font-serif-display), Georgia, serif', fontVariationSettings: '"opsz" 144', fontWeight: 400 }}
                >
                  Pipeline Canvas
                </span>
              </span>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
                Chippi turns every lead into a worked deal. It captures, scores, drafts, books, and
                follows up — then shows you exactly what it did and why.
              </p>
              <div className="mt-6">
                <PillGhost href="/agents">Explore Pipeline Canvas</PillGhost>
              </div>

              {/* Stepped list — plain text steps; the active step's top divider
                  doubles as a filling white progress bar (the reference look). */}
              <div className="mt-9 flex flex-col">
                {STEPS.map((s, i) => {
                  const isActive = i === active;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={isActive}
                      className="group relative w-full cursor-pointer py-4 text-left"
                    >
                      {/* top hairline = divider for every step + progress fill on the active one */}
                      <span aria-hidden className="absolute inset-x-0 top-0 h-px overflow-hidden bg-white/[0.1]">
                        {isActive && (
                          <span
                            className="block h-full bg-white"
                            style={{
                              width: `${(reduce ? 1 : progress) * 100}%`,
                              transition: reduce ? 'width 0.3s ease' : 'none',
                            }}
                          />
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-[15px] transition-colors',
                          isActive ? 'font-medium text-white' : 'text-white/55 group-hover:text-white/80',
                        )}
                      >
                        {s.title}
                      </span>
                      <AnimatePresence initial={false}>
                        {isActive && (
                          <motion.p
                            initial={reduce ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={reduce ? undefined : { height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: EASE_OUT }}
                            className="overflow-hidden text-[13px] leading-snug text-white/50"
                          >
                            <span className="block pt-2">{s.desc}</span>
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: scenic bg + composited product panel that changes per step */}
            <div className="relative min-h-[460px] overflow-hidden border-t border-white/[0.08] lg:min-h-[600px] lg:border-l lg:border-t-0">
              {/* fixed scenic background — darkened + desaturated for the moody,
                  cinematic look of the reference (over a bright placeholder). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/home-hero.jpg"
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: 'saturate(0.7) brightness(0.5) contrast(1.05)' }}
              />
              <div aria-hidden className="absolute inset-0 bg-black/55" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />

              {/* composited mockup, cross-fades per step */}
              <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(8px)' }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                    className="w-full max-w-xl"
                  >
                    <StepMockup step={active} />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </BlurRise>
    </Band>
  );
}

/* ── Mockups ──────────────────────────────────────────────────────────────
 * Glassy dark product panels, one per step, in the redesign aesthetic. */

function Panel({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#0c0c0d]/90 shadow-2xl shadow-black/60 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full bg-gradient-to-br from-[#ff9a6e] to-[#c77dff]" />
          <span className="text-[13px] font-medium text-white">{title}</span>
        </span>
        {badge ? (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/55">{badge}</span>
        ) : (
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </span>
        )}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  meta,
  tone,
  active,
}: {
  icon: React.ElementType;
  title: string;
  meta?: string;
  tone?: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        active ? 'bg-white/[0.07]' : 'bg-transparent',
      )}
    >
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]', tone ?? 'text-white/55')}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white">{title}</span>
        {meta ? <span className="block truncate text-[11px] text-white/45">{meta}</span> : null}
      </span>
    </div>
  );
}

function Toggle({ on = true }: { on?: boolean }) {
  return (
    <span className={cn('flex h-4 w-7 items-center rounded-full p-0.5', on ? 'justify-end bg-[#ff7a45]' : 'justify-start bg-white/15')}>
      <span className="h-3 w-3 rounded-full bg-white" />
    </span>
  );
}

function StepMockup({ step }: { step: number }) {
  switch (step) {
    case 0: // Capture every lead
      return (
        <Panel title="New leads" badge="4 new">
          <div className="space-y-1">
            <Row icon={Home} title="Sarah Chen" meta="Zillow · 2 bed, downtown · 2m ago" tone="text-[#ff9a6e]" active />
            <Row icon={Mail} title="Marcus Lee" meta="Website form · pre-approved · 14m ago" />
            <Row icon={Phone} title="Priya Patel" meta="Missed call → text sent · 1h ago" />
            <Row icon={Mail} title="The Romeros" meta="Referral · relocating in March" />
          </div>
        </Panel>
      );
    case 1: // Set the playbook
      return (
        <Panel title="Playbook" badge="Plain language">
          <div className="space-y-1">
            {[
              'Prioritize pre-approved buyers',
              'Escalate any price drop to me',
              'Never message a client after 9pm',
              'Auto-draft the first reply in my voice',
            ].map((r, i) => (
              <div key={r} className="flex items-center justify-between rounded-xl px-3 py-2.5">
                <span className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-white/55">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  <span className="text-[12.5px] text-white">{r}</span>
                </span>
                <Toggle on={i < 4} />
              </div>
            ))}
          </div>
        </Panel>
      );
    case 2: // Design the follow-up
      return (
        <Panel title="Follow-up sequence" badge="Editing">
          <div className="space-y-2 px-1 py-1">
            {[
              { icon: Mail, t: 'First reply', m: 'instant', c: 'sent' },
              { icon: CalendarCheck, t: 'Tour offer', m: '+1 day', c: 'if no reply' },
              { icon: PenLine, t: 'Value check-in', m: '+3 days', c: 'new listings' },
              { icon: GitBranch, t: 'Nurture', m: 'weekly', c: 'until active' },
            ].map((s, i, arr) => (
              <div key={s.t} className="relative">
                <Row icon={s.icon} title={s.t} meta={`${s.m} · ${s.c}`} active={i === 0} tone={i === 0 ? 'text-[#ff9a6e]' : undefined} />
                {i < arr.length - 1 && <span className="ml-[26px] block h-2 w-px bg-white/12" />}
              </div>
            ))}
          </div>
        </Panel>
      );
    case 3: // Test and launch
      return (
        <Panel title="Dry run" badge="1,250 sims">
          <div className="grid grid-cols-2 gap-2 px-1 pb-2 pt-1">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <span className="text-[11px] text-white/45">Drafts approved</span>
              <span className="mt-1 block text-[24px] font-semibold leading-none text-white">96%</span>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <span className="text-[11px] text-white/45">Sounds like you</span>
              <span className="mt-1 block text-[24px] font-semibold leading-none text-white">94%</span>
            </div>
          </div>
          <div className="space-y-1">
            {[
              { t: 'Buyer inquiry', s: 'Passed', p: '100%', ok: true },
              { t: 'Price objection', s: 'Passed', p: '98%', ok: true },
              { t: 'After-hours lead', s: 'Deviated', p: '82%', ok: false },
            ].map((r) => (
              <div key={r.t} className="flex items-center justify-between px-3 py-2 text-[12px]">
                <span className="text-white/80">{r.t}</span>
                <span className="flex items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 rounded-full', r.ok ? 'bg-emerald-400' : 'bg-amber-400')} />
                  <span className={cn(r.ok ? 'text-emerald-300/80' : 'text-amber-300/80')}>{r.s}</span>
                  <span className="w-9 text-right text-white/45">{r.p}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      );
    default: // Watch it work
      return (
        <Panel title="Today" badge="Live">
          <div className="grid grid-cols-3 gap-2 px-1 pb-3 pt-1">
            {[
              { n: '14', l: 'Leads worked' },
              { n: '3', l: 'Tours booked' },
              { n: '<5m', l: 'Avg reply' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-center">
                <span className="block text-[20px] font-semibold leading-none text-white">{s.n}</span>
                <span className="mt-1.5 block text-[10px] leading-tight text-white/45">{s.l}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Row icon={PenLine} title="Drafted reply to Sarah Chen" meta="waiting for your tap" tone="text-[#ff9a6e]" active />
            <Row icon={CalendarCheck} title="Booked tour — Sat 2:00pm" meta="confirmation sent" />
            <Row icon={TrendingUp} title="Marcus Lee scored hot" meta="opened 3×, replied" />
            <Row icon={Inbox} title="Sorted 9 inbound messages" meta="across email + text" />
          </div>
        </Panel>
      );
  }
}
