'use client';

/**
 * MorningStage — the home page's signature scroll-cinematic moment.
 *
 * A pinned stage where the scroll bar becomes the clock: as you scroll, a real
 * morning advances through four beats — leads land and get scored, replies are
 * drafted in your voice, a tour books itself, the pipeline advances — with a
 * timeline rail filling alongside a live product frame. Scroll is time; the
 * visitor conducts the demo. The payoff: your morning's work, already done by
 * the time you sit down.
 *
 * Desktop + motion-on → the stage pins and the beats scrub with scroll.
 * Mobile + reduced-motion → the same four beats as a calm vertical sequence,
 * no pin, no scroll-coupling. The section lives below the fold, so the
 * static→pinned upgrade is gated behind a mount flag to keep SSR markup stable.
 */

import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, CalendarCheck, ArrowUpRight, MessageCircle } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';
import { TITLE_FONT } from '@/lib/typography';
import { BrowserFrame, GridBackdrop } from '../frame';

type Beat = { time: string; tag: string; label: string };

const BEATS: Beat[] = [
  { time: '7:40 AM', tag: 'While you slept', label: 'Leads landed — and scored' },
  { time: '8:05 AM', tag: 'Before your coffee', label: 'Replies drafted in your voice' },
  { time: '9:30 AM', tag: 'Straight from the thread', label: 'A tour, booked' },
  { time: '11:00 AM', tag: 'No status meeting', label: 'The pipeline, advanced' },
];

const FRAME_URL = [
  'app.chippi.ai/inbox',
  'app.chippi.ai/drafts',
  'app.chippi.ai/calendar',
  'app.chippi.ai/pipeline',
];

const HEADLINE = (
  <>
    Your morning,
    <br />
    already handled.
  </>
);

const SUB =
  'Scroll through a single morning. Every move is Chippi’s — you just approve. By the time you sit down, the work is already done.';

export function MorningStage() {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // SSR + first paint render the stacked version (stable markup). After mount,
  // motion-capable desktop upgrades to the pinned scrubber — below the fold, so
  // the swap is never seen.
  if (!mounted || reduce) return <StackedStage />;
  return (
    <>
      <div className="md:hidden">
        <StackedStage />
      </div>
      <div className="hidden md:block">
        <PinnedStage />
      </div>
    </>
  );
}

/* ── Desktop: the pinned scroll-scrubber ───────────────────────────────────── */

