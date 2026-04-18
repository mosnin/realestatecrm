'use client';

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  StatCard,
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { LeadsAnalyticsData } from '@/lib/analytics-data';

const leadsVolumeConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const scoreBucketsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const employmentConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const affordabilityConfig = {
  'Passes 3x rule': { label: 'Passes 3x rule', color: '#10b981' },
  'Below 3x rule': { label: 'Below 3x rule', color: '#f87171' },
} satisfies ChartConfig;

const urgencyConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const screeningConfig = {
  count: { label: 'Leads', color: '#f87171' },
} satisfies ChartConfig;

const leadStateConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const riskFlagsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig;

const avgScoreConfig = {
  avg: { label: 'Avg score', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const buyerBudgetConfig = {
  count: { label: 'Buyers', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const SCORE_BUCKET_COLORS: Record<string, string> = {
  Hot: '#10b981',
  Warm: '#f59e0b',
  Cold: '#94a3b8',
  Unscored: '#cbd5e1',
};

const URGENCY_COLORS: Record<string, string> = {
  Overdue: '#ef4444',
  '≤ 30 days': '#10b981',
  '31-60 days': '#f59e0b',
  '61-90 days': '#94a3b8',
  '90+ days': '#cbd5e1',
  'Not provided': '#e2e8f0',
};

const LEAD_STATE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#94a3b8', '#f87171'];

const BUYER_BUDGET_COLORS: Record<string, string> = {
  'Under $200K': '#94a3b8',
  '$200K-$400K': '#3b82f6',
  '$400K-$600K': '#10b981',
  '$600K-$800K': '#f59e0b',
  '$800K-$1M': '#f97316',
  'Over $1M': '#ef4444',
};

export function LeadsView({ data }: { data: LeadsAnalyticsData }) {
  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total leads" value={data.totalLeads} sub="all time" />
        <StatCard
          label="Avg score"
          value={data.avgLeadScore != null ? Math.round(data.avgLeadScore) : '--'}
          sub="out of 100"
        />
        <StatCard
          label="Hot leads"
          value={data.leadScoreBuckets.find((b) => b.label === 'Hot')?.count ?? 0}
          sub="score >= 75"
        />
        <StatCard
          label="Buyer leads"
          value={data.buyerLeadCount}
          sub={`${data.rentalLeadCount} rental`}
        />
      </div>

      {/* Charts row 1: volume + scoring */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Lead volume over time" sub="New leads submitted each month">
          <ChartContainer config={leadsVolumeConfig} className="h-[220px] w-full">
            <AreaChart data={data.leadsOverTime}>
              <defs>
                <linearGradient id="leadsGradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
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
                fill="url(#leadsGradLeads)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-count)' }}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Score distribution" sub="Leads grouped by AI score tier">
          <ChartContainer config={scoreBucketsConfig} className="h-[220px] w-full">
            <BarChart data={data.leadScoreBuckets} barSize={32}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
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
              <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                {data.leadScoreBuckets.map((entry) => (
                  <Cell key={entry.label} fill={SCORE_BUCKET_COLORS[entry.label] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>

      {/* Qualification metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Pass affordability"
          value={
            data.affordabilityBuckets.length > 0
              ? `${Math.round(((data.affordabilityBuckets.find((b) => b.label === 'Passes 3x rule')?.count ?? 0) / data.affordabilityBuckets.reduce((s, b) => s + b.count, 0)) * 100)}%`
              : '--'
          }
          sub="pass 3x rent rule"
        />
        <StatCard
          label="Screening flags"
          value={data.screeningFlags.reduce((s, f) => s + f.count, 0)}
          sub="across all leads"
        />
        <StatCard
          label="Moving <= 30 days"
          value={data.moveInUrgency.find((b) => b.label === '≤ 30 days')?.count ?? 0}
          sub="high urgency"
        />
        <StatCard
          label="Buyer share"
          value={data.totalLeads > 0 ? `${Math.round((data.buyerLeadCount / data.totalLeads) * 100)}%` : '--'}
          sub="of total leads"
        />
      </div>

      {/* Charts row 2: qualification breakdown */}
      <div className="grid sm:grid-cols-2 gap-4">
        {data.employmentBreakdown.length > 0 && (
          <ChartSection title="Employment status" sub="How leads are currently employed">
            <ChartContainer config={employmentConfig} className="h-[220px] w-full">
              <BarChart data={data.employmentBreakdown} layout="vertical" barSize={14} margin={{ left: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={80}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.affordabilityBuckets.length > 0 && (
          <ChartSection title="Income affordability" sub="Leads who meet the 3x monthly rent rule">
            <ChartContainer config={affordabilityConfig} className="h-[220px] w-full">
              <PieChart>
                <Pie
                  data={data.affordabilityBuckets}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.affordabilityBuckets.map((entry, i) => (
                    <Cell key={entry.label} fill={i === 0 ? '#10b981' : '#f87171'} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.moveInUrgency.length > 0 && (
          <ChartSection title="Move-in urgency" sub="How soon leads want to move in">
            <ChartContainer config={urgencyConfig} className="h-[200px] w-full">
              <BarChart data={data.moveInUrgency} barSize={28}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 10 }}
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
                <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                  {data.moveInUrgency.map((entry) => (
                    <Cell key={entry.label} fill={URGENCY_COLORS[entry.label] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.screeningFlags.length > 0 && (
          <ChartSection title="Screening flags" sub="Leads with disclosed issues">
            <ChartContainer config={screeningConfig} className="h-[200px] w-full">
              <BarChart data={data.screeningFlags} layout="vertical" barSize={14} margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={90}
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.leadStateDistribution.length > 0 && (
          <ChartSection title="AI lead state" sub="How the AI has categorized your leads">
            <ChartContainer config={leadStateConfig} className="h-[220px] w-full">
              <PieChart>
                <Pie
                  data={data.leadStateDistribution}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {data.leadStateDistribution.map((entry, i) => (
                    <Cell key={entry.label} fill={LEAD_STATE_COLORS[i % LEAD_STATE_COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.topRiskFlags.length > 0 && (
          <ChartSection title="Top AI risk flags" sub="Most common risks flagged across leads">
            <ChartContainer config={riskFlagsConfig} className="h-[220px] w-full">
              <BarChart data={data.topRiskFlags} layout="vertical" barSize={12} margin={{ left: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={100}
                  tick={{ fontSize: 9 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="var(--color-count)" />
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.avgScoreByMonth.some((m) => m.avg != null) && (
          <ChartSection title="Avg lead score over time" sub="Monthly average AI qualification score">
            <ChartContainer config={avgScoreConfig} className="h-[200px] w-full">
              <BarChart data={data.avgScoreByMonth} barSize={22}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={32}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avg" name="Avg score" radius={[4, 4, 0, 0]}>
                  {data.avgScoreByMonth.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={
                        entry.avg == null
                          ? '#e2e8f0'
                          : entry.avg >= 75
                          ? '#10b981'
                          : entry.avg >= 45
                          ? '#f59e0b'
                          : '#94a3b8'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}

        {data.buyerBudgetDistribution.length > 0 && (
          <ChartSection title="Buyer budget distribution" sub="Budget ranges across buyer leads">
            <ChartContainer config={buyerBudgetConfig} className="h-[220px] w-full">
              <BarChart data={data.buyerBudgetDistribution} barSize={28}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 10 }}
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
                <Bar dataKey="count" name="Buyers" radius={[4, 4, 0, 0]}>
                  {data.buyerBudgetDistribution.map((entry) => (
                    <Cell key={entry.label} fill={BUYER_BUDGET_COLORS[entry.label] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartSection>
        )}
      </div>

      {data.leadStateDistribution.length === 0 && data.employmentBreakdown.length === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Qualification data will appear here once leads submit applications with full details.
          </p>
        </div>
      )}
    </div>
  );
}
