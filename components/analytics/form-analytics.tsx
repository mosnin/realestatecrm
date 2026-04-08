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
import {
  Eye,
  CheckCircle2,
  TrendingDown,
  Users,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  UserPlus,
} from 'lucide-react';

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

interface RecentLead {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  scoreLabel: string | null;
  leadScore: number | null;
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
  recentLeads: RecentLead[];
}

// ── Number formatting ─────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remaining = s % 60;
  return remaining > 0 ? `${m}m ${remaining}s` : `${m}m`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  iconColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={`${label}: ${value}`}
      className={cn(
        'rounded-xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5 transition-shadow',
        highlight && 'ring-2 ring-primary/20 shadow-sm',
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        {Icon && (
          <Icon
            size={16}
            className={cn('flex-shrink-0', iconColor ?? 'text-muted-foreground/40')}
          />
        )}
      </div>
      <p className="text-2xl sm:text-3xl font-bold mt-1.5 tabular-nums tracking-tight">
        {typeof value === 'number' ? fmtNum(value) : value}
      </p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      )}
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color ?? p.fill }}>
          {p.name ?? p.dataKey}:{' '}
          <span className="font-semibold tabular-nums">{fmtNum(p.value)}</span>
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
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="font-semibold text-sm">{title}</p>
      {sub && (
        <p className="text-xs text-muted-foreground mt-0.5 mb-4">{sub}</p>
      )}
      {!sub && <div className="mb-4" />}
      <div className="overflow-x-auto -mx-1 px-1">{children}</div>
    </div>
  );
}

// ── Time period selector ──────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Last 7 days', shortLabel: '7 days', days: 7 },
  { label: 'Last 30 days', shortLabel: '30 days', days: 30 },
  { label: 'Last 90 days', shortLabel: '90 days', days: 90 },
] as const;

