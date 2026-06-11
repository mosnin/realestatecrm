'use client';

/**
 * PipelineBoard — an animate-on-scroll kanban that shows Chippi advancing a
 * deal through the stages on its own. Calm-system vocabulary; the "moved by
 * Chippi" card lands with a brand highlight. Reduced motion: composed, still.
 */

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { EASE_OUT } from '@/lib/motion';

type Card = { name: string; val: string; moved?: boolean };
const COLUMNS: { label: string; tone: string; cards: Card[] }[] = [
  { label: 'New', tone: 'text-muted-foreground', cards: [{ name: 'Dana Lee', val: '$640K' }, { name: 'Priya N.', val: '$1.1M' }] },
  { label: 'Touring', tone: 'text-brand', cards: [{ name: 'Maya Patel', val: '$1.2M', moved: true }, { name: 'Eli Vance', val: '$815K' }] },
  { label: 'Offer', tone: 'text-amber-600 dark:text-amber-400', cards: [{ name: 'Sara Voss', val: '$2.4M' }] },
  { label: 'Closing', tone: 'text-emerald-600 dark:text-emerald-400', cards: [{ name: 'Bernard Ng', val: '$890K' }] },
];

export function PipelineBoard() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduce = useReducedMotion();
  const lit = Boolean(reduce) || inView;

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-foreground/[0.08] ring-1 ring-inset ring-white/5">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-brand text-[9px] font-bold text-brand-foreground">C</span>
          Pipeline · Chippi keeps it current
        </span>
        <span className="text-[11px] text-muted-foreground">4 stages · live</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {COLUMNS.map((col, ci) => (
          <div key={col.label}>
            <div className="flex items-center justify-between px-0.5 pb-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${col.tone}`}>{col.label}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">{col.cards.length}</span>
            </div>
            <div className="space-y-2">
              {col.cards.map((card, ri) => (
                <motion.div
                  key={card.name}
                  initial={reduce ? false : card.moved ? { opacity: 0, x: -28, scale: 0.95 } : { opacity: 0, y: 8 }}
                  animate={lit ? { opacity: 1, x: 0, y: 0, scale: 1 } : {}}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: card.moved ? 0.6 : 0.08 * ci + 0.05 * ri }}
                  className={`rounded-xl border px-3 py-2.5 ${card.moved ? 'border-brand/40 bg-brand-subtle' : 'border-border/60 bg-muted/20'}`}
                >
                  <p className="truncate text-sm font-medium text-foreground">{card.name}</p>
                  <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">{card.val}</p>
                  {card.moved && (
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-brand">
                      <ArrowUpRight className="h-3 w-3" /> Advanced by Chippi
                    </p>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
