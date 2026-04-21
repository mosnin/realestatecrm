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
} from 'recharts';
import {
  StatCard,
  ChartSection,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  formatCurrency,
} from './chart-primitives';
import type { ChartConfig } from './chart-primitives';
import type { OverviewData } from '@/lib/analytics-data';

const leadsConfig = {
  count: { label: 'Leads', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const dealsConfig = {
  count: { label: 'Deals', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export function OverviewView({ data }: { data: OverviewData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total leads" value={data.totalLeads} sub="all time" />
        <StatCard label="Contacts" value={data.totalContacts} sub="in CRM" />
        <StatCard label="Active deals" value={data.totalDeals} />
        <StatCard label="Pipeline value" value={formatCurrency(data.totalPipelineValue)} sub="combined" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Leads over time" sub="Applications submitted per month">
          <ChartContainer config={leadsConfig} className="h-[200px] w-full">
            <AreaChart data={data.leadsOverTime}>
              <defs>
                <linearGradient id="leadsGradOverview" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#leadsGradOverview)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        </ChartSection>

        <ChartSection title="Pipeline by stage" sub="Deals and value per stage">
          <ChartContainer config={dealsConfig} className="h-[200px] w-full">
            <BarChart data={data.dealsByStage} barSize={18}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
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
              <Bar dataKey="count" name="Deals" radius={[4, 4, 0, 0]}>
                {data.dealsByStage.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartSection>
      </div>
    </div>
  );
}
