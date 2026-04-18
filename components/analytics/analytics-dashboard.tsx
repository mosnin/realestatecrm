'use client';

import { useState } from 'react';
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
import { cn } from '@/lib/utils';
import { formatCompact as formatCurrency } from '@/lib/formatting';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MonthBucket {
  month: string; // e.g. "Jan '25"
  count: number;
}

interface StageBar {
  name: string;
  count: number;
  value: number;
  color: string;
}

interface ScoreBucket {
  label: string;
  count: number;
}

interface ContactStageBucket {
  label: string;
  count: number;
}

interface LabelCount {
  label: string;
  count: number;
}

interface AvgScoreMonth {
  month: string;
  avg: number | null;
}

export interface AnalyticsData {
  // summary
  totalLeads: number;
  totalContacts: number;
  totalDeals: number;
  totalPipelineValue: number;
  avgLeadScore: number | null;

  // time-series
  leadsOverTime: MonthBucket[];
  contactsOverTime: MonthBucket[];

  // breakdowns
  dealsByStage: StageBar[];
  leadScoreBuckets: ScoreBucket[];
  contactsByStage: ContactStageBucket[];

  // qualification analytics (from applicationData + scoreDetails JSONB)
  employmentBreakdown: LabelCount[];
  affordabilityBuckets: LabelCount[];
  screeningFlags: LabelCount[];
  moveInUrgency: LabelCount[];
  leadStateDistribution: LabelCount[];
  topRiskFlags: LabelCount[];
  avgScoreByMonth: AvgScoreMonth[];

  // conversion funnel
  contactFunnel: { label: string; count: number; rate: number }[];
  dealWinRate: number;

  // tour analytics
  totalTours: number;
  completedTours: number;
  toursConvertedToDeals: number;
  tourConversionRate: number;

  // lead type breakdown
  buyerLeadCount: number;
  rentalLeadCount: number;
  buyerBudgetDistribution: LabelCount[];
}

const TABS = ['Overview', 'Leads', 'Qualification', 'Deals', 'Contacts', 'Buyer'] as const;
type Tab = (typeof TABS)[number];

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-3 sm:px-5 sm:py-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────

function ChartSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-5">
      <p className="font-semibold text-sm">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-3 sm:mb-4">{sub}</p>}
      {!sub && <div className="mb-3 sm:mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">
        {children}
      </div>
    </div>
  );
}

// ─── Chart configs ─────────────────────────────────────────────────────────

