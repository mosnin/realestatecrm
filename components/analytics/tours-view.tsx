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
import type { ToursAnalyticsData } from '@/lib/analytics-data';

export function ToursView({ data }: { data: ToursAnalyticsData }) {
  const { tickColor, gridColor } = useChartTheme();

  const statusColors: Record<string, string> = {
    Completed: '#10b981',
    Scheduled: '#3b82f6',
    Cancelled: '#f87171',
    'No-show': '#f59e0b',
    Pending: '#94a3b8',
  };

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total tours" value={data.totalTours} sub="all time" />
        <StatCard label="Completed" value={data.completedTours} sub="tours finished" />
        <StatCard label="Scheduled" value={data.scheduledTours} sub="upcoming" />
        <StatCard
          label="Tour-to-deal rate"
          value={data.completedTours > 0 ? `${data.tourConversionRate}%` : '--'}
          sub={`${data.toursConvertedToDeals} converted`}
        />
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Tours over time" sub="Tour bookings per month">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.toursOverTime}>
              <defs>
                <linearGradient id="toursGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Tours"
                stroke="#3b82f6"
                fill="url(#toursGrad)"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3b82f6' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection title="Tours by status" sub="Breakdown of tour outcomes">
          {data.toursByStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.toursByStatus}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {data.toursByStatus.map((entry) => (
                    <Cell key={entry.label} fill={statusColors[entry.label] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              No tour data yet
            </div>
          )}
        </ChartSection>
      </div>

      {/* Conversion metrics */}
      <ChartSection title="Tour conversion funnel" sub="From booked tours to closed deals">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-center py-2">
          {[
            { label: 'Booked', count: data.totalTours, color: '#3b82f6' },
            { label: 'Completed', count: data.completedTours, color: '#f59e0b' },
            { label: 'Converted to deal', count: data.toursConvertedToDeals, color: '#10b981' },
          ].map((stage, i) => (
            <div key={stage.label} className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1">
              <div
                className="rounded-lg flex items-center justify-center text-white font-bold text-lg tabular-nums w-16 h-14 sm:w-full sm:h-16 shrink-0"
                style={{ backgroundColor: stage.color }}
              >
                {stage.count}
              </div>
              <div className="sm:text-center">
                <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                {i > 0 && data.totalTours > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Math.round((stage.count / data.totalTours) * 100)}% of booked
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ChartSection>

      {data.totalTours === 0 && (
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Tour analytics will appear here once tours are scheduled and completed.
          </p>
        </div>
      )}
    </div>
  );
}
