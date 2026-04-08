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
import { StatCard, ChartTooltip, ChartSection, useChartTheme, formatCurrency } from './chart-primitives';
import type { PipelineAnalyticsData } from '@/lib/analytics-data';

export function PipelineView({ data }: { data: PipelineAnalyticsData }) {
  const { tickColor, gridColor } = useChartTheme();

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total deals" value={data.totalDeals} />
        <StatCard label="Pipeline value" value={formatCurrency(data.totalPipelineValue)} />
        <StatCard
          label="Avg deal size"
          value={data.totalDeals > 0 ? formatCurrency(data.avgDealSize) : '--'}
        />
        <StatCard
          label="Win rate"
          value={data.totalDeals > 0 ? `${data.dealWinRate}%` : '--'}
          sub={`${data.wonDeals} won / ${data.lostDeals} lost`}
        />
      </div>

      {/* Charts row 1: stage distribution */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals per stage" sub="Number of deals in each pipeline stage">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.dealsByStage} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
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
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
              <YAxis
                tick={{ fontSize: 11, fill: tickColor }}
                stroke={tickColor}
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

      {/* Charts row 2: trends + priority */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals over time" sub="New deals created each month">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.dealsOverTime}>
              <defs>
                <linearGradient id="dealsGradPipeline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Deals"
                stroke="#10b981"
                fill="url(#dealsGradPipeline)"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10b981' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        {data.dealsByPriority.length > 0 && (
          <ChartSection title="Deals by priority" sub="Distribution across priority levels">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.dealsByPriority}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.dealsByPriority.map((entry, i) => {
                    const colors: Record<string, string> = {
                      High: '#ef4444', Medium: '#f59e0b', Low: '#3b82f6', None: '#94a3b8',
                    };
                    const fallback = ['#10b981', '#3b82f6', '#f59e0b', '#94a3b8', '#f87171'];
                    return (
                      <Cell key={entry.label} fill={colors[entry.label] ?? fallback[i % fallback.length]} />
                    );
                  })}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartSection>
        )}
      </div>

      {/* Win rate visual */}
      {data.totalDeals > 0 && (
        <ChartSection title="Win/Loss breakdown" sub="Deal outcomes at a glance">
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" className="text-muted/40" strokeWidth="12" />
                <circle
                  cx="60" cy="60" r="52"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.dealWinRate / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">{data.dealWinRate}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {data.wonDeals} won, {data.lostDeals} lost out of {data.totalDeals} deals
            </p>
          </div>
        </ChartSection>
      )}

      {data.totalDeals === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Pipeline analytics will appear here once deals are created.
          </p>
        </div>
      )}
    </div>
  );
}
