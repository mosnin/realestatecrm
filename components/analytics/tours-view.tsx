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
import { StatCard, ChartSection } from './chart-primitives';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { ToursAnalyticsData } from '@/lib/analytics-data';

const toursOverTimeConfig = {
  count: { label: 'Tours', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const toursByStatusConfig = {
  Completed: { label: 'Completed', color: 'hsl(var(--chart-1))' },
  Scheduled: { label: 'Scheduled', color: 'hsl(var(--chart-2))' },
  Confirmed: { label: 'Confirmed', color: 'hsl(var(--chart-3))' },
  Cancelled: { label: 'Cancelled', color: 'hsl(var(--chart-4))' },
  'No-show': { label: 'No-show', color: 'hsl(var(--chart-5))' },
  Pending: { label: 'Pending', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig;

const statusColors: Record<string, string> = {
  Completed: '#10b981',
  Scheduled: '#3b82f6',
  Confirmed: '#6366f1',
  Cancelled: '#f87171',
  'No-show': '#f59e0b',
  Pending: '#94a3b8',
};

export function ToursView({ data }: { data: ToursAnalyticsData }) {
  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total tours" value={data.totalTours} sub="all time" />
        <StatCard label="Completed" value={data.completedTours} sub="tours finished" />
        <StatCard label="Cancelled / No-show" value={data.cancelledTours + data.noShowTours} sub={`${data.noShowTours} no-show`} />
        <StatCard
          label="Tour-to-deal rate"
          value={data.completedTours > 0 ? `${data.tourConversionRate}%` : '--'}
          sub={`${data.toursConvertedToDeals} converted`}
        />
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Tours over time" sub="Tour bookings per month">
          <ChartContainer config={toursOverTimeConfig} className="h-[220px] w-full">
            <AreaChart data={data.toursOverTime}>
              <defs>
                <linearGradient id="toursGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Tours"
                stroke="var(--color-count)"
                fill="url(#toursGrad)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-count)' }}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Tours by status" sub="Breakdown of tour outcomes">
          {data.toursByStatus.length > 0 ? (
            <ChartContainer config={toursByStatusConfig} className="h-[220px] w-full">
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
                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
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
