'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, Zap } from 'lucide-react';
import { countLabel, pluralize } from '@/lib/formatting';
import {
  SPEED_TO_LEAD_WINDOW_DAYS,
  formatSpeedToLead,
  meaningfulSpeedToLead,
} from '@/lib/analytics/speed-to-lead';
import {
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  InsightStrip,
  formatCurrency,
  PAPER_GRID,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { OverviewData } from '@/lib/analytics-data';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingWorkArea,
} from '@/app/s/[slug]/_components/supporting-page';

const leadsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsConfig = {
  count: { label: 'Deals', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

export function OverviewView({ data, slug }: { data: OverviewData; slug: string }) {
  // Honest month-over-month read for the insight strip: only when BOTH the
  // current and previous month have real submissions — no fabricated trends.
  const series = data.leadsOverTime;
  const last = series.length >= 2 ? series[series.length - 1] : null;
  const prev = series.length >= 2 ? series[series.length - 2] : null;
  const leadsDeltaPct =
    last && prev && prev.count > 0 && last.count > 0
      ? Math.round(((last.count - prev.count) / prev.count) * 100)
      : null;

  // Speed to lead: shown only when it clears the honest-display bar
  // (>= 3 leads reached in the window — no fake precision from 1-2 samples).
  const speed = meaningfulSpeedToLead(data.speedToLead);

  const statusSentence = data.totalContacts > 0
    ? `${countLabel(data.totalContacts, 'person', 'people')} in your book, ${data.totalDeals} active ${pluralize(data.totalDeals, 'deal')}.`
    : 'No data yet. Start by adding your first contact.';
  const nextAction = data.totalLeads > 0
    ? `Review the newest ${pluralize(data.totalLeads, 'lead')} and move the strongest opportunity forward.`
    : 'Add your first person so Chippi can begin measuring response and conversion.';

  return (
    <div className="space-y-0">
      <SupportingOrientation
        family="intelligence"
        eyebrow="Analytics / Overview"
        title="Where momentum is building"
        summary={statusSentence}
        nextAction={nextAction}
        action={
          <>
            <SupportingActionLink href={`/s/${slug}/contacts`}>Review people</SupportingActionLink>
            <SupportingActionLink href={`/s/${slug}/deals`} quiet>Open pipeline</SupportingActionLink>
          </>
        }
      />

      <SupportingMetricBand className={speed ? 'lg:grid-cols-5' : undefined}>
        <SupportingMetric label="New people" value={data.totalLeads} detail="all time" />
        <SupportingMetric label="Total people" value={data.totalContacts} detail="in your book" />
        <SupportingMetric label="Active deals" value={data.totalDeals} detail="moving now" />
        {speed && (
          <SupportingMetric
            label="Speed to lead"
            value={formatSpeedToLead(speed.medianMinutes)}
            detail={`median · p90 ${formatSpeedToLead(speed.p90Minutes)} · ${SPEED_TO_LEAD_WINDOW_DAYS} days`}
          />
        )}
        <SupportingMetric
          label="Pipeline value"
          value={formatCurrency(data.totalPipelineValue)}
          detail="combined"
          accent
        />
      </SupportingMetricBand>

      <SupportingWorkArea className="space-y-8">
      {/* Honest computed read: how often Chippi's instant first-touch draft
          was the lead's actual first touch. Hidden unless it happened. */}
      {speed && speed.chippiFirstCount > 0 && (
        <InsightStrip icon={<Zap size={14} aria-hidden />}>
          Chippi sent the first touch on {speed.chippiFirstCount} of{' '}
          {countLabel(speed.touchedCount, 'new lead')} reached in the last{' '}
          {SPEED_TO_LEAD_WINDOW_DAYS} days
        </InsightStrip>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection
          title="Leads over time"
          sub="Applications submitted per month"
          index={0}
          insight={
            leadsDeltaPct !== null && leadsDeltaPct !== 0 ? (
              <InsightStrip icon={<TrendingUp size={14} aria-hidden />}>
                Leads {leadsDeltaPct > 0 ? 'increased' : 'decreased'} by{' '}
                {Math.abs(leadsDeltaPct)}% vs last month
              </InsightStrip>
            ) : undefined
          }
        >
          <ChartContainer config={leadsConfig} className="h-[200px] w-full">
            <AreaChart data={data.leadsOverTime}>
              <defs>
                <linearGradient id="leadsGradOverview" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={32}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Leads"
                stroke="var(--color-count)"
                fill="url(#leadsGradOverview)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Pipeline by stage" sub="Deals per stage" index={1}>
          <ChartContainer config={dealsConfig} className="h-[200px] w-full">
            <BarChart data={data.dealsByStage} barSize={26}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={32}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                name="Deals"
                fill="var(--color-count)"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>
      </SupportingWorkArea>
    </div>
  );
}
