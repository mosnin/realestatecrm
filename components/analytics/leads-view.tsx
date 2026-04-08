'use client';

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
import { StatCard, ChartTooltip, ChartSection, useChartTheme } from './chart-primitives';
import type { LeadsAnalyticsData } from '@/lib/analytics-data';

export function LeadsView({ data }: { data: LeadsAnalyticsData }) {
  const { tickColor, gridColor } = useChartTheme();

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
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.leadsOverTime}>
              <defs>
                <linearGradient id="leadsGradLeads" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Leads"
                stroke="hsl(var(--primary))"
                fill="url(#leadsGradLeads)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection title="Score distribution" sub="Leads grouped by AI score tier">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.leadScoreBuckets} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                {data.leadScoreBuckets.map((entry) => {
                  const colorMap: Record<string, string> = {
                    Hot: '#10b981', Warm: '#f59e0b', Cold: '#94a3b8', Unscored: '#cbd5e1',
                  };
                  return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.employmentBreakdown} layout="vertical" barSize={14} margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} width={80} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {data.affordabilityBuckets.length > 0 && (
          <ChartSection title="Income affordability" sub="Leads who meet the 3x monthly rent rule">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.affordabilityBuckets} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {data.affordabilityBuckets.map((entry, i) => (
                    <Cell key={entry.label} fill={i === 0 ? '#10b981' : '#f87171'} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {data.moveInUrgency.length > 0 && (
          <ChartSection title="Move-in urgency" sub="How soon leads want to move in">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.moveInUrgency} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                  {data.moveInUrgency.map((entry) => {
                    const colorMap: Record<string, string> = {
                      '≤ 30 days': '#10b981', '31-60 days': '#f59e0b', '61-90 days': '#94a3b8', '90+ days': '#cbd5e1', 'Not provided': '#e2e8f0',
                    };
                    return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {data.screeningFlags.length > 0 && (
          <ChartSection title="Screening flags" sub="Leads with disclosed issues">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.screeningFlags} layout="vertical" barSize={14} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} width={90} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="#f87171" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {data.leadStateDistribution.length > 0 && (
          <ChartSection title="AI lead state" sub="How the AI has categorized your leads">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.leadStateDistribution} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
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

        {data.topRiskFlags.length > 0 && (
          <ChartSection title="Top AI risk flags" sub="Most common risks flagged across leads">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.topRiskFlags} layout="vertical" barSize={12} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 9, fill: tickColor }} stroke={tickColor} width={100} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {data.avgScoreByMonth.some((m) => m.avg != null) && (
          <ChartSection title="Avg lead score over time" sub="Monthly average AI qualification score">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.avgScoreByMonth} barSize={22}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="avg" name="Avg score" radius={[4, 4, 0, 0]}>
                  {data.avgScoreByMonth.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={entry.avg == null ? '#e2e8f0' : entry.avg >= 75 ? '#10b981' : entry.avg >= 45 ? '#f59e0b' : '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {data.buyerBudgetDistribution.length > 0 && (
          <ChartSection title="Buyer budget distribution" sub="Budget ranges across buyer leads">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.buyerBudgetDistribution} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: tickColor }} stroke={tickColor} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Buyers" radius={[4, 4, 0, 0]}>
                  {data.buyerBudgetDistribution.map((entry) => {
                    const colors: Record<string, string> = {
                      'Under $200K': '#94a3b8', '$200K-$400K': '#3b82f6', '$400K-$600K': '#10b981',
                      '$600K-$800K': '#f59e0b', '$800K-$1M': '#f97316', 'Over $1M': '#ef4444',
                    };
                    return <Cell key={entry.label} fill={colors[entry.label] ?? '#94a3b8'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
