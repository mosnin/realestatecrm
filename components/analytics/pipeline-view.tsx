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
import { motion, useReducedMotion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
import {
  StatCell,
  StatStrip,
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  DotMatrix,
  EmptyState,
  formatCurrency,
  PAPER_SERIES,
  PAPER_GRID,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { PipelineAnalyticsData } from '@/lib/analytics-data';
import {
  SECTION_RHYTHM,
  STAT_NUMBER,
  TITLE_FONT,
  CAPTION,
} from '@/lib/typography';
import { DURATION_SLOW, EASE_OUT } from '@/lib/motion';
import { AnimatedNumber } from '@/components/motion/animated-number';

const dealsByStageCountConfig = {
  count: { label: 'Deals', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsByStageValueConfig = {
  value: { label: 'Value', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsOverTimeConfig = {
  count: { label: 'Deals', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsByPriorityConfig = {
  High: { label: 'High', color: 'hsl(var(--foreground))' },
  Medium: { label: 'Medium', color: 'hsl(var(--foreground) / 0.7)' },
  Low: { label: 'Low', color: 'hsl(var(--muted-foreground) / 0.5)' },
  None: { label: 'None', color: 'hsl(var(--muted-foreground) / 0.25)' },
} satisfies ChartConfig;

// Win-rate gauge geometry — r=52 matches the SVG below; precomputed so the
// animated arc and the static dasharray agree exactly.
const CIRCUMFERENCE = 2 * Math.PI * 52;

// Priority fills — High darkest, None lightest. Ordered emphasis.
const PRIORITY_FILLS: Record<string, string> = {
  High: 'hsl(var(--foreground))',
  Medium: 'hsl(var(--foreground) / 0.7)',
  Low: 'hsl(var(--muted-foreground) / 0.5)',
  None: 'hsl(var(--muted-foreground) / 0.25)',
};

export function PipelineView({ data }: { data: PipelineAnalyticsData }) {
  const reduce = useReducedMotion();
  return (
    <div className={SECTION_RHYTHM}>
      {/* Summary strip */}
      <StatStrip>
        <StatCell label="Total deals" value={data.totalDeals} />
        <StatCell
          label="Pipeline value"
          value={data.totalPipelineValue}
          format={formatCurrency}
          sub="active deals"
          accent
        />
        <StatCell
          label="Avg deal size"
          value={data.activeDeals > 0 ? formatCurrency(data.avgDealSize) : '--'}
          sub="active deals"
        />
        <StatCell
          label="Win rate"
          value={data.wonDeals + data.lostDeals > 0 ? `${data.dealWinRate}%` : '--'}
          sub={`${data.wonDeals} won / ${data.lostDeals} lost`}
        />
      </StatStrip>

      {/* Stage distribution */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Stage coverage" sub="Number of deals in each pipeline stage" index={0}>
          {/* Dot-matrix coverage viz (the reference's circles grid): one row
              per stage, filled dots scaled against the busiest stage, the
              REAL count printed at the row's end so the encoding is never
              dots-alone. */}
          <DotMatrix
            className="py-2"
            rows={(() => {
              const maxCount = Math.max(1, ...data.dealsByStage.map((s) => s.count));
              return data.dealsByStage.map((s) => ({
                label: s.name,
                filled: s.count,
                total: maxCount,
                value: s.count,
              }));
            })()}
          />
        </ChartSection>

        <ChartSection title="Value per stage" sub="Total deal value per pipeline stage" index={1}>
          <ChartContainer config={dealsByStageValueConfig} className="h-[220px] w-full">
            <BarChart data={data.dealsByStage} barSize={22}>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
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
              <Bar dataKey="value" name="Value" radius={[2, 2, 0, 0]} fill="var(--color-value)" />
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>

      {/* Trends + priority */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Deals over time" sub="New deals created each month" index={0}>
          <ChartContainer config={dealsOverTimeConfig} className="h-[220px] w-full">
            <AreaChart data={data.dealsOverTime}>
              <defs>
                <linearGradient id="dealsGradPipeline" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={PAPER_GRID} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} width={28} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Deals"
                stroke="var(--color-count)"
                fill="url(#dealsGradPipeline)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        {data.dealsByPriority.length > 0 && (
          <ChartSection title="Deals by priority" sub="Distribution across priority levels" index={1}>
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
                  stroke="hsl(var(--background))"
                  strokeWidth={2}
                >
                  {data.dealsByPriority.map((entry, i) => (
                    <Cell
                      key={entry.label}
                      fill={PRIORITY_FILLS[entry.label] ?? PAPER_SERIES[i % PAPER_SERIES.length]}
                    />
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
        <ChartSection title="Win/Loss breakdown" sub="Deal outcomes at a glance" index={2}>
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground/20"
                  strokeWidth="10"
                />
                {/* Progress arc draws in clockwise on entry by animating the
                    dash offset; dasharray stays constant so the final geometry
                    is byte-identical to a static render. */}
                <motion.circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-foreground"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                  initial={
                    reduce
                      ? false
                      : { strokeDashoffset: CIRCUMFERENCE }
                  }
                  animate={{
                    strokeDashoffset:
                      CIRCUMFERENCE - (data.dealWinRate / 100) * CIRCUMFERENCE,
                  }}
                  transition={{ duration: DURATION_SLOW, ease: EASE_OUT }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={STAT_NUMBER} style={TITLE_FONT}>
                  <AnimatedNumber
                    value={data.dealWinRate}
                    format={(n) => `${Math.round(n)}%`}
                  />
                </span>
              </div>
            </div>
            <p className={`${CAPTION} mt-3 text-center`}>
              {data.wonDeals} won, {data.lostDeals} lost out of {data.totalDeals} deals
            </p>
          </div>
        </ChartSection>
      )}

      {data.totalDeals === 0 && (
        <EmptyState glyph={<Briefcase size={18} strokeWidth={1.5} aria-hidden />}>
          Add a deal and the pipeline charts show up here.
        </EmptyState>
      )}
    </div>
  );
}
