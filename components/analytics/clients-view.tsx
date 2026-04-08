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
import { StatCard, ChartTooltip, ChartSection, useChartTheme } from './chart-primitives';
import type { ClientsAnalyticsData } from '@/lib/analytics-data';

export function ClientsView({ data }: { data: ClientsAnalyticsData }) {
  const { tickColor, gridColor } = useChartTheme();

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total contacts" value={data.totalContacts} sub="in CRM" />
        {data.contactsByStage.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.count} />
        ))}
        <StatCard
          label="Lead-to-client"
          value={data.leadToClientRate > 0 ? `${data.leadToClientRate}%` : '--'}
          sub={`from ${data.totalLeads} leads`}
        />
      </div>

      {/* Charts */}
      <div className="grid sm:grid-cols-2 gap-4">
        <ChartSection title="Contacts over time" sub="New contacts added each month">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.contactsOverTime}>
              <defs>
                <linearGradient id="contactsGradClients" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Contacts"
                stroke="#6366f1"
                fill="url(#contactsGradClients)"
                strokeWidth={2}
                dot={{ r: 3, fill: '#6366f1' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartSection>

        <ChartSection title="Contacts by stage" sub="Current distribution across stages">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.contactsByStage} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={tickColor} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} stroke={tickColor} width={28} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Contacts" radius={[4, 4, 0, 0]}>
                {data.contactsByStage.map((entry) => {
                  const colorMap: Record<string, string> = {
                    Qualifying: '#3b82f6', Tour: '#f59e0b', Applied: '#10b981',
                  };
                  return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>
      </div>

      {/* Conversion funnel */}
      <ChartSection title="Client pipeline funnel" sub="Conversion rates across your renter pipeline">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-center py-2">
          {data.contactFunnel.map((stage, i) => {
            const colors = ['#3b82f6', '#f59e0b', '#10b981'];
            const color = colors[i] ?? '#94a3b8';
            return (
              <div key={stage.label} className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-1">
                <div
                  className="rounded-lg flex items-center justify-center text-white font-bold text-lg tabular-nums w-16 h-14 sm:w-full sm:h-16 shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {stage.count}
                </div>
                <div className="sm:text-center">
                  <p className="text-sm font-semibold text-foreground">{stage.label}</p>
                  {i > 0 && (
                    <p className="text-xs text-muted-foreground">{stage.rate}% conversion</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-center gap-4 sm:gap-6 mt-3 text-xs text-muted-foreground flex-wrap">
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
  );
}
