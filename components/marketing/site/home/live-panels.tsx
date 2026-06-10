'use client';

/**
 * Live product panels for the home feature rows — the antidote to placeholder
 * gray boxes. Each panel is a self-contained, animate-on-scroll mock built from
 * the product's real card/row/pill vocabulary: the inbox scores a lead, Chippi
 * types a reply, the tour books and the pipeline updates. They come alive when
 * they enter the viewport (once), and render composed for reduced-motion.
 */

import { useRef, useState, useEffect } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Check, CheckCheck, CalendarCheck, ArrowUpRight, MessageCircle } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

const PANEL = 'h-[300px] bg-background p-4 sm:h-[340px] sm:p-5';

function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground/70">
      {children}
    </span>
  );
}

/* ── Inbox: a lead is scored and lifted to the top ─────────────────────────── */

const TONES: Record<string, string> = {
  hot: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  warm: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  cold: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400',
};

export function InboxPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();
  const lit = reduce || inView;

  const rows = [
    { initials: 'MP', name: 'Maya Patel', note: 'buyer · 14 Oak St', score: 'hot · 82', tone: 'hot', highlight: true },
    { initials: 'TR', name: 'Tom Reyes', note: 'refi question', score: 'warm · 64', tone: 'warm' },
    { initials: 'DL', name: 'Dana Lee', note: 'just browsing', score: 'cold · 41', tone: 'cold' },
  ];

  return (
    <div ref={ref} className={PANEL}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inbox · scored against your deals</p>
      <div className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <motion.div
            key={r.name}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={lit ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.12 * i }}
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
      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <motion.div
            className="h-full rounded-full bg-brand"
            initial={{ width: reduce ? '82%' : 0 }}
            animate={lit ? { width: '82%' } : {}}
            transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.5 }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-brand">Chippi</span> ranked your inbox — Maya first.
        </p>
      </div>
    </div>
  );
}

/* ── Reply: Chippi types the draft in your voice ───────────────────────────── */

const DRAFT =
  'Hi Maya — thanks for reaching out about 14 Oak. It’s still available, and I have Saturday at 2:00 open if you’d like to see it in person.';

export function DraftPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setTyped(DRAFT); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(DRAFT.slice(0, i));
      if (i >= DRAFT.length) clearInterval(id);
    }, 26);
    return () => clearInterval(id);
  }, [inView, reduce]);

  const done = typed.length >= DRAFT.length;

  return (
    <div ref={ref} className={PANEL}>
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
    </div>
  );
}

/* ── Calendar & pipeline: the tour books and the board updates ─────────────── */

export function CalendarPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduce = useReducedMotion();
  const lit = reduce || inView;

  const rows = [
    { Icon: CalendarCheck, text: 'Saturday · 2:00 PM — 14 Oak St' },
    { Icon: ArrowUpRight, text: 'Maya Patel → Touring' },
    { Icon: CheckCheck, text: 'Confirmation sent · written to the deal' },
  ];

  return (
    <div ref={ref} className={`${PANEL} flex flex-col`}>
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.92 }}
        animate={lit ? { opacity: 1, scale: 1 } : {}}
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
            animate={lit ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.18 + 0.12 * i }}
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
