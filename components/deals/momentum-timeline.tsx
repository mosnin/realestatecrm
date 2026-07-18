'use client';

/**
 * Deal momentum timeline — a compact surface-card read of "is this deal
 * losing steam, and why". Pure CSS bands + a tiny bar sparkline, no chart
 * library, in the existing surface-card language (components/ui/surface-card).
 *
 * Honest by construction: renders nothing when `computeMomentum` (lib/deals/
 * momentum.ts) found fewer than 3 logged events for the deal — there isn't
 * enough history yet to say anything true about momentum, so we say nothing
 * rather than dress up a sparse deal as a trend. When the space has no
 * closed-won history yet, the per-stage baseline is openly labeled as
 * unavailable instead of a fabricated number.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SurfaceCard, SurfaceCardHeader, StatusPill, DATA_ACCENT_HEX } from '@/components/ui/surface-card';
import { EASE_APPLE } from '@/lib/motion';
import type { DealMomentum, MomentumVerdict } from '@/lib/deals/momentum';

const VERDICT_META: Record<MomentumVerdict, { label: string; dotClass: string; textClass: string }> = {
  accelerating: {
    label: 'Accelerating',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  steady: {
    label: 'Steady',
    dotClass: 'bg-muted-foreground/50',
    textClass: 'text-muted-foreground',
  },
  stalling: {
    label: 'Stalling',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
};

/** Trailing weeks shown in the sparkline — keeps the card compact even for a year-old deal. */
const MAX_TICKS = 16;

export function MomentumTimeline({ momentum }: { momentum: DealMomentum | null }) {
  const reduceMotion = useReducedMotion();

  // Honest empty state: too little history to say anything real. Also guards
  // the (should-never-happen) case of zero reconstructed stage segments.
  if (!momentum || momentum.eventCount < 3 || momentum.stages.length === 0) return null;

  const { stages, activityByWeek, verdict, reason, baselineUnavailable } = momentum;
  const meta = VERDICT_META[verdict];

  const totalDwell = stages.reduce((sum, s) => sum + Math.max(s.dwellDays, 0.1), 0);
  const ticks = activityByWeek.slice(-MAX_TICKS);
  const maxCount = Math.max(1, ...ticks.map((t) => t.count));
  const hasAnyTicks = ticks.some((t) => t.count > 0);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE_APPLE }}
    >
      <SurfaceCard className="space-y-4">
        <SurfaceCardHeader
          title="Momentum"
          action={
            <StatusPill className={cn('gap-1.5', meta.textClass)}>
              <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} />
              {meta.label}
            </StatusPill>
          }
        />

        <p className="text-sm text-foreground">{reason}</p>

        {/* Stage bands — width proportional to dwell, current stage in the
            data accent (or amber when it's over baseline), past stages
            muted. */}
        <div className="space-y-1.5">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={stages
              .map(
                (s) =>
                  `${s.stageName}: ${Math.round(s.dwellDays)} days${
                    s.baselineDays != null ? ` (usual ${Math.round(s.baselineDays)} days)` : ''
                  }`,
              )
              .join(', ')}
          >
            {stages.map((s, i) => {
              const widthPct = (Math.max(s.dwellDays, 0.1) / totalDwell) * 100;
              const overBaseline = s.baselineDays != null && s.dwellDays > s.baselineDays * 1.5;
              return (
                <span
                  key={`${s.stageId}-${i}`}
                  title={`${s.stageName} — ${Math.round(s.dwellDays)}d${
                    s.baselineDays != null ? ` (usual ${Math.round(s.baselineDays)}d)` : ''
                  }`}
                  className={cn(
                    'h-full first:rounded-l-full last:rounded-r-full',
                    i > 0 && 'border-l border-background/70',
                    !s.current && 'bg-foreground/25',
                    s.current && overBaseline && 'bg-amber-500',
                  )}
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: s.current && !overBaseline ? DATA_ACCENT_HEX : undefined,
                  }}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {stages.map((s, i) => (
              <span key={`${s.stageId}-label-${i}`} className={cn(s.current && 'font-medium text-foreground')}>
                {s.stageName} · {Math.round(s.dwellDays)}d
                {s.baselineDays != null && (
                  <span className="text-muted-foreground/70"> (usual {Math.round(s.baselineDays)}d)</span>
                )}
              </span>
            ))}
          </div>
          {baselineUnavailable && (
            <p className="text-[11px] text-muted-foreground/70">
              Not enough closed deals yet in this space to show a usual-pace comparison.
            </p>
          )}
        </div>

        {/* Activity ticks — one bar per week, height proportional to that
            week's logged events. Pure CSS, no chart library. */}
        {hasAnyTicks && (
          <div className="flex h-8 items-end gap-[3px]">
            {ticks.map((t) => (
              <span
                key={t.weekStart}
                title={`Week of ${t.weekStart}: ${t.count} ${t.count === 1 ? 'event' : 'events'}`}
                className={cn('flex-1 rounded-sm', t.count > 0 ? 'bg-foreground/40' : 'bg-muted')}
                style={{ height: `${Math.max(8, (t.count / maxCount) * 100)}%` }}
              />
            ))}
          </div>
        )}
      </SurfaceCard>
    </motion.div>
  );
}
