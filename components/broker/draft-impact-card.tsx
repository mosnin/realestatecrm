'use client';

import type { DraftStats } from '@/lib/draft-stats';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { AccentBarLabel, SURFACE_CARD } from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

/**
 * "Draft impact" — single card on the broker dashboard. Reports how Chippi's
 * drafts landed across the brokerage over the trailing 30 days.
 *
 * Three lines, in this order:
 *   1. Headline: 30-day approval rate. "X of N drafts went out."
 *   2. Secondary: outcome rate, or "Not enough data yet" until the cron has
 *      labelled some sent drafts.
 *   3. Caveat: plain-English correlation note. Omitted in the no-outcome state.
 *
 * Empty state (total === 0): one sentence, no numbers, no skeleton.
 *
 * The math lives in `lib/draft-stats.ts`; this file only renders. The focal
 * approval percentage counts up on entry via the shared AnimatedNumber (a
 * client island; honors prefers-reduced-motion), matching the brief's other
 * stat surfaces. No data, copy, or number changes — the count-up lands on the
 * exact figure the server computed.
 */
export function DraftImpactCard({ stats }: { stats: DraftStats }) {
  return (
    <section className={cn(SURFACE_CARD, 'p-5 sm:p-6 space-y-1.5')}>
      <AccentBarLabel>Draft impact</AccentBarLabel>
      <DraftImpactBody stats={stats} />
    </section>
  );
}

function DraftImpactBody({ stats }: { stats: DraftStats }) {
  // The empty surface is one sentence. No skeleton, no muted placeholder card,
  // nothing for the broker to misread as "Chippi is broken."
  if (stats.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">No drafts in the last 30 days.</p>
    );
  }

  const sent = stats.approved + stats.editedAndApproved;
  const approvalPct = Math.round(stats.approvalRate * 100);
  const outcomePct = Math.round(stats.outcomeAdvancedRate * 100);
  const hasOutcome = stats.outcomeCheckedCount > 0;

  return (
    <>
      <p
        className="text-3xl tracking-tight tabular-nums text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        <AnimatedNumber value={approvalPct} format={(n) => `${Math.round(n)}%`} />
      </p>
      <p className="text-sm text-muted-foreground tabular-nums">
        {sent} of {stats.total} drafts went out.
      </p>
      <p className="text-sm text-foreground">
        {hasOutcome ? (
          <>
            <span className="tabular-nums">{outcomePct}%</span> of sent drafts moved their
            deal within 7 days.
          </>
        ) : (
          <span className="text-muted-foreground">Not enough data yet.</span>
        )}
      </p>
      {hasOutcome && (
        <p className="text-xs text-muted-foreground">
          Correlation only — the deal moved after the draft sent. Chippi didn&apos;t
          necessarily cause it.
        </p>
      )}
    </>
  );
}
