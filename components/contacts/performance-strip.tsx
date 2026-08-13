import {
  avgTimeToCloseDays,
  conversionRate,
  stageBottlenecks,
  type DealMetricRow,
  type StageMetricRow,
} from '@/lib/deal-metrics';
import { SECTION_LABEL } from '@/lib/typography';
import { countLabel } from '@/lib/formatting';
import { StaggerReveal } from '@/components/motion';
import { DASHBOARD_SURFACE } from '@/components/ui/surface-card';

/**
 * Realtor performance strip — the three pipeline numbers that move output:
 * average time-to-close, conversion rate, and where deals stall (the current
 * bottleneck stage). Pure presentation over already-fetched rows; the page
 * owns the (read-only) query and hands the math to lib/deal-metrics.ts.
 *
 * One quiet paper summary with hairline-divided cells. Focal numbers wear the
 * product's serif data voice. When a metric has no data, the cell renders a
 * calm fact rather than a misleading 0 — every metric function returns null
 * in that case, by design.
 */
export function PerformanceStrip({
  deals,
  stages,
  now,
  unavailable = false,
}: {
  deals: DealMetricRow[];
  stages: StageMetricRow[];
  now?: Date;
  unavailable?: boolean;
}) {
  const avgDays = avgTimeToCloseDays(deals);
  const conversion = conversionRate(deals);
  const bottleneck = stageBottlenecks(deals, stages, now).worstStage;

  return (
    <section
      aria-label="Pipeline performance"
      data-contact-summary="pipeline-performance"
      className={`${DASHBOARD_SURFACE} overflow-hidden`}
    >
      <StaggerReveal className="grid grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Cell label="Avg time to close">
          {unavailable ? (
            <Empty>metrics unavailable right now.</Empty>
          ) : avgDays === null ? (
            <Empty>not enough closed deals yet.</Empty>
          ) : (
            <Stat suffix={Math.round(avgDays) === 1 ? 'day' : 'days'}>{Math.round(avgDays)}</Stat>
          )}
        </Cell>

        <Cell label="Conversion rate">
          {unavailable ? (
            <Empty>metrics unavailable right now.</Empty>
          ) : conversion === null ? (
            <Empty>nothing has closed yet.</Empty>
          ) : (
            <Stat suffix="won">{Math.round(conversion * 100)}%</Stat>
          )}
        </Cell>

        <Cell label="Biggest bottleneck">
          {unavailable ? (
            <Empty>metrics unavailable right now.</Empty>
          ) : bottleneck === null ? (
            <Empty>no active deals to stall.</Empty>
          ) : (
            <div className="space-y-1">
              <p
                className="truncate text-[21px] leading-tight tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-title)' }}
                title={bottleneck.stageName}
              >
                {bottleneck.stageName}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {countLabel(bottleneck.count, 'deal')} · {Math.round(bottleneck.avgAgeDays)} day avg
              </p>
            </div>
          )}
        </Cell>
      </StaggerReveal>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6 lg:px-8">
      <p className={SECTION_LABEL}>{label}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Focal stat number — serif Times, the type scale&rsquo;s loud note. */
function Stat({ children, suffix }: { children: React.ReactNode; suffix?: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className="text-[2.35rem] leading-none tracking-[-0.04em] text-foreground tabular-nums"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        {children}
      </span>
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </p>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[13rem] text-sm leading-relaxed text-muted-foreground">{children}</p>;
}
