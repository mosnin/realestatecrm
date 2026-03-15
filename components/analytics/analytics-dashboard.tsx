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
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCompact as formatCurrency } from '@/lib/formatting';

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
}

const TABS = ['Overview', 'Leads', 'Qualification', 'Deals', 'Contacts'] as const;
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
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Custom tooltip ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}:{' '}
          <span className="font-semibold">
            {typeof p.value === 'number' && p.name === 'Value'
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </p>
      ))}
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
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="font-semibold text-sm">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-4">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === t
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
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
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data.leadsOverTime}>
                  <defs>
                    <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="hsl(var(--primary))"
                    fill="url(#leadsGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Pipeline by stage" sub="Deals and value per stage">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.dealsByStage} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]}>
                    {data.dealsByStage.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.leadsOverTime}>
                  <defs>
                    <linearGradient id="leadsGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="hsl(var(--primary))"
                    fill="url(#leadsGrad2)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Lead score distribution" sub="Leads grouped by AI score tier">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.leadScoreBuckets} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
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
              </ResponsiveContainer>
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
                      ((data.affordabilityBuckets.find((b) => b.label === 'Passes 3× rule')?.count ?? 0) /
                        data.affordabilityBuckets.reduce((s, b) => s + b.count, 0)) *
                        100,
                    )}%`
                  : '—'
              }
              sub="pass 3× rent rule"
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
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.employmentBreakdown}
                    layout="vertical"
                    barSize={14}
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Affordability donut */}
            {data.affordabilityBuckets.length > 0 && (
              <ChartSection title="Income affordability" sub="Leads who meet the 3× monthly rent rule">
                <ResponsiveContainer width="100%" height={220}>
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
                        <Cell
                          key={entry.label}
                          fill={i === 0 ? '#10b981' : '#f87171'}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Move-in urgency */}
            {data.moveInUrgency.length > 0 && (
              <ChartSection title="Move-in urgency" sub="How soon leads want to move in">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.moveInUrgency} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                      {data.moveInUrgency.map((entry) => {
                        const colorMap: Record<string, string> = {
                          '≤ 30 days': '#10b981',
                          '31–60 days': '#f59e0b',
                          '61–90 days': '#94a3b8',
                          '90+ days': '#cbd5e1',
                          'Not provided': '#e2e8f0',
                        };
                        return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Screening flags */}
            {data.screeningFlags.length > 0 && (
              <ChartSection title="Screening flags" sub="Leads with disclosed issues">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={data.screeningFlags}
                    layout="vertical"
                    barSize={14}
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={130} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="#f87171" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Lead state distribution */}
            {data.leadStateDistribution.length > 0 && (
              <ChartSection title="AI lead state" sub="How the AI has categorized your leads">
                <ResponsiveContainer width="100%" height={220}>
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
                      {data.leadStateDistribution.map((entry, i) => {
                        const colors = ['#10b981', '#3b82f6', '#f59e0b', '#94a3b8', '#f87171'];
                        return <Cell key={entry.label} fill={colors[i % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Top risk flags */}
            {data.topRiskFlags.length > 0 && (
              <ChartSection title="Top AI risk flags" sub="Most common risks flagged across leads">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={data.topRiskFlags}
                    layout="vertical"
                    barSize={12}
                    margin={{ left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" width={160} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="#f59e0b" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartSection>
            )}

            {/* Avg score by month */}
            {data.avgScoreByMonth.some((m) => m.avg != null) && (
              <ChartSection title="Avg lead score over time" sub="Monthly average AI qualification score">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.avgScoreByMonth} barSize={22}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="avg" name="Avg score" radius={[4, 4, 0, 0]}>
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
                </ResponsiveContainer>
              </ChartSection>
            )}
          </div>

          {data.leadStateDistribution.length === 0 && data.employmentBreakdown.length === 0 && (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
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
              label="Avg deal size"
              value={
                data.totalDeals > 0
                  ? formatCurrency(Math.round(data.totalPipelineValue / data.totalDeals))
                  : '—'
              }
            />
            <StatCard
              label="Win rate"
              value={data.totalDeals > 0 ? `${data.dealWinRate}%` : '—'}
              sub="deals closed as won"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Deals per stage" sub="Number of deals in each pipeline stage">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dealsByStage} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]}>
                    {data.dealsByStage.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Value per stage" sub="Total deal value per pipeline stage">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dealsByStage} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={48}
                    tickFormatter={(v) => formatCurrency(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                    {data.dealsByStage.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          </div>

          {/* Client pipeline conversion funnel */}
          <ChartSection title="Client pipeline funnel" sub="Conversion rates across your renter pipeline">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center py-2">
              {data.contactFunnel.map((stage, i) => {
                const colors = ['#3b82f6', '#f59e0b', '#10b981'];
                const color = colors[i] ?? '#94a3b8';
                const maxCount = data.contactFunnel[0]?.count ?? 1;
                const widthPct = maxCount > 0 ? Math.max(30, Math.round((stage.count / maxCount) * 100)) : 30;
                return (
                  <div key={stage.label} className="flex flex-col items-center gap-2 flex-1">
                    {i > 0 && (
                      <div className="hidden sm:flex items-center text-muted-foreground/40 self-center absolute">
                        →
                      </div>
                    )}
                    <div
                      className="rounded-xl flex items-center justify-center text-white font-bold text-lg tabular-nums transition-all"
                      style={{ backgroundColor: color, width: `${widthPct}%`, minWidth: 80, height: 64 }}
                    >
                      {stage.count}
                    </div>
                    <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                    {i > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {stage.rate}% conversion
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center gap-6 mt-3 text-xs text-muted-foreground">
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
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.contactsOverTime}>
                  <defs>
                    <linearGradient id="contactsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Contacts"
                    stroke="#6366f1"
                    fill="url(#contactsGrad)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Contacts by stage" sub="Current distribution across stages">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.contactsByStage} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Contacts" radius={[4, 4, 0, 0]}>
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
              </ResponsiveContainer>
            </ChartSection>
          </div>
        </div>
      )}
    </div>
  );
}
