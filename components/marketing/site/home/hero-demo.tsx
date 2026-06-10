'use client';

/**
 * HeroDemo — the interactive "Chippi at work" demo that lives inside the hero's
 * browser frame. Three auto-advancing beats that loop: a new lead is scored →
 * Chippi types a reply in your voice → the tour is booked and the pipeline
 * updates. Step dots let a visitor scrub between beats (interactive, not a
 * video). Built from the product's own card/row/pill vocabulary so it reads as
 * the real thing, on a calm framer-motion cadence. Reduced-motion: the draft
 * beat renders fully composed, no typewriter, no auto-advance.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, CalendarCheck, ArrowUpRight, MessageCircle } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

const STEP_MS = [2600, 4600, 2800];
const STEPS = ['In the inbox', 'The reply', 'Booked'] as const;
const DRAFT =
  'Hi Maya — thanks for reaching out about 14 Oak. It’s still available, and I have Saturday at 2:00 open if you’d like to see it in person.';

export function HeroDemo() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState('');

  // Auto-advance the loop (paused for reduced-motion — it rests on the reply).
  useEffect(() => {
    if (reduce) {
      setStep(1);
      return;
    }
    const t = setTimeout(() => setStep((s) => (s + 1) % 3), STEP_MS[step]);
    return () => clearTimeout(t);
  }, [step, reduce]);

  // Typewriter for the draft beat.
  useEffect(() => {
    if (step !== 1) {
      setTyped('');
      return;
    }
    if (reduce) {
      setTyped(DRAFT);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(DRAFT.slice(0, i));
      if (i >= DRAFT.length) clearInterval(id);
    }, 26);
    return () => clearInterval(id);
  }, [step, reduce]);

  return (
    <div className="select-none bg-background">
      {/* faux app chrome */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-brand text-[9px] font-bold text-brand-foreground">C</span>
          Chippi
        </span>
        <span className="text-[11px] text-muted-foreground">{STEPS[step]}</span>
      </div>

      <div className="relative h-[280px] overflow-hidden p-4 sm:h-[320px] sm:p-5">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <Beat key="lead">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">New inbound</p>
              <div className="mt-3 space-y-2">
                <LeadRow initials="MP" name="Maya Patel" note="buyer inquiry · 14 Oak St" />
                <LeadRow initials="TR" name="Tom Reyes" note="refi question" dim />
                <LeadRow initials="DL" name="Dana Lee" note="just browsing" dim />
              </div>
              <div className="mt-4 rounded-xl border border-brand/30 bg-brand-subtle p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Maya Patel — scored against your deals</span>
                  <ScorePill />
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
                  <motion.div
                    className="h-full rounded-full bg-brand"
                    initial={{ width: reduce ? '82%' : 0 }}
                    animate={{ width: '82%' }}
                    transition={{ duration: reduce ? 0 : 1.1, ease: EASE_OUT, delay: 0.2 }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Hot — call this one first.</p>
              </div>
            </Beat>
          )}

          {step === 1 && (
            <Beat key="draft">
              <div className="flex gap-2.5">
                <Avatar>MP</Avatar>
                <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm leading-relaxed text-foreground/80">
                  Is 14 Oak still available? Could I see it this weekend?
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-brand/30 bg-background px-4 py-3 shadow-sm">
                <p className="min-h-[60px] text-sm leading-relaxed text-foreground/90">
                  {typed}
                  {!reduce && typed.length < DRAFT.length && (
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
                      animate={typed.length >= DRAFT.length && !reduce ? { scale: [1, 1.06, 1] } : {}}
                      transition={{ duration: 0.5, ease: EASE_OUT }}
                    >
                      Approve
                    </motion.span>
                  </div>
                </div>
              </div>
            </Beat>
          )}

          {step === 2 && (
            <Beat key="booked">
              <motion.div
                initial={reduce ? false : { scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
                className="flex flex-col items-center py-3 text-center"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/12">
                  <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </span>
                <p className="mt-3 text-sm font-medium text-foreground">Tour booked.</p>
                <p className="text-[11px] text-muted-foreground">Confirmation sent to Maya.</p>
              </motion.div>
              <div className="mt-1 space-y-2">
                <DoneRow Icon={CalendarCheck} text="Saturday · 2:00 PM — 14 Oak St" />
                <DoneRow Icon={ArrowUpRight} text="Maya Patel → Touring" />
                <DoneRow Icon={CheckCheck} text="Written back to the deal" />
              </div>
            </Beat>
          )}
        </AnimatePresence>
      </div>

      {/* step scrubber */}
      <div className="flex items-center justify-center gap-2 border-t border-border/60 py-2.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            onClick={() => setStep(i)}
            className="group flex items-center gap-1.5"
          >
            <span
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-brand' : 'w-1.5 bg-foreground/15 group-hover:bg-foreground/30'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function Beat({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="absolute inset-4 sm:inset-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
      {children}
    </span>
  );
}

function LeadRow({ initials, name, note, dim }: { initials: string; name: string; note: string; dim?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 ${dim ? 'opacity-45' : ''}`}>
      <Avatar>{initials}</Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{note}</p>
      </div>
    </div>
  );
}

function ScorePill() {
  return (
    <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
      hot · 82
    </span>
  );
}

function DoneRow({ Icon, text }: { Icon: typeof CalendarCheck; text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-brand" />
      <span className="text-xs text-foreground/80">{text}</span>
    </div>
  );
}
