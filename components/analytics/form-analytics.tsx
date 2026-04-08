'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FunnelStep {
  stepIndex: number;
  stepTitle: string;
  uniqueSessions: number;
  avgDurationMs: number | null;
}

interface DropOffStep {
  stepIndex: number;
  stepTitle: string;
  dropOffPercent: number;
}

interface FormAnalyticsResponse {
  days: number;
  totalSessions: number;
  totalStarts: number;
  totalSubmits: number;
  totalAbandons: number;
  completionRate: number;
  funnel: FunnelStep[];
  dropOff: DropOffStep[];
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card px-3 py-3 sm:px-5 sm:py-4',
        highlight && 'ring-2 ring-primary/20',
      )}
    >
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-xl sm:text-2xl font-bold mt-0.5 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}:{' '}
          <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

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
    <div className="rounded-lg border border-border bg-card p-3 sm:p-5">
      <p className="font-semibold text-sm">{title}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 mb-3 sm:mb-4">{sub}</p>}
      {!sub && <div className="mb-3 sm:mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">{children}</div>
    </div>
  );
}

// ── Time period selector ──────────────────────────────────────────────────────

const PERIODS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export function FormAnalytics({ slug }: { slug: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FormAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detect dark mode for recharts SVG colors
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const tickColor = isDark ? '#a1a1aa' : '#71717a';
  const gridColor = isDark ? '#27272a' : '#e4e4e7';

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/form-analytics?slug=${encodeURIComponent(slug)}&days=${days}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Failed to load analytics');
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load form analytics');
    } finally {
      setLoading(false);
    }
  }, [slug, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading form analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={fetchData}
          className="text-sm text-primary font-medium hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.totalStarts === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Form Performance</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              How applicants interact with your intake form
            </p>
          </div>
          <TimePeriodSelector days={days} onChange={setDays} />
        </div>
        <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No form analytics data yet. Analytics will appear here once applicants start using your dynamic intake form.
          </p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const funnelChartData = [
    { name: 'Started', users: data.totalStarts, color: '#3b82f6' },
    ...data.funnel.map((step: FunnelStep) => ({
      name: step.stepTitle,
      users: step.uniqueSessions,
      color: '#6366f1',
    })),
    { name: 'Submitted', users: data.totalSubmits, color: '#10b981' },
  ];

  const avgTimeData = data.funnel
    .filter((step: FunnelStep) => step.avgDurationMs != null)
    .map((step: FunnelStep) => ({
      name: step.stepTitle,
      seconds: Math.round((step.avgDurationMs ?? 0) / 1000),
    }));

  // Find worst drop-off step
  const worstDropOff = data.dropOff.reduce(
    (max: DropOffStep, step: DropOffStep) => (step.dropOffPercent > max.dropOffPercent ? step : max),
    { stepIndex: -1, stepTitle: '', dropOffPercent: 0 },
  );

  return (
    <div className="space-y-4">
      {/* Header with time selector */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Form Performance</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            How applicants interact with your intake form
          </p>
        </div>
        <TimePeriodSelector days={days} onChange={setDays} />
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Completion rate"
          value={`${data.completionRate}%`}
          sub={`${data.totalSubmits} of ${data.totalStarts} completed`}
          highlight
        />
        <StatCard
          label="Total starts"
          value={data.totalStarts}
          sub={`last ${data.days} days`}
        />
        <StatCard
          label="Submissions"
          value={data.totalSubmits}
          sub={`last ${data.days} days`}
        />
        <StatCard
          label="Abandons"
          value={data.totalAbandons}
          sub={
            worstDropOff.dropOffPercent > 0
              ? `Worst: ${worstDropOff.stepTitle}`
              : 'no drop-off data'
          }
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Completion funnel */}
        <ChartSection
          title="Completion funnel"
          sub="Users at each step of the form"
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={funnelChartData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: tickColor }}
                stroke={tickColor}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={50}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: tickColor }}
                stroke={tickColor}
                width={32}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="users" name="Users" radius={[4, 4, 0, 0]}>
                {funnelChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>

        {/* Drop-off rates */}
        {data.dropOff.length > 0 && (
          <ChartSection
            title="Drop-off rate per step"
            sub="Percentage of users lost at each step"
          >
            <div className="space-y-2">
              {data.dropOff.map((step: DropOffStep) => {
                const isWorst =
                  step.dropOffPercent === worstDropOff.dropOffPercent &&
                  step.dropOffPercent > 0;
                return (
                  <div key={step.stepIndex} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 text-right flex-shrink-0 truncate">
                      {step.stepTitle}
                    </span>
                    <div className="flex-1 h-6 bg-muted/40 rounded-md overflow-hidden relative">
                      <div
                        className={cn(
                          'h-full rounded-md transition-all duration-500',
                          isWorst ? 'bg-red-500/70' : 'bg-amber-500/50',
                        )}
                        style={{
                          width: `${Math.max(step.dropOffPercent, 2)}%`,
                        }}
                      />
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground tabular-nums">
                        {step.dropOffPercent}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartSection>
        )}

        {/* Avg time per step */}
        {avgTimeData.length > 0 && (
          <ChartSection
            title="Average time per step"
            sub="How long users spend on each form section"
          >
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={avgTimeData}
                layout="vertical"
                barSize={14}
                margin={{ left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: tickColor }}
                  stroke={tickColor}
                  unit="s"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10, fill: tickColor }}
                  stroke={tickColor}
                  width={90}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="seconds"
                  name="Avg seconds"
                  radius={[0, 4, 4, 0]}
                  fill="hsl(var(--primary))"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}
      </div>
    </div>
  );
}

// ── Time period selector component ──────────────────────────────────────────

function TimePeriodSelector({
  days,
  onChange,
}: {
  days: number;
  onChange: (d: number) => void;
}) {
  return (
    <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          type="button"
          onClick={() => onChange(p.days)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
            days === p.days
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
