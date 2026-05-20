/**
 * Usage — what Chippi has cost this realtor.
 *
 * One focal number: spend this month. Three time-window tiles below it.
 * A by-model table and a 30-day sparkline give the shape of the spend
 * without a chart library — every bar is a plain <div>.
 *
 * Honesty line: the spend shown is autonomous agent runs. Live chat-turn
 * cost isn't captured yet, so the caption says so — the realtor should
 * never wonder why the number looks low.
 *
 * Server component. All data is pre-aggregated in lib/usage/queries.ts;
 * this file only formats and lays out.
 */

import {
  BODY_MUTED,
  CAPTION,
  META,
  SECTION_LABEL,
  STAT_NUMBER,
  STAT_NUMBER_COMPACT,
} from '@/lib/typography';
import { cn } from '@/lib/utils';
import type { DailyUsage, ModelUsage } from '@/lib/usage/queries';

interface UsageSectionProps {
  /** Spend this calendar month. */
  monthTotalUsd: number;
  /** Spend last calendar month — for the delta. */
  lastMonthTotalUsd: number;
  /** Per-model breakdown for this month. */
  byModel: ModelUsage[];
  /** Per-day spend for the trailing 30 days, oldest first. */
  daily: DailyUsage[];
}

/* ─── Money formatting ─────────────────────────────────────────────────────── */

/**
 * Format a USD amount. Agentic spend lives in fractions of a cent, so a flat
 * 2-decimal format would render every real number as "$0.00". We keep enough
 * precision to show the realtor a true number without it looking like noise.
 */
function usd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount >= 0.0001) return `$${amount.toFixed(4)}`;
  return '<$0.0001';
}

