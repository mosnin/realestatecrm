'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, AlertTriangle, Clock, ArrowRight, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/formatting';
import type { Deal, DealStage } from '@/lib/types';
import { classifyForStrips, dealHealth } from '@/lib/deals/health';

interface PipelineSummaryProps {
  slug: string;
  pipelineId: string;
}

type StageWithDeals = DealStage & { deals: Deal[] };
type StripDeal = Pick<Deal, 'id' | 'title' | 'status' | 'updatedAt' | 'closeDate' | 'followUpAt' | 'value' | 'nextAction' | 'nextActionDueAt'>;

interface StripSpec {
  key: 'closing' | 'at-risk' | 'waiting';
  icon: typeof CalendarClock;
  title: string;
  subtitle: string;
  tintBg: string;
  tintText: string;
  deals: StripDeal[];
  emptyLabel: string;
  renderRowMeta: (d: StripDeal) => string;
}

/**
 * Attention strips above the kanban board. Replaces the old 6-stat summary.
 *
 * Goal: answer the realtor's three morning questions — "what's closing this
 * week," "what's sliding," and "what am I blocking." Every deal shown is a
 * click away, and the strip shows names, not sums.
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

  const { strips, activeCount, pipelineValue } = useMemo(() => {
    const allDeals: StripDeal[] = stages
      .flatMap((s) => s.deals ?? [])
      .map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
        updatedAt: d.updatedAt,
        closeDate: d.closeDate,
        followUpAt: d.followUpAt,
        value: d.value,
        nextAction: d.nextAction,
        nextActionDueAt: d.nextActionDueAt,
      }));

    const active = allDeals.filter((d) => d.status === 'active');
    const totalValue = active.reduce((s, d) => s + (typeof d.value === 'number' ? d.value : 0), 0);

    const { closingThisWeek, atRisk, waitingOnMe } = classifyForStrips(active);

    const closingValue = closingThisWeek.reduce((s, d) => s + (typeof d.value === 'number' ? d.value : 0), 0);

    const specs: StripSpec[] = [
      {
        key: 'closing',
        icon: CalendarClock,
        title: 'Closing this week',
        subtitle: closingThisWeek.length > 0
          ? `${closingThisWeek.length} deal${closingThisWeek.length === 1 ? '' : 's'} · ${formatCurrency(closingValue)}`
          : 'Next 7 days',
        tintBg: 'bg-amber-50 dark:bg-amber-500/10',
        tintText: 'text-amber-700 dark:text-amber-400',
        deals: closingThisWeek.slice(0, 5),
        emptyLabel: 'Nothing closing in the next 7 days.',
        renderRowMeta: (d) => {
          if (!d.closeDate) return '';
          const close = new Date(d.closeDate);
          return close.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        },
      },
      {
        key: 'at-risk',
        icon: AlertTriangle,
        title: 'At risk or stuck',
        subtitle: atRisk.length > 0
          ? `${atRisk.length} deal${atRisk.length === 1 ? '' : 's'} need attention`
          : 'Stage age & expected close',
        tintBg: 'bg-red-50 dark:bg-red-500/10',
        tintText: 'text-red-700 dark:text-red-400',
        deals: atRisk.slice(0, 5),
        emptyLabel: 'Every active deal is moving. Nice.',
        renderRowMeta: (d) => dealHealth(d).reason || '',
      },
      {
        key: 'waiting',
        icon: Clock,
        title: 'Waiting on me',
        subtitle: waitingOnMe.length > 0
          ? `${waitingOnMe.length} follow-up${waitingOnMe.length === 1 ? '' : 's'} overdue`
          : 'Overdue follow-ups',
        tintBg: 'bg-violet-50 dark:bg-violet-500/10',
        tintText: 'text-violet-700 dark:text-violet-400',
        deals: waitingOnMe.slice(0, 5),
        emptyLabel: 'No follow-ups overdue.',
        renderRowMeta: (d) => {
          if (!d.followUpAt) return '';
          const fu = new Date(d.followUpAt);
          const diffDays = Math.floor((Date.now() - fu.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays >= 1 ? `${diffDays} day${diffDays === 1 ? '' : 's'} overdue` : 'Overdue';
        },
      },
    ];

    return { strips: specs, activeCount: active.length, pipelineValue: totalValue };
  }, [stages]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="inline-flex items-center gap-1.5">
          <Briefcase size={12} />
          {activeCount} active {activeCount === 1 ? 'deal' : 'deals'}
        </span>
        {pipelineValue > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            {formatCurrency(pipelineValue)} in pipeline
          </span>
        )}
      </div>

      <div className={cn('grid gap-3 md:grid-cols-3', loading && 'opacity-60')}>
        {strips.map((strip) => (
          <AttentionStrip key={strip.key} slug={slug} {...strip} />
        ))}
      </div>
    </div>
  );
}

function AttentionStrip({
  slug,
  icon: Icon,
  title,
  subtitle,
  tintBg,
  tintText,
  deals,
  emptyLabel,
  renderRowMeta,
}: { slug: string } & StripSpec) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', tintBg, tintText)}>
          <Icon size={15} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="px-4 py-5 text-xs text-muted-foreground text-center">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-border">
          {deals.map((d) => {
            const meta = renderRowMeta(d);
            return (
              <li key={d.id}>
                <Link
                  href={`/s/${slug}/deals/${d.id}`}
                  className="group flex items-center gap-2 px-4 py-2.5 hover:bg-muted/30 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground truncate flex-1 min-w-0">{d.title}</span>
                  {meta && (
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">{meta}</span>
                  )}
                  <ArrowRight size={11} className="text-muted-foreground/40 group-hover:text-foreground transition-colors flex-shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
