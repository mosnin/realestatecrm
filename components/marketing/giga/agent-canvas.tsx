'use client';

/**
 * RealEstateOS — the signature ANIMATED feature showcase (reference-matched).
 *
 * ONE component: eyebrow + big serif headline (left) and three plain-icon
 * mini-features (right); below, a big rounded card split into a text column
 * (gradient product name + blurb + ghost pill + an auto-advancing STEPPED LIST)
 * and a fixed scenic background with a FROSTED, translucent product-UI card
 * composited over it. The card swaps per step and its rows stagger in on each
 * transition. Auto-advances on a progress bar, pauses on hover, reduced-motion
 * aware. Copy + mockups are Chippi/real-estate.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  LayoutGrid,
  Sparkles,
  PenLine,
  ShieldCheck,
  Search,
  Home,
  FileText,
  CalendarCheck,
  TrendingUp,
  Mail,
  MessageSquare,
  Phone,
  Send,
  CheckCircle2,
  RefreshCw,
  Inbox,
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
  { key: 'data', title: 'Access data in seconds', desc: 'Ask in plain language and Chippi pulls the contact, deal, or document instantly — no digging through tabs.' },
  { key: 'leads', title: 'Stay on top of leads & deals', desc: 'Every lead scored and ranked, every deal moved forward — you always know the next best move.' },
  { key: 'comms', title: 'Communicate with clients', desc: 'Replies drafted in your voice across email, text, and WhatsApp — sent the moment you approve.' },
  { key: 'busywork', title: 'Offload the busy work', desc: 'Confirmations, follow-ups, data entry, scheduling — Chippi clears the grind in the background.' },
  { key: 'plan', title: 'Plan your day', desc: 'A morning brief that lines up your tours, calls, and priorities so you start every day ahead.' },
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
        <div className="mt-12 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-2.5 sm:p-3">
          <div
            className="grid gap-2.5 sm:gap-3 lg:grid-cols-[0.66fr_1.34fr]"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocusCapture={() => setPaused(true)}
            onBlurCapture={() => setPaused(false)}
          >
            {/* LEFT: product name + blurb + ghost pill + stepped list */}
            <div className="flex flex-col p-6 sm:p-9">
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2] text-black">
                  <LayoutGrid className="h-[18px] w-[18px]" />
                </span>
                <span
                  className="bg-gradient-to-r from-[#ff7a45] via-[#ff7e6b] to-[#ff5fa2] bg-clip-text text-[22px] font-semibold tracking-tight text-transparent"
                  style={{ fontFamily: 'var(--font-heading)' }}
                >
                  Real Estate OS
                </span>
              </span>
              <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/60">
                Chippi is the operating system for your real-estate business — it finds anything,
                works your pipeline, talks to clients, and clears the busy work, so your hours go
                to closing.
              </p>
              <div className="mt-6">
                <PillGhost href="/agents">Explore Real Estate OS</PillGhost>
              </div>

              {/* Stepped list — plain text; the active step's top divider doubles
                  as a filling white progress bar. */}
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

            {/* RIGHT: scenic bg + composited FROSTED product panel per step */}
            <div className="relative min-h-[480px] overflow-hidden rounded-2xl lg:min-h-[700px]">
              {/* fixed scenic background — moody but visible so the frosted card
                  reads as glass over the landscape. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/marketing/home-hero.jpg"
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: 'saturate(0.78) brightness(0.62) contrast(1.05)' }}
              />
              <div aria-hidden className="absolute inset-0 bg-black/35" />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-black/25" />

              <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={reduce ? undefined : { opacity: 0, y: -10, filter: 'blur(10px)' }}
                    transition={{ duration: 0.5, ease: EASE_OUT }}
                    className="w-full max-w-xl"
                  >
                    <StepMockup step={active} reduce={!!reduce} />
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

/* ── Frosted mockup kit ─────────────────────────────────────────────────────
 * Translucent dark "glass" panels (the landscape shows through, blurred), with
 * rows that stagger in each time the panel swaps. */

const rowV = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
};

function Frost({
  title,
  badge,
  reduce,
  children,
}: {
  title: string;
  badge?: string;
  reduce: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#0b0b0d]/55 shadow-2xl shadow-black/60 backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded-full bg-gradient-to-br from-[#ff7a45] to-[#ff5fa2]" />
          <span className="text-[13px] font-medium text-white">{title}</span>
        </span>
        {badge ? (
          <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/60">{badge}</span>
        ) : (
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </span>
        )}
      </div>
      <motion.div
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
        initial={reduce ? false : 'hidden'}
        animate="show"
        className="space-y-1.5 p-3"
      >
        {children}
      </motion.div>
    </div>
  );
}

function Row({
  icon: Icon,
  title,
  meta,
  tone,
  active,
  right,
}: {
  icon: React.ElementType;
  title: string;
  meta?: string;
  tone?: string;
  active?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <motion.div
      variants={rowV}
      className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5', active ? 'bg-white/[0.06]' : '')}
    >
      <span className={cn('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]', tone ?? 'text-white/55')}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-white">{title}</span>
        {meta ? <span className="block truncate text-[11px] text-white/45">{meta}</span> : null}
      </span>
      {right}
    </motion.div>
  );
}

function Dot({ tone }: { tone: string }) {
  return <span className={cn('h-1.5 w-1.5 rounded-full', tone)} />;
}

