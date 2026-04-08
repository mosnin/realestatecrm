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
} from 'recharts';
import { StatCard, ChartTooltip, ChartSection, useChartTheme, formatCurrency } from './chart-primitives';
import type { OverviewData } from '@/lib/analytics-data';

export function OverviewView({ data }: { data: OverviewData }) {
  const { tickColor, gridColor } = useChartTheme();

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
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data.leadsOverTime}>
              <defs>
                <linearGradient id="leadsGradOverview" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#leadsGradOverview)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection title="Pipeline by stage" sub="Deals and value per stage">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.dealsByStage} barSize={18}>
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
      </div>
    </div>
  );
}
