import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { isPlatformAdmin } from '@/lib/permissions';
import { redirect } from 'next/navigation';
import { SurfaceCard } from '@/components/ui/surface-card';
import { Zap, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminPageHeader } from '@/app/admin/components/admin-page-header';
import { StatGrid } from '@/app/admin/components/stat-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { SECTION_LABEL, CAPTION, META } from '@/lib/typography';
import {
  costVsGrantTable,
  DEFAULT_COST_ALARM_MULTIPLIER,
  planLabel,
  type CostVsGrantRow,
} from '@/lib/billing/cost-vs-credits';

export const metadata = { title: 'Agent System Health — Admin' };

type AgentStatsResponse = {
  days: number;
  totalTasks: number;
  tasksByStatus: Record<string, number>;
  avgCostUsd: number;
  totalCostUsd: number;
  topTools: { name: string; callCount: number }[];
  errorRate: number;
  tasksBySpace: { spaceId: string; count: number; cost: number }[];
};

async function fetchAgentStats(days: number): Promise<AgentStatsResponse> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Parallel queries — all aggregated in JS, no full-table scans beyond the window
  const [statusRes, costRes, stepRes, spaceRes] = await Promise.all([
    supabase.from('AgentTask').select('status').gte('createdAt', since),
    supabase.from('AgentTask').select('estimatedCostUsd').gte('createdAt', since),
    supabase
      .from('ExecutionStep')
      .select('toolName, AgentTask!inner(createdAt)')
      .gte('AgentTask.createdAt', since),
    supabase.from('AgentTask').select('spaceId, estimatedCostUsd').gte('createdAt', since),
  ]);

  // Status breakdown
  const tasksByStatus: Record<string, number> = {};
  let totalTasks = 0;
  let failedCount = 0;
  for (const row of statusRes.data ?? []) {
    const s = row.status as string;
    tasksByStatus[s] = (tasksByStatus[s] ?? 0) + 1;
    totalTasks++;
    if (s === 'failed') failedCount++;
  }

  // Cost
  let totalCostUsd = 0;
  for (const row of (costRes.data ?? []) as { estimatedCostUsd: string | number | null }[]) {
    totalCostUsd += parseFloat(String(row.estimatedCostUsd ?? 0));
  }
  const avgCostUsd = totalTasks > 0 ? totalCostUsd / totalTasks : 0;

  // Top tools
  const toolCounts: Record<string, number> = {};
  for (const row of stepRes.data ?? []) {
    const name = (row as { toolName: string }).toolName;
    toolCounts[name] = (toolCounts[name] ?? 0) + 1;
  }
  const topTools = Object.entries(toolCounts)
    .map(([name, callCount]) => ({ name, callCount }))
    .sort((a, b) => b.callCount - a.callCount)
    .slice(0, 10);

  // By space
  const spaceMap: Record<string, { count: number; cost: number }> = {};
  for (const row of (spaceRes.data ?? []) as {
    spaceId: string;
    estimatedCostUsd: string | number | null;
  }[]) {
    const entry = spaceMap[row.spaceId] ?? { count: 0, cost: 0 };
    entry.count++;
    entry.cost += parseFloat(String(row.estimatedCostUsd ?? 0));
    spaceMap[row.spaceId] = entry;
  }
  const tasksBySpace = Object.entries(spaceMap)
    .map(([spaceId, { count, cost }]) => ({ spaceId, count, cost }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    days,
    totalTasks,
    tasksByStatus,
    avgCostUsd: parseFloat(avgCostUsd.toFixed(6)),
    totalCostUsd: parseFloat(totalCostUsd.toFixed(6)),
    topTools,
    errorRate: parseFloat((totalTasks > 0 ? (failedCount / totalTasks) * 100 : 0).toFixed(2)),
    tasksBySpace,
  };
}