const leadsOverTimeConfig = {
  count: { label: 'Leads', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

const dealsByStageCountConfig = {
  count: { label: 'Deals', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const leadScoreBucketsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const employmentConfig = {
  count: { label: 'Leads', color: 'hsl(var(--primary))' },
} satisfies ChartConfig;

const affordabilityConfig = {
  'Passes 3x rule': { label: 'Passes 3x rule', color: '#10b981' },
  'Below 3x rule': { label: 'Below 3x rule', color: '#f87171' },
} satisfies ChartConfig;

const moveInUrgencyConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const screeningFlagsConfig = {
  count: { label: 'Leads', color: '#f87171' },
} satisfies ChartConfig;

const leadStateConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const topRiskFlagsConfig = {
  count: { label: 'Leads', color: '#f59e0b' },
} satisfies ChartConfig;

const avgScoreConfig = {
  avg: { label: 'Avg score', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const dealsPerStageConfig = {
  count: { label: 'Deals', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const valuePerStageConfig = {
  value: { label: 'Value', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const contactsOverTimeConfig = {
  count: { label: 'Contacts', color: '#6366f1' },
} satisfies ChartConfig;

const contactsByStageConfig = {
  count: { label: 'Contacts', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const leadTypeConfig = {
  Buyer: { label: 'Buyer', color: '#3b82f6' },
  Rental: { label: 'Rental', color: '#10b981' },
} satisfies ChartConfig;

const buyerBudgetConfig = {
  count: { label: 'Buyers', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

// ─── Main component ────────────────────────────────────────────────────────

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="space-y-5">
      {/* Tab bar — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-1 px-1 scrollbar-none">
        <div className="flex gap-1 p-1 rounded-lg bg-muted w-max min-w-full sm:w-fit">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
                tab === t
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview ── */}
      {tab === 'Overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total leads" value={data.totalLeads} sub="all time" />
            <StatCard label="Contacts" value={data.totalContacts} sub="in CRM" />
            <StatCard label="Active deals" value={data.totalDeals} />
            <StatCard
              label="Pipeline value"
              value={formatCurrency(data.totalPipelineValue)}
              sub="combined"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Leads over time" sub="Applications submitted per month">
              <ChartContainer config={leadsOverTimeConfig} className="h-[200px] w-full">
                <AreaChart data={data.leadsOverTime}>
                  <defs>
                    <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-count)"
                    fill="url(#leadsGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ChartContainer>
            </ChartSection>

            <ChartSection title="Pipeline by stage" sub="Deals and value per stage">
              <ChartContainer config={dealsByStageCountConfig} className="h-[200px] w-full">
                <BarChart data={data.dealsByStage} barSize={18}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.dealsByStage.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartSection>
          </div>
        </div>
      )}

      {/* ── Leads ── */}
      {tab === 'Leads' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total leads" value={data.totalLeads} sub="all time" />
            <StatCard
              label="Avg score"
              value={data.avgLeadScore != null ? Math.round(data.avgLeadScore) : '—'}
              sub="out of 100"
            />
            <StatCard
              label="Hot leads"
              value={data.leadScoreBuckets.find((b) => b.label === 'Hot')?.count ?? 0}
              sub="score ≥ 75"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Applications over time" sub="New leads submitted each month">
              <ChartContainer config={leadsOverTimeConfig} className="h-[220px] w-full">
                <AreaChart data={data.leadsOverTime}>
                  <defs>
                    <linearGradient id="leadsGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-count)"
                    fill="url(#leadsGrad2)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-count)' }}
                  />
                </AreaChart>
              </ChartContainer>
            </ChartSection>

            <ChartSection title="Lead score distribution" sub="Leads grouped by AI score tier">
              <ChartContainer config={leadScoreBucketsConfig} className="h-[220px] w-full">
                <BarChart data={data.leadScoreBuckets} barSize={32}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.leadScoreBuckets.map((entry) => {
                      const colorMap: Record<string, string> = {
                        Hot: '#10b981',
                        Warm: '#f59e0b',
                        Cold: '#94a3b8',
                        Unscored: '#cbd5e1',
                      };
                      return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                    })}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartSection>
          </div>
        </div>
      )}

      {/* ── Qualification ── */}
      {tab === 'Qualification' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total leads" value={data.totalLeads} />
            <StatCard
              label="Pass affordability"
              value={
                data.affordabilityBuckets.length > 0
                  ? `${Math.round(
                      ((data.affordabilityBuckets.find((b) => b.label === 'Passes 3x rule')?.count ?? 0) /
                        data.affordabilityBuckets.reduce((s, b) => s + b.count, 0)) *
                        100,
                    )}%`
                  : '—'
              }
              sub="pass 3x rent rule"
            />
            <StatCard
              label="Screening flags"
              value={data.screeningFlags.reduce((s, f) => s + f.count, 0)}
              sub="across all leads"
            />
            <StatCard
              label="Moving ≤ 30 days"
              value={data.moveInUrgency.find((b) => b.label === '≤ 30 days')?.count ?? 0}
              sub="high urgency"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Employment breakdown */}
            {data.employmentBreakdown.length > 0 && (
              <ChartSection title="Employment status" sub="How leads are currently employed">
                <ChartContainer config={employmentConfig} className="h-[220px] w-full">
                  <BarChart
                    data={data.employmentBreakdown}
                    layout="vertical"
                    barSize={14}
                    margin={{ left: 0 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={80} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="var(--color-count)" />
                  </BarChart>
                </ChartContainer>
              </ChartSection>
            )}

            {/* Affordability donut */}
            {data.affordabilityBuckets.length > 0 && (
              <ChartSection title="Income affordability" sub="Leads who meet the 3× monthly rent rule">
                <ChartContainer config={affordabilityConfig} className="h-[220px] w-full">
                  <PieChart>
                    <Pie
                      data={data.affordabilityBuckets}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      {data.affordabilityBuckets.map((entry, i) => (
                        <Cell
                          key={entry.label}
                          fill={i === 0 ? '#10b981' : '#f87171'}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              </ChartSection>
            )}

            {/* Move-in urgency */}
            {data.moveInUrgency.length > 0 && (
              <ChartSection title="Move-in urgency" sub="How soon leads want to move in">
                <ChartContainer config={moveInUrgencyConfig} className="h-[200px] w-full">
                  <BarChart data={data.moveInUrgency} barSize={28}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data.moveInUrgency.map((entry) => {
                        const colorMap: Record<string, string> = {
                          'Overdue': '#ef4444',
                          '≤ 30 days': '#10b981',
                          '31-60 days': '#f59e0b',
                          '61-90 days': '#94a3b8',
                          '90+ days': '#cbd5e1',
                          'Not provided': '#e2e8f0',
                        };
                        return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </ChartSection>
            )}

            {/* Screening flags */}
            {data.screeningFlags.length > 0 && (
              <ChartSection title="Screening flags" sub="Leads with disclosed issues">
                <ChartContainer config={screeningFlagsConfig} className="h-[200px] w-full">
                  <BarChart
                    data={data.screeningFlags}
                    layout="vertical"
                    barSize={14}
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={90} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="var(--color-count)" />
                  </BarChart>
                </ChartContainer>
              </ChartSection>
            )}

            {/* Lead state distribution */}
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
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {data.leadStateDistribution.map((entry, i) => {
                        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#94a3b8', '#f87171'];
                        return <Cell key={entry.label} fill={colors[i % colors.length]} />;
                      })}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              </ChartSection>
            )}

            {/* Top risk flags */}
            {data.topRiskFlags.length > 0 && (
              <ChartSection title="Top AI risk flags" sub="Most common risks flagged across leads">
                <ChartContainer config={topRiskFlagsConfig} className="h-[220px] w-full">
                  <BarChart
                    data={data.topRiskFlags}
                    layout="vertical"
                    barSize={12}
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tickMargin={8} width={100} tick={{ fontSize: 9 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} fill="var(--color-count)" />
                  </BarChart>
                </ChartContainer>
              </ChartSection>
            )}

            {/* Avg score by month */}
            {data.avgScoreByMonth.some((m) => m.avg != null) && (
              <ChartSection title="Avg lead score over time" sub="Monthly average AI qualification score">
                <ChartContainer config={avgScoreConfig} className="h-[200px] w-full">
                  <BarChart data={data.avgScoreByMonth} barSize={22}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {data.avgScoreByMonth.map((entry) => (
                        <Cell
                          key={entry.month}
                          fill={
                            entry.avg == null ? '#e2e8f0' :
                            entry.avg >= 75 ? '#10b981' :
                            entry.avg >= 45 ? '#f59e0b' :
                            '#94a3b8'
                          }
                        />
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
      )}

      {/* ── Deals ── */}
      {tab === 'Deals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total deals" value={data.totalDeals} />
            <StatCard
              label="Pipeline value"
              value={formatCurrency(data.totalPipelineValue)}
            />
            <StatCard
              label="Pipeline value"
              value={formatCurrency(data.totalPipelineValue)}
              sub="active deals"
            />
            <StatCard
              label="Win rate"
              value={data.dealWinRate > 0 ? `${data.dealWinRate}%` : '—'}
              sub="won / (won + lost)"
            />
          </div>

          {/* Tour conversion stats */}
          {data.totalTours > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total tours" value={data.totalTours} sub="all time" />
              <StatCard label="Completed" value={data.completedTours} sub="tours finished" />
              <StatCard label="Converted to deal" value={data.toursConvertedToDeals} sub="from tours" />
              <StatCard
                label="Tour → Deal rate"
                value={data.completedTours > 0 ? `${data.tourConversionRate}%` : '—'}
                sub="of completed tours"
              />
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Deals per stage" sub="Number of deals in each pipeline stage">
              <ChartContainer config={dealsPerStageConfig} className="h-[220px] w-full">
                <BarChart data={data.dealsByStage} barSize={22}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.dealsByStage.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartSection>

            <ChartSection title="Value per stage" sub="Total deal value per pipeline stage">
              <ChartContainer config={valuePerStageConfig} className="h-[220px] w-full">
                <BarChart data={data.dealsByStage} barSize={22}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={48}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data.dealsByStage.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartSection>
          </div>

          {/* Client pipeline conversion funnel */}
          <ChartSection title="Client pipeline funnel" sub="Conversion rates across your renter pipeline">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-center py-2">
              {data.contactFunnel.map((stage, i) => {
                const colors = ['#3b82f6', '#f59e0b', '#10b981'];
                const color = colors[i] ?? '#94a3b8';
                return (
                  <div key={stage.label} className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1">
                    <div
                      className="rounded-lg flex items-center justify-center text-white font-bold text-lg tabular-nums w-16 h-14 sm:w-full sm:h-16 shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {stage.count}
                    </div>
                    <div className="sm:text-center">
                      <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                      {i > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {stage.rate}% conversion
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-4 sm:gap-6 mt-3 text-xs text-muted-foreground flex-wrap">
              {data.contactFunnel.map((stage, i) => {
                const colors = ['#3b82f6', '#f59e0b', '#10b981'];
                return (
                  <div key={stage.label} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors[i] ?? '#94a3b8' }} />
                    {stage.label} ({stage.count})
                  </div>
                );
              })}
            </div>
          </ChartSection>
        </div>
      )}

      {/* ── Contacts ── */}
      {tab === 'Contacts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total contacts" value={data.totalContacts} />
            {data.contactsByStage.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.count} />
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Contacts over time" sub="New contacts added each month">
              <ChartContainer config={contactsOverTimeConfig} className="h-[220px] w-full">
                <AreaChart data={data.contactsOverTime}>
                  <defs>
                    <linearGradient id="contactsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="var(--color-count)"
                    fill="url(#contactsGrad)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--color-count)' }}
                  />
                </AreaChart>
              </ChartContainer>
            </ChartSection>

            <ChartSection title="Contacts by stage" sub="Current distribution across stages">
              <ChartContainer config={contactsByStageConfig} className="h-[220px] w-full">
                <BarChart data={data.contactsByStage} barSize={32}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.contactsByStage.map((entry) => {
                      const colorMap: Record<string, string> = {
                        Qualifying: '#3b82f6',
                        Tour: '#f59e0b',
                        Applied: '#10b981',
                      };
                      return (
                        <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartSection>
          </div>
        </div>
      )}

      {/* ── Buyer ── */}
      {tab === 'Buyer' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Buyer leads" value={data.buyerLeadCount} sub="all time" />
            <StatCard label="Rental leads" value={data.rentalLeadCount} sub="all time" />
            <StatCard
              label="Buyer share"
              value={data.totalLeads > 0 ? `${Math.round((data.buyerLeadCount / data.totalLeads) * 100)}%` : '—'}
              sub="of total leads"
            />
            <StatCard
              label="Total leads"
              value={data.totalLeads}
              sub="buyer + rental"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Buyer vs Rental breakdown */}
            <ChartSection title="Leads by type" sub="Buyer vs rental lead distribution">
              <ChartContainer config={leadTypeConfig} className="h-[220px] w-full">
                <PieChart>
                  <Pie
                    data={[
                      { label: 'Buyer', count: data.buyerLeadCount },
                      { label: 'Rental', count: data.rentalLeadCount },
                    ]}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#10b981" />
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            </ChartSection>

            {/* Buyer budget distribution */}
            {data.buyerBudgetDistribution.length > 0 && (
              <ChartSection title="Buyer budget distribution" sub="Budget ranges across buyer leads">
                <ChartContainer config={buyerBudgetConfig} className="h-[220px] w-full">
                  <BarChart data={data.buyerBudgetDistribution} barSize={28}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {data.buyerBudgetDistribution.map((entry) => {
                        const colors: Record<string, string> = {
                          'Under $200K': '#94a3b8',
                          '$200K-$400K': '#3b82f6',
                          '$400K-$600K': '#10b981',
                          '$600K-$800K': '#f59e0b',
                          '$800K-$1M': '#f97316',
                          'Over $1M': '#ef4444',
                        };
                        return <Cell key={entry.label} fill={colors[entry.label] ?? '#94a3b8'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </ChartSection>
            )}
          </div>

          {data.buyerLeadCount === 0 && (
            <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No buyer leads yet. Buyer analytics will appear here once buyer leads are added.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
