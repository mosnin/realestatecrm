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
import {
  StatCell,
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  formatCurrency,
  PAPER_GRID,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { OverviewData } from '@/lib/analytics-data';
import { SECTION_RHYTHM } from '@/lib/typography';

const leadsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

const dealsConfig = {
  count: { label: 'Deals', color: 'hsl(var(--foreground))' },
} satisfies ChartConfig;

export function OverviewView({ data }: { data: OverviewData }) {
  return (
    <div className={SECTION_RHYTHM}>
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell label="Total leads" value={data.totalLeads} sub="all time" />
        <StatCell label="Contacts" value={data.totalContacts} sub="in CRM" />
        <StatCell label="Active deals" value={data.totalDeals} />
        <StatCell
          label="Pipeline value"
          value={formatCurrency(data.totalPipelineValue)}
          sub="combined"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Leads over time" sub="Applications submitted per month">
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

        <ChartSection title="Pipeline by stage" sub="Deals per stage">
          <ChartContainer config={dealsConfig} className="h-[200px] w-full">
            <BarChart data={data.dealsByStage} barSize={18}>
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
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>
    </div>
  );
}