async function fetchCostVsCredits(days: number): Promise<CostVsGrantRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data: usage, error: usageErr } = await unscoped(
    supabase.from('ChatUsage').select('spaceId, costUsd').gte('createdAt', since).limit(5_000),
    'admin agent-stats: ChatUsage cost vs credit grant across tenants',
  );
  if (usageErr) {
    console.error('[admin/agent-stats] ChatUsage cost scan failed', usageErr.message);
    return [];
  }

  const bySpace = new Map<string, number>();
  for (const row of (usage ?? []) as { spaceId: string; costUsd: string | number | null }[]) {
    bySpace.set(row.spaceId, (bySpace.get(row.spaceId) ?? 0) + parseFloat(String(row.costUsd ?? 0)));
  }
  const spaceIds = Array.from(bySpace.keys());
  if (spaceIds.length === 0) return [];

  const { data: spaces, error: spaceErr } = await supabase
    .from('Space')
    .select('id, plan')
    .in('id', spaceIds);
  if (spaceErr) {
    console.error('[admin/agent-stats] Space plan lookup failed', spaceErr.message);
    return [];
  }
  const planById = new Map(
    ((spaces ?? []) as { id: string; plan: string | null }[]).map((s) => [s.id, s.plan]),
  );
  return costVsGrantTable(
    spaceIds.map((spaceId) => ({
      spaceId,
      plan: planById.get(spaceId) ?? null,
      costUsd: bySpace.get(spaceId) ?? 0,
    })),
    days,
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default async function AgentStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect('/');

  const { days: daysParam } = await searchParams;
  const days = Math.min(Math.max(1, parseInt(daysParam ?? '30', 10) || 30), 365);

  let stats: AgentStatsResponse | null = null;
  let costVsCredits: CostVsGrantRow[] = [];
  let fetchError = false;

  try {
    [stats, costVsCredits] = await Promise.all([
      fetchAgentStats(days),
      fetchCostVsCredits(days),
    ]);
  } catch (err) {
    console.error('[admin/agent-stats] page data fetch failed', err);
    fetchError = true;
  }

  if (fetchError || !stats) {
    return (
      <div className="space-y-8 pb-12">
        <AdminPageHeader eyebrow="System." title="Agent health" />
        <EmptyState
          icon={Bot}
          title="Couldn’t load agent stats."
          description="This is usually temporary. Reload to try again."
          action={{ label: 'Reload', href: '/admin/agent-stats' }}
        />
      </div>
    );
  }

  const successCount =
    (stats.tasksByStatus['completed'] ?? 0);
  const successRate =
    stats.totalTasks > 0 ? (successCount / stats.totalTasks) * 100 : 0;

  // Build top tool bar widths
  const maxToolCalls = stats.topTools[0]?.callCount ?? 1;

  const dayOptions = [7, 30, 90];

  return (
    <div className="space-y-12 pb-12">
      <AdminPageHeader
        eyebrow="System."
        title="Agent health"
        subtitle={`Launch dashboard · last ${days} day${days !== 1 ? 's' : ''} · all spaces.`}
        actions={
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            {dayOptions.map((d) => (
              <a
                key={d}
                href={`/admin/agent-stats?days=${d}`}
                aria-current={days === d ? 'page' : undefined}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  days === d
                    ? 'bg-card text-foreground border border-border/70 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {d}d
              </a>
            ))}
          </div>
        }
      />

      {/* Key metrics — one hairline grid. Error rate rides along the success
          cell's sub-line and tints the cell amber past the alert threshold. */}
      <StatGrid
        aria-label="Agent task metrics"
        cells={[
          {
            label: 'Total tasks',
            value: stats.totalTasks,
            sub: `${fmt(stats.tasksByStatus['completed'] ?? 0)} completed`,
          },
          {
            label: 'Success rate',
            value: `${successRate.toFixed(1)}%`,
            sub: `${stats.errorRate.toFixed(1)}% error rate`,
            alert: stats.errorRate > 5,
          },
          { label: 'Total cost', value: fmtCost(stats.totalCostUsd), sub: 'USD · all spaces' },
          { label: 'Avg cost / task', value: fmtCost(stats.avgCostUsd), sub: 'per task run' },
        ]}
      />

      {/* Status breakdown + Top tools (side by side) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status breakdown */}
        <SurfaceCard>
            <h2 className={cn(SECTION_LABEL, 'mb-4')}>Tasks by status</h2>
            {stats.totalTasks === 0 ? (
              <EmptyState icon={Bot} title="No tasks in this period." size="sm" variant="flush" />
            ) : (
              <div className="space-y-3">
                {(['completed', 'running', 'queued', 'paused', 'failed', 'cancelled'] as const).map(
                  (status) => {
                    const count = stats!.tasksByStatus[status] ?? 0;
                    if (count === 0) return null;
                    const pct =
                      stats!.totalTasks > 0
                        ? Math.round((count / stats!.totalTasks) * 100)
                        : 0;
                    const color: Record<string, string> = {
                      completed: 'bg-emerald-500',
                      running: 'bg-blue-500',
                      queued: 'bg-slate-400',
                      paused: 'bg-amber-400',
                      failed: 'bg-red-500',
                      cancelled: 'bg-muted-foreground/40',
                    };
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground capitalize">{status}</span>
                          <span className="font-semibold tabular-nums">
                            {fmt(count)}{' '}
                            <span className="text-muted-foreground font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${color[status]}`}
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
        </SurfaceCard>

        {/* Top 10 Tools */}
        <SurfaceCard>
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-muted-foreground" />
              <h2 className={SECTION_LABEL}>Top tools</h2>
            </div>
            {stats.topTools.length === 0 ? (
              <EmptyState icon={Zap} title="No tool calls in this period." size="sm" variant="flush" />
            ) : (
              <ol className="space-y-2.5">
                {stats.topTools.map((tool, i) => {
                  const pct = Math.round((tool.callCount / maxToolCalls) * 100);
                  return (
                    <li key={tool.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground/60 tabular-nums w-4 text-right flex-shrink-0">
                            {i + 1}
                          </span>
                          <span className="font-medium font-mono truncate text-foreground">
                            {tool.name}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums flex-shrink-0 ml-3">
                          {fmt(tool.callCount)}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden ml-6">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
        </SurfaceCard>
      </div>

      <SurfaceCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className={SECTION_LABEL}>Chat cost vs credit grant</h2>
            <span className={CAPTION}>
              OpenRouter usage.cost · alert at {DEFAULT_COST_ALARM_MULTIPLIER}×
              pro-rated grant
            </span>
          </div>
          {costVsCredits.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No paid-space ChatUsage in this period."
              size="sm"
              variant="flush"
            />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium')}>Space</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium')}>Plan</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium text-right')}>Spend</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium text-right')}>Grant budget</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 font-medium text-right')}>Ratio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {costVsCredits.map((row) => {
                    const hot = row.ratio > DEFAULT_COST_ALARM_MULTIPLIER;
                    return (
                      <tr key={row.spaceId} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4">
                          <a
                            href={`/admin/spaces?q=${encodeURIComponent(row.spaceId)}`}
                            className="font-mono text-xs text-primary hover:underline underline-offset-2 truncate block max-w-[200px] sm:max-w-xs"
                            title={row.spaceId}
                          >
                            {row.spaceId}
                          </a>
                        </td>
                        <td className="py-2.5 pr-4 text-xs">{planLabel(row.plan)}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">
                          {fmtCost(row.costUsd)}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                          {fmtCost(row.budgetUsd)}
                        </td>
                        <td
                          className={cn(
                            'py-2.5 text-right tabular-nums font-semibold',
                            hot ? 'text-amber-600 dark:text-amber-400' : '',
                          )}
                        >
                          {row.ratio.toFixed(2)}×
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </SurfaceCard>

      {/* Tasks by Space */}
      <SurfaceCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className={SECTION_LABEL}>Tasks by space</h2>
            <span className={CAPTION}>Top 20 by task count</span>
          </div>
          {stats.tasksBySpace.length === 0 ? (
            <EmptyState icon={Bot} title="No task data in this period." size="sm" variant="flush" />
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-border">
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium')}>#</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium')}>Space ID</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 pr-4 font-medium text-right')}>Tasks</th>
                    <th className={cn(SECTION_LABEL, 'pb-2 font-medium text-right')}>Total cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.tasksBySpace.map((row, i) => (
                    <tr key={row.spaceId} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground tabular-nums">
                        {i + 1}
                      </td>
                      <td className="py-2.5 pr-4">
                        <a
                          href={`/admin/spaces?q=${encodeURIComponent(row.spaceId)}`}
                          className="font-mono text-xs text-primary hover:underline underline-offset-2 truncate block max-w-[200px] sm:max-w-xs"
                          title={row.spaceId}
                        >
                          {row.spaceId}
                        </a>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold">
                        {fmt(row.count)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-amber-600 dark:text-amber-400 font-semibold">
                        {fmtCost(row.cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border">
                  <tr>
                    <td colSpan={2} className="pt-3 text-xs text-muted-foreground font-medium">
                      Total (shown)
                    </td>
                    <td className="pt-3 text-right tabular-nums font-bold">
                      {fmt(stats.tasksBySpace.reduce((a, r) => a + r.count, 0))}
                    </td>
                    <td className="pt-3 text-right tabular-nums font-bold text-amber-600 dark:text-amber-400">
                      {fmtCost(stats.tasksBySpace.reduce((a, r) => a + r.cost, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
      </SurfaceCard>

      {/* Footer */}
      <p className={cn(META, 'text-center border-t border-border/60 pt-4')}>
        Last {days} day{days !== 1 ? 's' : ''} ·{' '}
        {new Date().toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })}
      </p>
    </div>
  );
}
