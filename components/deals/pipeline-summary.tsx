'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/formatting';
import type { Deal, DealStage } from '@/lib/types';
import { dealHealth } from '@/lib/deals/health';
import { AnimatedNumber } from '@/components/motion/animated-number';
import {
  STAT_NUMBER_COMPACT,
  TITLE_FONT,
  BODY,
  SECTION_LABEL,
} from '@/lib/typography';

interface PipelineSummaryProps {
  slug: string;
  pipelineId: string;
}

type StageWithDeals = DealStage & { deals: Deal[] };

interface PipelineStats {
  active: number;
  closingThisMonth: number;
  closingThisMonthValue: number;
  atRisk: number;
  wonThisMonth: number;
  wonThisMonthValue: number;
  /** A short Chippi narration that names the most-pressing fact. */
  narration: string;
}

/**
 * Stat strip above the pipeline board.
 *
 * Answers the realtor's morning question — "what's actually moving, what's
 * stuck, and what closes this month?" — in four cells. Each cell is a focal
 * serif number plus a label and sub. Cells share a hairline grid; numbers
 * count up via AnimatedNumber.
 */
export function PipelineSummary({ slug, pipelineId }: PipelineSummaryProps) {
  const [stages, setStages] = useState<StageWithDeals[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/stages?slug=${encodeURIComponent(slug)}&pipelineId=${encodeURIComponent(pipelineId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setStages([]);
          return;
        }
        const data: StageWithDeals[] = await res.json();
        if (!cancelled) setStages(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setStages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, pipelineId]);

  const stats: PipelineStats = useMemo(() => {
    const allDeals = stages.flatMap((s) => s.deals ?? []);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    let active = 0;
    let closingThisMonth = 0;
    let closingThisMonthValue = 0;
    let atRisk = 0;
    let wonThisMonth = 0;
    let wonThisMonthValue = 0;

    // Track the most-pressing line for the narration.
    let stuckCount = 0;
    let stuckMaxDays = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekOut = new Date(today);
    weekOut.setDate(weekOut.getDate() + 7);
    let closingThisWeek = 0;

    for (const d of allDeals) {
      const status = (d.status ?? 'active') as 'active' | 'won' | 'lost' | 'on_hold';
      const value = typeof d.value === 'number' ? d.value : 0;

      if (status === 'active') {
        active += 1;
        const close = d.closeDate ? new Date(d.closeDate as unknown as string) : null;
        if (close && !isNaN(close.getTime())) {
          if (close >= monthStart && close < monthEnd) {
            closingThisMonth += 1;
            closingThisMonthValue += value;
          }
          if (close >= today && close <= weekOut) {
            closingThisWeek += 1;
          }
        }
        const health = dealHealth(d);
        if (health.state !== 'on-track') {
          atRisk += 1;
          if (health.state === 'stuck') {
            stuckCount += 1;
            // Try to extract day count for the narration.
            const m = health.reason.match(/(\d+)\s+days?/);
            if (m) stuckMaxDays = Math.max(stuckMaxDays, parseInt(m[1], 10));
          }
        }
      } else if (status === 'won') {
        // closeDate or updatedAt — closeDate first; fall back to updatedAt.
        const ref = d.closeDate
          ? new Date(d.closeDate as unknown as string)
          : d.updatedAt
            ? new Date(d.updatedAt as unknown as string)
            : null;
        if (ref && !isNaN(ref.getTime()) && ref >= monthStart && ref < monthEnd) {
          wonThisMonth += 1;
          wonThisMonthValue += value;
        }
      }
    }

    // Compose Chippi's one-line narration. Pick the most-pressing fact.
    let narration = '';
    if (stuckCount > 0) {
      if (stuckCount === 1) {
        narration = stuckMaxDays > 0
          ? `1 deal hasn't moved in ${stuckMaxDays} days. Take a look.`
          : "1 deal is stuck. Take a look.";
      } else {
        narration = `${stuckCount} deals are stuck — they need a nudge.`;
      }
    } else if (closingThisWeek > 0) {
      narration =
        closingThisWeek === 1
          ? '1 deal is closing this week.'
          : `${closingThisWeek} deals are closing this week.`;
    } else if (closingThisMonth > 0) {
      narration =
        closingThisMonth === 1
          ? '1 deal closes this month. Keep it on track.'
          : `${closingThisMonth} deals close this month. Keep them on track.`;
    } else if (active === 0 && wonThisMonth === 0) {
      narration = 'Nothing in flight. Add a deal to get started.';
    } else {
      narration = active === 1 ? '1 active deal. Steady.' : `${active} active deals. Steady.`;
    }

    return {
      active,
      closingThisMonth,
      closingThisMonthValue,
      atRisk,
      wonThisMonth,
      wonThisMonthValue,
      narration,
    };
  }, [stages]);

  return (
    <div className="space-y-4">
      {/* Brand-voice narration line — the page's one sentence. */}
      <p
        className={cn(
          'text-lg text-muted-foreground',
          loading && 'opacity-60',
        )}
        style={TITLE_FONT}
      >
        {loading ? ' ' : stats.narration}
      </p>

      {/* 4-cell stat strip — paper-flat, hairline-divided */}
      <div
        className={cn(
          'grid grid-cols-2 md:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70',
          loading && 'opacity-60',
        )}
      >
        <StatCell
          number={<AnimatedNumber value={stats.active} />}
          label="Active deals"
          sub={stats.active === 1 ? 'in flight' : 'in flight'}
        />
        <StatCell
          number={<AnimatedNumber value={stats.closingThisMonth} />}
          label="Closing this month"
          sub={
            stats.closingThisMonth > 0
              ? `${formatCompact(stats.closingThisMonthValue)} on the line`
              : 'no close dates this month'
          }
        />
        <StatCell
          number={<AnimatedNumber value={stats.atRisk} />}
          label="At risk"
          sub={stats.atRisk > 0 ? 'need attention' : 'all moving'}
          dim={stats.atRisk === 0}
        />
        <StatCell
          number={<AnimatedNumber value={stats.wonThisMonth} />}
          label="Won this month"
          sub={
            stats.wonThisMonth > 0
              ? `${formatCompact(stats.wonThisMonthValue)} closed`
              : 'nothing closed yet'
          }
        />
      </div>
    </div>
  );
}

function StatCell({
  number,
  label,
  sub,
  dim,
}: {
  number: React.ReactNode;
  label: string;
  sub: string;
  dim?: boolean;
}) {
  return (
    <div className="bg-background p-5">
      <p
        className={cn(
          STAT_NUMBER_COMPACT,
          'leading-none',
          dim && 'text-muted-foreground',
        )}
        style={TITLE_FONT}
      >
        {number}
      </p>
      <p className={cn(BODY, 'mt-2')}>{label}</p>
      <p className={cn(SECTION_LABEL, 'mt-1 normal-case tracking-normal text-[11px]')}>
        {sub}
      </p>
    </div>
  );
}