function StepMockup({ step, reduce }: { step: number; reduce: boolean }) {
  switch (step) {
    case 0: // Access data in seconds
      return (
        <Frost title="Ask Chippi" badge="0.4s" reduce={reduce}>
          <motion.div
            variants={rowV}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
          >
            <Search className="h-3.5 w-3.5 text-white/45" />
            <span className="text-[12.5px] text-white/85">Sarah Chen — last showings + budget</span>
            <span className="ml-auto h-3 w-px animate-pulse bg-white/40" />
          </motion.div>
          <Row icon={Home} title="Sarah Chen" meta="Buyer · pre-approved to $650k" tone="text-[#ff9a6e]" active />
          <Row icon={CalendarCheck} title="Toured 142 Oak St" meta="Sat 2:00pm · loved the kitchen" />
          <Row icon={CalendarCheck} title="Toured 88 Pine Ave" meta="last week · passed, too small" />
          <Row icon={FileText} title="Pre-approval letter.pdf" meta="uploaded Mar 3 · verified" />
        </Frost>
      );
    case 1: // Stay on top of leads & deals
      return (
        <Frost title="Pipeline" badge="Live" reduce={reduce}>
          <motion.div variants={rowV} className="grid grid-cols-3 gap-2 px-1 pb-2">
            {[
              { n: '24', l: 'Active' },
              { n: '6', l: 'Hot' },
              { n: '3', l: 'Closing' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-center">
                <span className="block text-[20px] font-semibold leading-none text-white">{s.n}</span>
                <span className="mt-1.5 block text-[10px] text-white/45">{s.l}</span>
              </div>
            ))}
          </motion.div>
          {[
            { t: 'Marcus Lee', m: 'Touring · replied 2×', s: '92', d: 'bg-[#ff7a45]' },
            { t: 'The Romeros', m: 'Offer out · awaiting', s: '88', d: 'bg-[#ff7a45]' },
            { t: 'Priya Patel', m: 'Nurture · opened email', s: '64', d: 'bg-amber-400' },
            { t: 'Devon Ray', m: 'New · web form', s: '41', d: 'bg-sky-400/70' },
          ].map((r) => (
            <Row
              key={r.t}
              icon={TrendingUp}
              title={r.t}
              meta={r.m}
              right={
                <span className="flex items-center gap-2">
                  <Dot tone={r.d} />
                  <span className="w-6 text-right text-[12px] font-medium tabular-nums text-white/80">{r.s}</span>
                </span>
              }
            />
          ))}
        </Frost>
      );
    case 2: // Communicate with clients
      return (
        <Frost title="Draft reply" badge="In your voice" reduce={reduce}>
          <motion.div variants={rowV} className="flex gap-1.5 px-1 pb-1">
            {[
              { icon: Mail, label: 'Email', on: true },
              { icon: MessageSquare, label: 'SMS', on: false },
              { icon: Phone, label: 'WhatsApp', on: false },
            ].map((t) => {
              const TIcon = t.icon;
              return (
                <span
                  key={t.label}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]',
                    t.on ? 'bg-white/[0.1] text-white' : 'text-white/45',
                  )}
                >
                  <TIcon className="h-3 w-3" />
                  {t.label}
                </span>
              );
            })}
          </motion.div>
          <Row icon={Home} title="To: Sarah Chen" meta="re: 142 Oak St — still available?" tone="text-[#ff9a6e]" />
          <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[12px] leading-relaxed text-white/75">
              Hi Sarah — good news, 142 Oak St is still on the market. Want me to grab a
              Saturday slot so you can see it again before the open house?
            </p>
          </motion.div>
          <motion.div variants={rowV} className="flex items-center justify-between px-1 pt-1">
            <span className="text-[11px] text-white/40">Drafted from your last 40 emails</span>
            <span className="flex gap-2">
              <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/70">Edit</span>
              <span className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black">
                <Send className="h-3 w-3" /> Send
              </span>
            </span>
          </motion.div>
        </Frost>
      );
    case 3: // Offload the busy work
      return (
        <Frost title="Running for you" badge="Auto" reduce={reduce}>
          <Row
            icon={CheckCircle2}
            title="Sent tour confirmation — Marcus"
            meta="Sat 2:00pm · added to calendar"
            tone="text-emerald-300/80"
          />
          <Row
            icon={CheckCircle2}
            title="Moved The Romeros → Offer"
            meta="stage advanced · note logged"
            tone="text-emerald-300/80"
          />
          <Row
            icon={CheckCircle2}
            title="Logged call notes — Priya"
            meta="3 min call · summarized"
            tone="text-emerald-300/80"
          />
          <Row
            icon={RefreshCw}
            title="Drafting 4 follow-ups…"
            meta="warm leads, no reply in 3 days"
            tone="text-[#ff9a6e]"
            active
          />
          <Row icon={Inbox} title="Sorted 12 inbound messages" meta="across email, text, and portals" />
        </Frost>
      );
    default: // Plan your day
      return (
        <Frost title="Today" badge="Tue · 8:00 AM" reduce={reduce}>
          <motion.div variants={rowV} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[12px] leading-relaxed text-white/75">
              3 tours, 2 calls, and 5 follow-ups due. Marcus is closest to closing —
              start there.
            </p>
          </motion.div>
          <Row icon={Phone} title="9:00 — Call Marcus" meta="pre-approval expires Friday" tone="text-[#ff9a6e]" active />
          <Row icon={Home} title="11:30 — Tour 142 Oak St" meta="with Sarah Chen" />
          <Row icon={Home} title="2:00 — Tour 88 Pine Ave" meta="with the Romeros" />
          <Row icon={CalendarCheck} title="4:00 — Follow up" meta="3 warm leads queued by Chippi" />
        </Frost>
      );
  }
}