function PinnedStage() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const fill = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      const next = Math.min(BEATS.length - 1, Math.max(0, Math.floor(v * BEATS.length)));
      setStep((prev) => (prev === next ? prev : next));
    });
    return () => unsub();
  }, [scrollYProgress]);

  return (
    <section ref={ref} className="relative h-[400vh] border-y border-border/60 bg-muted/20">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <GridBackdrop />
        <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* copy + timeline */}
          <div className="flex flex-col justify-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              A morning with Chippi
            </p>
            <h2 style={TITLE_FONT} className="mt-4 text-4xl leading-[1.08] tracking-tight text-foreground sm:text-5xl">
              {HEADLINE}
            </h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">{SUB}</p>

            <div className="relative mt-10 pl-1">
              <div className="absolute left-[6px] bottom-2 top-2 w-px bg-border" />
              <motion.div className="absolute left-[6px] top-2 w-px bg-brand" style={{ height: fill }} />
              <ul className="space-y-6">
                {BEATS.map((b, i) => {
                  const active = i === step;
                  const done = i < step;
                  return (
                    <li key={b.time} className="relative flex items-start gap-4">
                      <span
                        className={`relative z-10 mt-1 h-3 w-3 flex-shrink-0 rounded-full border transition-colors duration-300 ${
                          active
                            ? 'border-brand bg-brand'
                            : done
                              ? 'border-brand bg-brand/40'
                              : 'border-border bg-background'
                        }`}
                      />
                      <div className="-mt-0.5">
                        <p
                          className={`text-xs font-medium tabular-nums transition-colors duration-300 ${
                            active ? 'text-brand' : 'text-muted-foreground'
                          }`}
                        >
                          {b.time}
                        </p>
                        <p
                          className={`text-sm transition-colors duration-300 ${
                            active ? 'text-foreground' : 'text-muted-foreground/60'
                          }`}
                        >
                          {b.label}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* the frame */}
          <div className="flex items-center">
            <BrowserFrame url={FRAME_URL[step]} className="w-full">
              <div className="flex h-[320px] flex-col sm:h-[380px]">
                <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-brand text-[9px] font-bold text-brand-foreground">
                      C
                    </span>
                    Chippi
                  </span>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {BEATS[step].time} · {BEATS[step].tag}
                  </span>
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.35, ease: EASE_OUT }}
                      className="absolute inset-4 sm:inset-5"
                    >
                      <BeatBody step={step} />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </BrowserFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Mobile + reduced-motion: the calm stacked sequence ────────────────────── */

function StackedStage() {
  return (
    <section className="relative border-y border-border/60 bg-muted/20 px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          A morning with Chippi
        </p>
        <h2 style={TITLE_FONT} className="mt-4 text-3xl leading-[1.1] tracking-tight text-foreground sm:text-4xl">
          {HEADLINE}
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">{SUB}</p>

        <div className="mt-12 space-y-10">
          {BEATS.map((b, i) => (
            <motion.div
              key={b.time}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-medium tabular-nums text-brand">{b.time}</span>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{b.tag}</span>
              </div>
              <p className="mt-2 text-lg text-foreground">{b.label}</p>
              <BrowserFrame url={FRAME_URL[i]} className="mt-4">
                <div className="h-[300px] p-4 sm:p-5">
                  <BeatBody step={i} />
                </div>
              </BrowserFrame>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Beats ─────────────────────────────────────────────────────────────────── */

function BeatBody({ step }: { step: number }) {
  if (step === 0) return <ScoredBeat />;
  if (step === 1) return <DraftBeat />;
  if (step === 2) return <BookedBeat />;
  return <PipelineBeat />;
}

const TONES: Record<string, string> = {
  hot: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  warm: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  cold: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
};

function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
      {children}
    </span>
  );
}

function ScoredBeat() {
  const reduce = useReducedMotion();
  const rows = [
    { initials: 'MP', name: 'Maya Patel', note: 'buyer · 14 Oak St', score: 'hot · 82', tone: 'hot', highlight: true },
    { initials: 'TR', name: 'Tom Reyes', note: 'refi question', score: 'warm · 64', tone: 'warm' },
    { initials: 'DL', name: 'Dana Lee', note: 'just browsing', score: 'cold · 41', tone: 'cold' },
  ];
  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">3 leads landed overnight</p>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.name}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 * i }}
            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
              r.highlight ? 'border-brand/30 bg-brand-subtle' : 'border-border/60 bg-muted/20'
            }`}
          >
            <Avatar>{r.initials}</Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{r.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{r.note}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[r.tone]}`}>{r.score}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={{ width: reduce ? '82%' : 0 }}
            animate={{ width: '82%' }}
            transition={{ duration: 1, ease: EASE_OUT, delay: 0.4 }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-brand">Chippi</span> ranked them against your deals — call Maya first.
        </p>
      </div>
    </>
  );
}

const DRAFT =
  'Hi Maya — thanks for reaching out about 14 Oak. It’s still available, and I have Saturday at 2:00 open if you’d like to see it in person.';

function DraftBeat() {
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (reduce) {
      setTyped(DRAFT);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setTyped(DRAFT.slice(0, i));
      if (i >= DRAFT.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [reduce]);
  const done = typed.length >= DRAFT.length;
  return (
    <>
      <div className="flex gap-2.5">
        <Avatar>MP</Avatar>
        <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed text-foreground/80">
          Is 14 Oak still available? Could I see it this weekend?
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-brand/30 bg-background px-4 py-3 shadow-sm">
        <p className="min-h-[72px] text-sm leading-relaxed text-foreground/90">
          {typed}
          {!reduce && !done && (
            <span className="ml-0.5 inline-block h-4 w-[2px] -translate-y-[1px] animate-pulse bg-brand align-middle" />
          )}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
            <MessageCircle className="h-3 w-3" />
            Chippi drafted · your voice
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">Edit</span>
            <motion.span
              className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
              animate={done && !reduce ? { scale: [1, 1.06, 1] } : {}}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              Approve
            </motion.span>
          </div>
        </div>
      </div>
    </>
  );
}

function BookedBeat() {
  const reduce = useReducedMotion();
  const rows = [
    { Icon: CalendarCheck, text: 'Saturday · 2:00 PM — 14 Oak St' },
    { Icon: ArrowUpRight, text: 'Maya Patel → Touring' },
    { Icon: CheckCheck, text: 'Confirmation sent · written to the deal' },
  ];
  return (
    <div className="flex h-full flex-col justify-center">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-3"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15">
          <Check className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Tour booked.</p>
          <p className="text-[11px] text-muted-foreground">No back-and-forth.</p>
        </div>
      </motion.div>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.text}
            initial={reduce ? false : { opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 + 0.1 * i }}
            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2"
          >
            <r.Icon className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
            <span className="text-xs text-foreground/80">{r.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PipelineBeat() {
  const reduce = useReducedMotion();
  const columns = [
    { label: 'New', tone: 'text-muted-foreground', cards: [{ name: 'Dana Lee', val: '$640K' }] },
    {
      label: 'Touring',
      tone: 'text-brand',
      cards: [
        { name: 'Maya Patel', val: '$1.2M', moved: true },
        { name: 'Eli Vance', val: '$815K' },
      ],
    },
    { label: 'Offer', tone: 'text-emerald-600 dark:text-emerald-400', cards: [{ name: 'Sara Voss', val: '$890K' }] },
  ];
  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Pipeline · updated itself</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {columns.map((col, ci) => (
          <div key={col.label}>
            <div className="flex items-center justify-between px-0.5">
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${col.tone}`}>{col.label}</span>
              <span className="tabular-nums text-[10px] text-muted-foreground">{col.cards.length}</span>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {col.cards.map((card, ri) => {
                const moved = 'moved' in card && card.moved;
                return (
                  <motion.div
                    key={card.name}
                    initial={reduce ? false : moved ? { opacity: 0, y: -14, scale: 0.95 } : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.45, ease: EASE_OUT, delay: moved ? 0.45 : 0.1 * ci + 0.06 * ri }}
                    className={`rounded-lg border px-2 py-1.5 ${
                      moved ? 'border-brand/40 bg-brand-subtle' : 'border-border/60 bg-muted/20'
                    }`}
                  >
                    <p className="truncate text-[11px] font-medium text-foreground">{card.name}</p>
                    <p className="truncate text-[10px] tabular-nums text-muted-foreground">{card.val}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-brand">Maya</span> advanced to Touring — you didn’t lift a finger.
      </p>
    </>
  );
}