export function UsageSection({
  monthTotalUsd,
  lastMonthTotalUsd,
  byModel,
  daily,
}: UsageSectionProps) {
  // Time-window slices off the daily series.
  const todayCost = daily.length > 0 ? daily[daily.length - 1].costUsd : 0;
  const todayReqs = daily.length > 0 ? daily[daily.length - 1].requests : 0;
  const weekSlice = daily.slice(-7);
  const weekCost = weekSlice.reduce((s, d) => s + d.costUsd, 0);
  const weekReqs = weekSlice.reduce((s, d) => s + d.requests, 0);
  const monthReqs = daily.reduce((s, d) => s + d.requests, 0);

  // Month-over-month delta.
  const hasLastMonth = lastMonthTotalUsd > 0;
  const deltaPct = hasLastMonth
    ? ((monthTotalUsd - lastMonthTotalUsd) / lastMonthTotalUsd) * 100
    : 0;
  const deltaLabel = !hasLastMonth
    ? 'First month of tracked usage.'
    : deltaPct === 0
      ? 'Flat vs last month.'
      : `${deltaPct > 0 ? 'Up' : 'Down'} ${Math.abs(deltaPct).toFixed(0)}% vs last month.`;

  // Nothing tracked at all — show the calm empty state and stop.
  const hasAnyUsage = monthTotalUsd > 0 || daily.some((d) => d.requests > 0);
  if (!hasAnyUsage) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Usage</h2>
          <p className={BODY_MUTED}>What Chippi has cost you.</p>
        </header>
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
          <p className={BODY_MUTED}>
            No agent runs yet — once Chippi starts working, your spend shows up here.
          </p>
        </div>
        <p className={CAPTION}>
          Usage reflects autonomous agent runs. Live chat-turn tracking arrives
          with the next model-provider update.
        </p>
      </div>
    );
  }

  // Share-bar scaling for the by-model table.
  const maxModelCost = byModel.reduce((m, r) => Math.max(m, r.costUsd), 0);
  // Sparkline scaling.
  const maxDayCost = daily.reduce((m, d) => Math.max(m, d.costUsd), 0);

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">Usage</h2>
        <p className={BODY_MUTED}>What Chippi has cost you.</p>
      </header>

      {/* Focal: spend this month + delta. */}
      <div className="space-y-1">
        <p className={SECTION_LABEL}>This month</p>
        <p className={STAT_NUMBER} style={{ fontFamily: 'var(--font-title)' }}>
          {usd(monthTotalUsd)}
        </p>
        <p className={CAPTION}>{deltaLabel}</p>
      </div>

      {/* Three time-window tiles. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70">
        <StatTile label="Today" cost={todayCost} requests={todayReqs} />
        <StatTile label="This week" cost={weekCost} requests={weekReqs} />
        <StatTile label="This month" cost={monthTotalUsd} requests={monthReqs} />
      </div>

      {/* 30-day daily sparkline. */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>Last 30 days</p>
        <div className="flex h-16 items-end gap-px" aria-hidden="true">
          {daily.map((d) => {
            const pct = maxDayCost > 0 ? (d.costUsd / maxDayCost) * 100 : 0;
            return (
              <div
                key={d.day}
                className="flex-1 rounded-sm bg-foreground/10"
                style={{ height: `${Math.max(pct, d.requests > 0 ? 6 : 2)}%` }}
                title={`${d.day} — ${usd(d.costUsd)}, ${d.requests} ${
                  d.requests === 1 ? 'run' : 'runs'
                }`}
              />
            );
          })}
        </div>
        <div className="flex justify-between">
          <span className={META}>{daily[0]?.day ?? ''}</span>
          <span className={META}>{daily[daily.length - 1]?.day ?? ''}</span>
        </div>
      </section>

      {/* By-model table. */}
      <section className="space-y-3">
        <p className={SECTION_LABEL}>By model</p>
        {byModel.length === 0 ? (
          <p className={BODY_MUTED}>
            No planner activity this month — model breakdown shows up once
            Chippi plans a multi-step task.
          </p>
        ) : (
          <div className="space-y-px">
            {/* Column header */}
            <div className="flex items-center gap-3 pb-1">
              <span className={cn(CAPTION, 'flex-1')}>Model</span>
              <span className={cn(CAPTION, 'w-20 text-right tabular-nums')}>
                Requests
              </span>
              <span className={cn(CAPTION, 'w-24 text-right tabular-nums')}>Cost</span>
            </div>
            {byModel.map((row) => {
              const pct = maxModelCost > 0 ? (row.costUsd / maxModelCost) * 100 : 0;
              return (
                <div
                  key={row.model}
                  className="relative flex items-center gap-3 border-t border-border/60 py-2.5"
                >
                  {/* CSS-only share bar — washed background, no library. */}
                  <div
                    className="absolute inset-y-0 left-0 -z-0 rounded-sm bg-foreground/[0.04]"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative flex-1 truncate text-sm text-foreground">
                    {row.model}
                  </span>
                  <span className="relative w-20 text-right text-sm tabular-nums text-muted-foreground">
                    {row.requests}
                  </span>
                  <span className="relative w-24 text-right text-sm tabular-nums text-foreground">
                    {usd(row.costUsd)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Honesty line — Jobs lens: the realtor should never wonder why the
          number looks low. Say plainly what is and isn't counted. */}
      <p className={CAPTION}>
        Usage reflects autonomous agent runs — planning and tool steps Chippi
        takes on your behalf. Live chat-turn tracking arrives with the next
        model-provider update.
      </p>
    </div>
  );
}

/* ─── Stat tile ────────────────────────────────────────────────────────────── */

function StatTile({
  label,
  cost,
  requests,
}: {
  label: string;
  cost: number;
  requests: number;
}) {
  return (
    <div className="bg-background px-4 py-4">
      <p className={SECTION_LABEL}>{label}</p>
      <p className={cn(STAT_NUMBER_COMPACT, 'mt-1')}>{usd(cost)}</p>
      <p className={cn(META, 'mt-0.5')}>
        {requests} {requests === 1 ? 'run' : 'runs'}
      </p>
    </div>
  );
}