function TimePeriodSelector({
  days,
  onChange,
}: {
  days: number;
  onChange: (d: number) => void;
}) {
  return (
    <div role="group" aria-label="Time period" className="flex gap-1 p-1 rounded-lg bg-muted">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          type="button"
          role="radio"
          aria-checked={days === p.days}
          aria-label={p.label}
          onClick={() => onChange(p.days)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
            days === p.days
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p.shortLabel}
        </button>
      ))}
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ label, score }: { label: string | null; score: number | null }) {
  if (!label) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
        Unscored
      </span>
    );
  }
  const styles: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    cold: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium capitalize',
        styles[label] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {label}
      {score != null && <span className="tabular-nums">({score})</span>}
    </span>
  );
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5 animate-pulse">
      <div className="h-3 w-20 bg-muted rounded" />
      <div className="h-7 w-16 bg-muted rounded mt-2" />
      <div className="h-3 w-28 bg-muted rounded mt-2" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading form analytics">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded mt-2" />
          <div className="h-[200px] bg-muted/30 rounded mt-4" />
        </div>
        <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-3 w-48 bg-muted rounded mt-2" />
          <div className="space-y-3 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 bg-muted/30 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FormAnalytics({
  slug,
  standalone = false,
}: {
  slug: string;
  standalone?: boolean;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<FormAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detect dark mode for recharts SVG colors
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
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

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        {standalone && (
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Form Analytics</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Loading your form performance data...
              </p>
            </div>
          </div>
        )}
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        {standalone && (
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Form Analytics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track how applicants interact with your intake form
            </p>
          </div>
        )}
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-3"
        >
          <AlertTriangle size={24} className="mx-auto text-destructive/60" />
          <p className="text-sm text-foreground font-medium">{error}</p>
          <button
            onClick={fetchData}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (!data || data.totalStarts === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            {standalone && (
              <h1 className="text-xl font-semibold tracking-tight">Form Analytics</h1>
            )}
            <p className={cn('text-sm text-muted-foreground', standalone && 'mt-0.5')}>
              Track how applicants interact with your intake form
            </p>
          </div>
          <TimePeriodSelector days={days} onChange={setDays} />
        </div>
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Eye size={24} className="text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground">
            No form activity yet
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
            Analytics will appear here once applicants start interacting with your
            dynamic intake form. Share your form link to get started.
          </p>
        </div>
      </div>
    );
  }

  // ── Prepare chart data ────────────────────────────────────────────────────

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
      display: fmtDuration(step.avgDurationMs ?? 0),
    }));

  // Find worst drop-off step
  const worstDropOff = data.dropOff.reduce(
    (max: DropOffStep, step: DropOffStep) =>
      step.dropOffPercent > max.dropOffPercent ? step : max,
    { stepIndex: -1, stepTitle: '', dropOffPercent: 0 },
  );

  // Total avg time across all steps
  const totalAvgTime = data.funnel.reduce(
    (sum, step) => sum + (step.avgDurationMs ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Header with time selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {standalone && (
            <h1 className="text-xl font-semibold tracking-tight">
              Form Analytics
            </h1>
          )}
          {!standalone && (
            <p className="font-semibold text-sm">Form Performance</p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            How applicants interact with your intake form
          </p>
        </div>
        <TimePeriodSelector days={days} onChange={setDays} />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Visitors"
          value={data.totalStarts}
          sub={`${fmtNum(data.totalSessions)} unique sessions`}
          icon={Eye}
          iconColor="text-blue-500"
        />
        <StatCard
          label="Conversions"
          value={data.totalSubmits}
          sub={`${data.completionRate}% conversion rate`}
          icon={CheckCircle2}
          iconColor="text-emerald-500"
          highlight
        />
        <StatCard
          label="Abandoned"
          value={data.totalAbandons}
          sub={
            worstDropOff.dropOffPercent > 0
              ? `Worst: ${worstDropOff.stepTitle}`
              : 'No drop-off data'
          }
          icon={TrendingDown}
          iconColor="text-amber-500"
        />
        <StatCard
          label="Avg. Completion Time"
          value={totalAvgTime > 0 ? fmtDuration(totalAvgTime) : '--'}
          sub={
            data.funnel.length > 0
              ? `Across ${data.funnel.length} step${data.funnel.length !== 1 ? 's' : ''}`
              : 'No timing data'
          }
          icon={Clock}
          iconColor="text-violet-500"
        />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Completion funnel */}
        <ChartSection
          title="Completion Funnel"
          sub="Users retained at each step"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={funnelChartData} barSize={32}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={gridColor}
                vertical={false}
              />
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
                width={36}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="users" name="Users" radius={[6, 6, 0, 0]}>
                {funnelChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartSection>

        {/* Drop-off analysis */}
        {data.dropOff.length > 0 && (
          <ChartSection
            title="Drop-off Analysis"
            sub="Percentage of users lost at each step"
          >
            <div className="space-y-2.5">
              {data.dropOff.map((step: DropOffStep) => {
                const isWorst =
                  step.dropOffPercent === worstDropOff.dropOffPercent &&
                  step.dropOffPercent > 0;
                return (
                  <div key={step.stepIndex} className="flex items-center gap-3">
                    <span
                      className="text-xs text-muted-foreground w-28 text-right flex-shrink-0 truncate"
                      title={step.stepTitle}
                    >
                      {step.stepTitle}
                    </span>
                    <div className="flex-1 h-7 bg-muted/40 rounded-lg overflow-hidden relative">
                      <div
                        className={cn(
                          'h-full rounded-lg transition-all duration-500',
                          isWorst ? 'bg-red-500/70' : 'bg-amber-500/50',
                        )}
                        style={{
                          width: `${Math.max(step.dropOffPercent, 2)}%`,
                        }}
                        role="meter"
                        aria-valuenow={step.dropOffPercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${step.stepTitle}: ${step.dropOffPercent}% drop-off`}
                      />
                      <span className="absolute inset-y-0 left-2.5 flex items-center text-xs font-semibold text-foreground tabular-nums">
                        {step.dropOffPercent}%
                      </span>
                      {isWorst && (
                        <span className="absolute inset-y-0 right-2 flex items-center">
                          <ArrowDownRight size={12} className="text-red-500" />
                        </span>
                      )}
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
            title="Average Time per Step"
            sub="How long users spend on each form section"
          >
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={avgTimeData}
                layout="vertical"
                barSize={16}
                margin={{ left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridColor}
                  horizontal={false}
                />
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
                  radius={[0, 6, 6, 0]}
                  fill="hsl(var(--primary))"
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* Conversion rate card — visual callout */}
        <ChartSection title="Conversion Rate" sub="Visitors who completed the form">
          <div className="flex flex-col items-center justify-center py-4">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted/40"
                  strokeWidth="12"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.completionRate / 100) * 2 * Math.PI * 52} ${2 * Math.PI * 52}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold tabular-nums">
                  {data.completionRate}%
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              {fmtNum(data.totalSubmits)} of {fmtNum(data.totalStarts)} visitors
              completed the form
            </p>
          </div>
        </ChartSection>
      </div>

      {/* Recent leads */}
      {standalone && data.recentLeads && data.recentLeads.length > 0 && (
        <div className="rounded-xl border border-border bg-card">
          <div className="px-4 sm:px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-primary" />
              <p className="font-semibold text-sm">Recent Leads</p>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Last {data.recentLeads.length} applicants from form submissions
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 sm:px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Name
                  </th>
                  <th className="text-left px-4 sm:px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">
                    Email
                  </th>
                  <th className="text-left px-4 sm:px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Score
                  </th>
                  <th className="text-right px-4 sm:px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recentLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 sm:px-5 py-3 font-medium text-foreground">
                      {lead.name || 'Unknown'}
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-muted-foreground hidden sm:table-cell">
                      {lead.email || '--'}
                    </td>
                    <td className="px-4 sm:px-5 py-3">
                      <ScoreBadge label={lead.scoreLabel} score={lead.leadScore} />
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-right text-muted-foreground text-xs tabular-nums">
                      {timeAgo(lead.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
