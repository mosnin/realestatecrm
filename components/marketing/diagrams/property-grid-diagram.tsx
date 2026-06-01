'use client';

/**
 * `<PropertyGridDiagram />` — the listing register, current.
 *
 * One beat: a grid of paper-flat listing cards (address, price in serif
 * Times, a neutral status pill). One card's status crosses from Active to
 * In contract — a calm fade-swap of the pill label/icon, the price held
 * dead still beneath it. Then it resets. The pitch in one breath: the
 * listings track their own state; the realtor just watches it stay right.
 *
 * Status pills are deliberately NEUTRAL (hairline, muted) — the real
 * product (`property-status-badge.tsx`) treats listing status as metadata,
 * not signal. A property going "In contract" doesn't ask the realtor to do
 * anything; it's a fact. So no tone tints, no brand orange — the swap reads
 * through the icon + label, in calm.
 *
 * Motion contract:
 *   - ~5.9s cycle.
 *   - 1.6s hold on the all-current grid.
 *   - The 415 Lexington pill cross-swaps Active → In contract: old label
 *     fades out, new label fades in (AnimatePresence, 200ms EASE_APPLE).
 *     The price never moves.
 *   - 3.6s hold on the new state.
 *   - Pill fades back, 700ms pause, restart.
 *
 * Reduced-motion: render the END state — 415 Lexington reads "In contract".
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CircleDot, Clock, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  ChippiDiagramShell,
  useDiagramMotion,
} from './chippi-diagram-shell';

interface PropertyGridDiagramProps {
  aspect?: 'video' | 'square' | 'wide' | 'tall';
  className?: string;
}

type Status = 'active' | 'in_contract' | 'closed';

interface Listing {
  id: string;
  address: string;
  price: string;
  status: Status;
}

// The static register. 415 Lexington is the one that moves; the rest hold.
const LISTINGS: Listing[] = [
  { id: 'lexington', address: '415 Lexington Ave', price: '$475,000', status: 'active' },
  { id: 'harbor', address: '88 Harbor View', price: '$1.2M', status: 'active' },
  { id: 'elm', address: '22 Elm St', price: '$640,000', status: 'in_contract' },
  { id: 'maple', address: '9 Maple Ct', price: '$390,000', status: 'closed' },
];

const STATUS_META: Record<
  Status,
  { label: string; Icon: typeof CircleDot; tone: string }
> = {
  // Active — foreground-subtle: the listing is live, the most "present" state.
  active: {
    label: 'Active',
    Icon: CircleDot,
    tone: 'border-border/70 bg-foreground/[0.04] text-foreground/80',
  },
  // In contract — a half-step warmer in weight, still neutral. Reads as
  // "moving" without reaching for a tone tint the product reserves for action.
  in_contract: {
    label: 'In contract',
    Icon: Clock,
    tone: 'border-border/70 bg-foreground/[0.06] text-foreground',
  },
  // Closed — muted, receded: the work is done, the row is quiet.
  closed: {
    label: 'Closed',
    Icon: Check,
    tone: 'border-border/60 bg-muted text-muted-foreground',
  },
};

const SWAP_TO_CONTRACT_AT = 1600;
const SWAP_BACK_AT = 5200;
const CYCLE_TOTAL = 5900;

function StatusPill({ status }: { status: Status }) {
  const { label, Icon, tone } = STATUS_META[status];
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={status}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE_APPLE }}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
          'text-[11px] font-medium leading-none whitespace-nowrap',
          tone,
        )}
      >
        <Icon size={11} aria-hidden className="flex-shrink-0" />
        {label}
      </motion.span>
    </AnimatePresence>
  );
}

function ListingCard({
  address,
  price,
  status,
}: {
  address: string;
  price: string;
  status: Status;
}) {
  return (
    <div className="flex flex-col min-h-0 rounded-xl border border-border/70 bg-card p-3 overflow-hidden">
      {/* Address — quiet, truncates. */}
      <p className="text-[13px] font-medium leading-tight text-foreground truncate">
        {address}
      </p>
      {/* Price — the focal number, serif Times, held still through the swap. */}
      <p
        className="mt-1.5 text-[19px] tabular-nums tracking-tight text-foreground leading-none"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {price}
      </p>
      {/* Status pill — pinned to the bottom so cards align on a baseline. */}
      <div className="mt-auto pt-2.5">
        <StatusPill status={status} />
      </div>
    </div>
  );
}

export function PropertyGridDiagram({
  aspect = 'square',
  className,
}: PropertyGridDiagramProps) {
  return (
    <ChippiDiagramShell aspect={aspect} pad={6} className={className}>
      <PropertyGridContent />
    </ChippiDiagramShell>
  );
}

function PropertyGridContent() {
  const { reduced } = useDiagramMotion();
  // false = Lexington is Active (start), true = Lexington is In contract.
  const [advanced, setAdvanced] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function runCycle() {
      timers.push(setTimeout(() => !cancelled && setAdvanced(true), SWAP_TO_CONTRACT_AT));
      timers.push(setTimeout(() => !cancelled && setAdvanced(false), SWAP_BACK_AT));
      timers.push(setTimeout(() => !cancelled && runCycle(), CYCLE_TOTAL));
    }
    runCycle();
    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
    };
  }, [reduced]);

  return (
    <div className="w-full h-full flex flex-col min-h-0">
      {/* Quiet header — the status-sentence vocabulary, condensed. */}
      <div className="pb-3 flex-shrink-0">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Properties
        </p>
        <p
          className="mt-1 text-[18px] tracking-tight text-foreground leading-snug"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Your listings, current
        </p>
      </div>

      {/* The grid — 2×2 cells that fill the available space. flex-1 + min-h-0
          so the cards distribute height; never sums taller than the box. */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2.5 min-h-0">
        {LISTINGS.map((l) => {
          const status: Status =
            l.id === 'lexington' && advanced ? 'in_contract' : l.status;
          return (
            <ListingCard
              key={l.id}
              address={l.address}
              price={l.price}
              status={status}
            />
          );
        })}
      </div>
    </div>
  );
}
