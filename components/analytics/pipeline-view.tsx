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
import { StatCard, ChartSection, formatCurrency } from './chart-primitives';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import type { PipelineAnalyticsData } from '@/lib/analytics-data';

const dealsByStageCountConfig = {
  count: { label: 'Deals', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const dealsByStageValueConfig = {
  value: { label: 'Value', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const dealsOverTimeConfig = {
  count: { label: 'Deals', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const dealsByPriorityConfig = {
  High: { label: 'High', color: 'hsl(var(--chart-4))' },
  Medium: { label: 'Medium', color: 'hsl(var(--chart-5))' },
  Low: { label: 'Low', color: 'hsl(var(--chart-2))' },
  None: { label: 'None', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

const priorityColors: Record<string, string> = {
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#3b82f6',
  None: '#94a3b8',
};
const priorityFallback = ['#10b981', '#3b82f6', '#f59e0b', '#94a3b8', '#f87171'];

export function PipelineView({ data }: { data: PipelineAnalyticsData }) {
  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total deals" value={data.totalDeals} />
        <StatCard label="Pipeline value" value={formatCurrency(data.totalPipelineValue)} sub="active deals only" />
        <StatCard
          label="Avg deal size"
          value={data.activeDeals > 0 ? formatCurrency(data.avgDealSize) : '--'}
          sub="active deals"
        />
        <StatCard
          label="Win rate"
          value={data.wonDeals + data.lostDeals > 0 ? `${data.dealWinRate}%` : '--'}
          sub={`${data.wonDeals} won / ${data.lostDeals} lost`}
        />
      </div>

      {/* Charts row 1: stage distribution */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals per stage" sub="Number of deals in each pipeline stage">
          <ChartContainer config={dealsByStageCountConfig} className="h-[220px] w-full">
            <BarChart data={data.dealsByStage} barSize={22}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]}>
                {data.dealsByStage.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Value per stage" sub="Total deal value per pipeline stage">
          <ChartContainer config={dealsByStageValueConfig} className="h-[220px] w-full">
            <BarChart data={data.dealsByStage} barSize={22}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={48}
                tickFormatter={(v) => formatCurrency(v)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                {data.dealsByStage.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>

      {/* Charts row 2: trends + priority */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals over time" sub="New deals created each month">
          <ChartContainer config={dealsOverTimeConfig} className="h-[220px] w-full">
            <AreaChart data={data.dealsOverTime}>
              <defs>
                <linearGradient id="dealsGradPipeline" x1="0" y1="0" x2="0" y2="1">
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
                name="Deals"
                stroke="var(--color-count)"
                fill="url(#dealsGradPipeline)"
                strokeWidth={2}
                dot={{ r: 3, fill: 'var(--color-count)' }}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        {data.dealsByPriority.length > 0 && (
          <ChartSection title="Deals by priority" sub="Distribution across priority levels">
            <ChartContainer config={dealsByPriorityConfig} className="h-[220px] w-full">
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
                  {data.dealsByPriority.map((entry, i) => (
                    <Cell key={entry.label} fill={priorityColors[entry.label] ?? priorityFallback[i % priorityFallback.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                <ChartLegend content={<ChartLegendContent nameKey="label" />} />
              </PieChart>
            </ChartContainer>
          </ChartSection>
        )}
      </div>

      {/* Win rate visual */}
      {data.wonDeals + data.lostDeals > 0 && (
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
