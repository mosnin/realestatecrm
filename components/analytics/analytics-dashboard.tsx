'use client';

import { useState } from 'react';
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
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MonthBucket {
  month: string; // e.g. "Jan '25"
  count: number;
}

interface StageBar {
  name: string;
  count: number;
  value: number;
  color: string;
}

interface ScoreBucket {
  label: string;
  count: number;
}

interface ContactStageBucket {
  label: string;
  count: number;
}

export interface AnalyticsData {
  // summary
  totalLeads: number;
  totalContacts: number;
  totalDeals: number;
  totalPipelineValue: number;
  avgLeadScore: number | null;

  // time-series
  leadsOverTime: MonthBucket[];
  contactsOverTime: MonthBucket[];

  // breakdowns
  dealsByStage: StageBar[];
  leadScoreBuckets: ScoreBucket[];
  contactsByStage: ContactStageBucket[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const TABS = ['Overview', 'Leads', 'Deals', 'Contacts'] as const;
type Tab = (typeof TABS)[number];

// ─── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Custom tooltip ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}:{' '}
          <span className="font-semibold">
            {typeof p.value === 'number' && p.name === 'Value'
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────

function ChartSection({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="font-semibold text-sm">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-4">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === t
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {tab === 'Overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total leads" value={data.totalLeads} sub="all time" />
            <StatCard label="Contacts" value={data.totalContacts} sub="in CRM" />
            <StatCard label="Active deals" value={data.totalDeals} />
            <StatCard
              label="Pipeline value"
              value={formatCurrency(data.totalPipelineValue)}
              sub="combined"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Leads over time" sub="Applications submitted per month">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data.leadsOverTime}>
                  <defs>
                    <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="hsl(var(--primary))"
                    fill="url(#leadsGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Pipeline by stage" sub="Deals and value per stage">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.dealsByStage} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
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
      )}

      {/* ── Leads ── */}
      {tab === 'Leads' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total leads" value={data.totalLeads} sub="all time" />
            <StatCard
              label="Avg score"
              value={data.avgLeadScore != null ? Math.round(data.avgLeadScore) : '—'}
              sub="out of 100"
            />
            <StatCard
              label="Hot leads"
              value={data.leadScoreBuckets.find((b) => b.label === 'Hot')?.count ?? 0}
              sub="score ≥ 75"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Applications over time" sub="New leads submitted each month">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.leadsOverTime}>
                  <defs>
                    <linearGradient id="leadsGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="hsl(var(--primary))"
                    fill="url(#leadsGrad2)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Lead score distribution" sub="Leads grouped by AI score tier">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.leadScoreBuckets} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Leads" radius={[4, 4, 0, 0]}>
                    {data.leadScoreBuckets.map((entry) => {
                      const colorMap: Record<string, string> = {
                        Hot: '#10b981',
                        Warm: '#f59e0b',
                        Cold: '#94a3b8',
                        Unscored: '#cbd5e1',
                      };
                      return <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          </div>
        </div>
      )}

      {/* ── Deals ── */}
      {tab === 'Deals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total deals" value={data.totalDeals} />
            <StatCard
              label="Pipeline value"
              value={formatCurrency(data.totalPipelineValue)}
            />
            <StatCard
              label="Avg deal size"
              value={
                data.totalDeals > 0
                  ? formatCurrency(Math.round(data.totalPipelineValue / data.totalDeals))
                  : '—'
              }
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Deals per stage" sub="Number of deals in each pipeline stage">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.dealsByStage} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
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
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
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
        </div>
      )}

      {/* ── Contacts ── */}
      {tab === 'Contacts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Total contacts" value={data.totalContacts} />
            {data.contactsByStage.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.count} />
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <ChartSection title="Contacts over time" sub="New contacts added each month">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.contactsOverTime}>
                  <defs>
                    <linearGradient id="contactsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Contacts"
                    stroke="#6366f1"
                    fill="url(#contactsGrad)"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartSection>

            <ChartSection title="Contacts by stage" sub="Current distribution across stages">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.contactsByStage} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Contacts" radius={[4, 4, 0, 0]}>
                    {data.contactsByStage.map((entry) => {
                      const colorMap: Record<string, string> = {
                        Qualifying: '#3b82f6',
                        Tour: '#f59e0b',
                        Applied: '#10b981',
                      };
                      return (
                        <Cell key={entry.label} fill={colorMap[entry.label] ?? '#94a3b8'} />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartSection>
          </div>
        </div>
      )}
    </div>
  );
}
