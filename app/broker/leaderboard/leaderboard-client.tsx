'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RealtorStats } from './page';
import { Trophy, Medal, Flame, Zap, TrendingUp } from 'lucide-react';

type SortMetric = 'dealsClosed' | 'pipelineValue' | 'totalLeads' | 'conversionRate';

const metricLabels: Record<SortMetric, string> = {
  dealsClosed: 'Deals Closed',
  pipelineValue: 'Pipeline Value',
  totalLeads: 'Total Leads',
  conversionRate: 'Conversion Rate',
};

function formatValue(metric: SortMetric, value: number): string {
  if (metric === 'pipelineValue') {
    return value >= 1000
      ? `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
      : `$${value.toLocaleString()}`;
  }
  if (metric === 'conversionRate') return `${value}%`;
  return value.toLocaleString();
}

function BadgeChip({ badge }: { badge: string }) {
  const config: Record<string, { icon: typeof Trophy; color: string }> = {
    'Top Closer': { icon: Trophy, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
    'Fast Responder': { icon: Zap, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
    'Hot Streak': { icon: Flame, color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  };
  const c = config[badge] ?? { icon: Medal, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' };
  const Icon = c.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', c.color)}>
      <Icon size={10} />
      {badge}
    </span>
  );
}

function Avatar({ name, avatar, size = 'md' }: { name: string; avatar: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-16 h-16 text-xl' };
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={cn(sizes[size], 'rounded-full object-cover ring-2 ring-background')}
      />
    );
  }
  return (
    <div
      className={cn(
        sizes[size],
        'rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary ring-2 ring-background',
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Podium ────────────────────────────────────────────────────────────────────

function Podium({ top3, metric }: { top3: RealtorStats[]; metric: SortMetric }) {
  if (top3.length === 0) return null;

  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]] // silver, gold, bronze display order
    : top3.length === 2
    ? [top3[1], top3[0]]
    : [top3[0]];

  const heights = ['h-24', 'h-32', 'h-20'];
  const colors = [
    'from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600', // silver
    'from-amber-200 to-amber-400 dark:from-amber-700 dark:to-amber-500', // gold
    'from-orange-200 to-orange-300 dark:from-orange-800 dark:to-orange-700', // bronze
  ];
  const medals = ['2nd', '1st', '3rd'];
  const actualRanks = top3.length >= 3 ? [1, 0, 2] : top3.length === 2 ? [1, 0] : [0];

  return (
    <div className="flex items-end justify-center gap-3 md:gap-6 pt-4 pb-2">
      {podiumOrder.map((agent, displayIdx) => {
        const rankIdx = actualRanks[displayIdx];
        return (
          <div key={agent.userId} className="flex flex-col items-center gap-2">
            <Avatar name={agent.name} avatar={agent.avatar} size={rankIdx === 0 ? 'lg' : 'md'} />
            <div className="text-center">
              <p className={cn('font-semibold truncate max-w-[120px]', rankIdx === 0 ? 'text-sm' : 'text-xs')}>
                {agent.name}
              </p>
              <p className="text-xs text-muted-foreground font-medium">
                {formatValue(metric, agent[metric])}
              </p>
              <div className="flex flex-wrap gap-1 justify-center mt-1">
                {agent.badges.map((b) => (
                  <BadgeChip key={b} badge={b} />
                ))}
              </div>
            </div>
            <div
              className={cn(
                'w-20 md:w-28 rounded-t-lg bg-gradient-to-t flex items-start justify-center pt-2',
                heights[displayIdx] ?? 'h-20',
                colors[displayIdx] ?? colors[2],
              )}
            >
              <span className="text-xs font-bold opacity-70">
                {medals[displayIdx] ?? `${rankIdx + 1}th`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function LeaderboardClient({ initialStats }: { initialStats: RealtorStats[] }) {
  const [metric, setMetric] = useState<SortMetric>('dealsClosed');

  const sorted = useMemo(
    () => [...initialStats].sort((a, b) => b[metric] - a[metric]),
    [initialStats, metric],
  );

  const top3 = sorted.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Sort by</label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as SortMetric)}
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {(Object.entries(metricLabels) as [SortMetric, string][]).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <Card>
          <CardContent className="py-6 px-4">
            <Podium top3={top3} metric={metric} />
          </CardContent>
        </Card>
      )}

      {/* Full ranking table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground w-12">#</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Agent</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Deals Closed</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right hidden md:table-cell">
                    Pipeline Value
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right hidden md:table-cell">
                    Leads
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right hidden lg:table-cell">
                    Tours
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground text-right">Conv. Rate</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Badges</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((agent, idx) => (
                  <tr
                    key={agent.userId}
                    className={cn(
                      'border-b border-border/50 transition-colors hover:bg-muted/50',
                      idx < 3 && 'bg-muted/20',
                    )}
                  >
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                          idx === 0 && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
                          idx === 1 && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
                          idx === 2 && 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
                          idx >= 3 && 'text-muted-foreground',
                        )}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={agent.name} avatar={agent.avatar} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{agent.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{agent.dealsClosed}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                      {formatValue('pipelineValue', agent.pipelineValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{agent.totalLeads}</td>
                    <td className="px-4 py-3 text-right tabular-nums hidden lg:table-cell">{agent.toursCompleted}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="flex items-center justify-end gap-1">
                        {agent.conversionRate > 0 && <TrendingUp size={12} className="text-emerald-500" />}
                        {agent.conversionRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {agent.badges.map((b) => (
                          <BadgeChip key={b} badge={b} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
