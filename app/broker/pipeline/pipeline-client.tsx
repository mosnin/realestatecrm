'use client';

import { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Inbox,
} from 'lucide-react';
import { formatCalendarDateUtc, formatCompact } from '@/lib/formatting';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { SECTION_LABEL, BODY_MUTED } from '@/lib/typography';
import {
  StatCard,
  DotMatrix,
  SURFACE_CARD,
  ACCENT_CARD,
} from '@/components/ui/surface-card';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export type PipelineDeal = {
  id: string;
  title: string;
  value: number | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  closeDate: string | null;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  stageName: string;
  stageColor: string;
  agentName: string;
  agentUserId: string;
  createdAt: string;
  /**
   * Health classification from lib/deals/health.ts. Non-active deals
   * always land as 'on-track' — the classifier treats closed deals as
   * out-of-scope for risk tracking.
   */
  health: 'on-track' | 'at-risk' | 'stuck';
  /** Short human reason, e.g. "18 days in this stage". Empty for on-track. */
  healthReason: string;
};

export type StageInfo = {
  name: string;
  color: string;
  position: number;
};

export type RealtorInfo = {
  userId: string;
  name: string;
};

export type PipelineSummary = {
  totalPipelineValue: number;
  activeDeals: number;
  dealsWonThisMonth: number;
  dealsLostThisMonth: number;
  atRiskCount: number;
  stuckCount: number;
  /** Per-agent rollup, sorted most-stuck first. Empty when no risks. */
  agentRisk: Array<{ agentName: string; atRisk: number; stuck: number }>;
};

type Props = {
  deals: PipelineDeal[];
  stages: StageInfo[];
  realtors: RealtorInfo[];
  summary: PipelineSummary;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

const priorityTone: Record<string, string> = {
  HIGH: 'text-rose-700 dark:text-rose-400',
  MEDIUM: 'text-foreground',
  LOW: 'text-muted-foreground',
};

const statusTone: Record<string, string> = {
  active: 'text-foreground',
  won: 'text-foreground',
  lost: 'text-rose-700 dark:text-rose-400',
  on_hold: 'text-muted-foreground',
};

const statusLabels: Record<string, string> = {
  active: 'Active',
  won: 'Won',
  lost: 'Lost',
  on_hold: 'On hold',
};

// ── Component ────────────────────────────────────────────────────────────────

export function PipelineClient({ deals, stages, realtors, summary }: Props) {
  const reduce = useReducedMotion();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [realtorFilter, setRealtorFilter] = useState<string>('all');
  const [expandedRealtors, setExpandedRealtors] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<'value' | 'closeDate' | 'createdAt'>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (realtorFilter !== 'all' && d.agentUserId !== realtorFilter) return false;
      return true;
    });
  }, [deals, statusFilter, realtorFilter]);

  // Sorted deals
  const sortedDeals = useMemo(() => {
    return [...filteredDeals].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'value') {
        cmp = (a.value ?? 0) - (b.value ?? 0);
      } else if (sortField === 'closeDate') {
        const da = a.closeDate ? new Date(a.closeDate).getTime() : 0;
        const db = b.closeDate ? new Date(b.closeDate).getTime() : 0;
        cmp = da - db;
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredDeals, sortField, sortAsc]);

  // Pipeline by stage (across all agents)
  const stageAggregates = useMemo(() => {
    const counts = new Map<string, { count: number; value: number }>();
    for (const d of filteredDeals) {
      const prev = counts.get(d.stageName) ?? { count: 0, value: 0 };
      counts.set(d.stageName, {
        count: prev.count + 1,
        value: prev.value + (d.value ?? 0),
      });
    }
    return stages.map((s) => ({
      ...s,
      count: counts.get(s.name)?.count ?? 0,
      value: counts.get(s.name)?.value ?? 0,
    }));
  }, [filteredDeals, stages]);

  // Total deals sitting in a known stage — the denominator for the stage
  // dot-matrix coverage rows ("N of TOTAL in this stage").
  const stageTotal = stageAggregates.reduce((sum, s) => sum + s.count, 0);

  // Per-agent breakdown
  const agentGroups = useMemo(() => {
    const map = new Map<string, { name: string; deals: PipelineDeal[] }>();
    for (const r of realtors) {
      map.set(r.userId, { name: r.name, deals: [] });
    }
    for (const d of filteredDeals) {
      const group = map.get(d.agentUserId);
      if (group) group.deals.push(d);
    }
    return Array.from(map.entries())
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.deals.length - a.deals.length);
  }, [filteredDeals, realtors]);

  function toggleRealtor(userId: string) {
    setExpandedRealtors((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  return (
    <div className="space-y-10">
      {/* ── Snapshot — four surface-card stats. The strip fades up once on */}
      {/* mount and each focal number counts up to its settled value. */}
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {[
          { label: 'Pipeline', value: <AnimatedNumber value={summary.totalPipelineValue} format={formatCompact} />, foot: `${summary.activeDeals} active ${summary.activeDeals === 1 ? 'deal' : 'deals'}`, dim: summary.totalPipelineValue === 0 },
          { label: 'Active', value: <AnimatedNumber value={summary.activeDeals} />, foot: 'in flight right now', dim: summary.activeDeals === 0 },
          { label: 'Won this month', value: <AnimatedNumber value={summary.dealsWonThisMonth} />, foot: summary.dealsWonThisMonth === 1 ? 'deal closed' : 'deals closed', dim: summary.dealsWonThisMonth === 0 },
          { label: 'Lost this month', value: <AnimatedNumber value={summary.dealsLostThisMonth} />, foot: summary.dealsLostThisMonth === 1 ? 'deal lost' : 'deals lost', dim: summary.dealsLostThisMonth === 0 },
        ].map(({ label, value, foot, dim }) => (
          <StatCard key={label} label={label} value={value} sub={foot} dim={dim} />
        ))}
      </motion.section>

      {/* ── Risk strip. Healthy → calm surface card. Needs-attention → the */}
      {/* view's ONE solid accent card (the most alive surface). Meaning */}
      {/* survives on the accent card through the "stuck"/"at risk" words, */}
      {/* not colour alone. */}
      {summary.atRiskCount === 0 && summary.stuckCount === 0 && summary.activeDeals > 0 && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: reduce ? 0 : 0.05 }}
          className={cn(SURFACE_CARD, 'p-5 sm:p-6 flex items-start gap-3')}
        >
          <span className="mt-1.5 inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium">Everything&apos;s healthy.</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Nothing stuck or at risk across {summary.activeDeals} active deal
              {summary.activeDeals === 1 ? '' : 's'}.
            </p>
          </div>
        </motion.section>
      )}
      {(summary.atRiskCount > 0 || summary.stuckCount > 0) && (
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT, delay: reduce ? 0 : 0.05 }}
          className={cn(ACCENT_CARD, 'p-5 sm:p-6 space-y-3')}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Needs your attention.</p>
              <p className="text-[13px] text-white/85 mt-0.5">
                {summary.stuckCount > 0 && (
                  <>
                    <span className="font-semibold text-white tabular-nums">{summary.stuckCount}</span>{' '}
                    stuck
                  </>
                )}
                {summary.stuckCount > 0 && summary.atRiskCount > 0 && <span> · </span>}
                {summary.atRiskCount > 0 && (
                  <>
                    <span className="font-semibold text-white tabular-nums">{summary.atRiskCount}</span>{' '}
                    at risk
                  </>
                )}
              </p>
            </div>
          </div>
          {summary.agentRisk.length > 0 && (
            <ul className="divide-y divide-white/20 -mx-1">
              {summary.agentRisk.slice(0, 6).map((row) => (
                <li
                  key={row.agentName}
                  className="flex items-center justify-between gap-3 py-2.5 px-1 text-sm text-white"
                >
                  <span className="truncate min-w-0">{row.agentName}</span>
                  <span className="flex items-center gap-3 flex-shrink-0 text-[13px] tabular-nums text-white/90">
                    {row.stuck > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden />
                        {row.stuck} stuck
                      </span>
                    )}
                    {row.atRisk > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/60" aria-hidden />
                        {row.atRisk} at risk
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {summary.agentRisk.length > 6 && (
                <li className="py-2 px-1 text-[11px] text-white/70">
                  +{summary.agentRisk.length - 6} more
                </li>
              )}
            </ul>
          )}
        </motion.section>
      )}

      {/* ── Filter strip. Paper-flat row, no card. */}
      <section className="flex flex-wrap items-center gap-4 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2">
          <label htmlFor="pipeline-status" className={SECTION_LABEL}>Status</label>
          <select
            id="pipeline-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm border border-border/70 rounded-md px-2 h-8 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="on_hold">On hold</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="pipeline-agent" className={SECTION_LABEL}>Agent</label>
          <select
            id="pipeline-agent"
            value={realtorFilter}
            onChange={(e) => setRealtorFilter(e.target.value)}
            className="text-sm border border-border/70 rounded-md px-2 h-8 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All agents</option>
            {realtors.map((r) => (
              <option key={r.userId} value={r.userId}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <p className={cn(BODY_MUTED, 'ml-auto text-[13px] tabular-nums')}>
          {filteredDeals.length} {filteredDeals.length === 1 ? 'deal' : 'deals'}
        </p>
      </section>

      {/* ── Pipeline by stage — hairline section, no card chrome. */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <h2 className={SECTION_LABEL}>Pipeline by stage</h2>
        </div>

        {stageAggregates.length === 0 ? (
          <DashedEmpty>No stages yet.</DashedEmpty>
        ) : (
          <div className={cn(SURFACE_CARD, 'p-6 sm:p-7')}>
            <DotMatrix
              rows={stageAggregates.map((stage) => ({
                label: stage.name,
                filled: stage.count,
                total: stageTotal,
                value: (
                  <span className="inline-flex items-baseline gap-2">
                    <span className="font-medium text-foreground">{stage.count}</span>
                    {stage.value > 0 && <span>{formatCompact(stage.value)}</span>}
                  </span>
                ),
              }))}
            />
          </div>
        )}
      </section>

      {/* ── Per-agent breakdown — hairline-divided rows. */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <h2 className={SECTION_LABEL}>By agent</h2>
        </div>

        {agentGroups.length === 0 ? (
          <DashedEmpty>No realtors yet.</DashedEmpty>
        ) : (
          <ul className="divide-y divide-border/60">
            {agentGroups.map((agent) => {
              const isExpanded = expandedRealtors.has(agent.userId);
              const agentValue = agent.deals.reduce((s, d) => s + (d.value ?? 0), 0);
              const agentActive = agent.deals.filter((d) => d.status === 'active').length;
              const agentWon = agent.deals.filter((d) => d.status === 'won').length;

              return (
                <li key={agent.userId}>
                  <button
                    onClick={() => toggleRealtor(agent.userId)}
                    aria-expanded={isExpanded}
                    className="group w-full flex items-center gap-3 py-3 text-left hover:bg-foreground/[0.04] transition-colors rounded-md -mx-2 px-2"
                  >
                    {isExpanded ? (
                      <ChevronDown size={13} className="text-muted-foreground flex-shrink-0 transition-colors group-hover:text-foreground" />
                    ) : (
                      <ChevronRight size={13} className="text-muted-foreground flex-shrink-0 transition-colors group-hover:text-foreground" />
                    )}
                    <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center font-semibold text-xs text-foreground flex-shrink-0 transition-colors group-hover:bg-foreground/[0.10]">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{agent.name}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-4 text-[13px] text-muted-foreground flex-shrink-0 tabular-nums">
                      <span>{agent.deals.length} {agent.deals.length === 1 ? 'deal' : 'deals'}</span>
                      <span>{agentActive} active</span>
                      <span className="text-muted-foreground">{agentWon} won</span>
                      {agentValue > 0 && (
                        <span className="font-semibold text-foreground">
                          {formatCompact(agentValue)}
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && agent.deals.length > 0 && (
                    <div className="pb-3">
                      <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border/60">
                              <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Title</th>
                              <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Stage</th>
                              <th className="text-right px-2 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Value</th>
                              <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Priority</th>
                              <th className="text-left px-2 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Status</th>
                              <th className="text-right px-2 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Close</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {agent.deals.map((deal) => (
                              <tr key={deal.id} className="hover:bg-foreground/[0.04] transition-colors">
                                <td className="px-2 py-2.5 font-medium max-w-[220px]">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <HealthDot health={deal.health} reason={deal.healthReason} />
                                    <span className="truncate">{deal.title}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2.5">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: deal.stageColor }}
                                    />
                                    <span className="text-[13px]">{deal.stageName}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2.5 text-right tabular-nums">
                                  {deal.value != null ? formatCurrency(deal.value) : '—'}
                                </td>
                                <td className={cn('px-2 py-2.5 text-[13px]', priorityTone[deal.priority] ?? '')}>
                                  {deal.priority.charAt(0) + deal.priority.slice(1).toLowerCase()}
                                </td>
                                <td className={cn('px-2 py-2.5 text-[13px]', statusTone[deal.status] ?? '')}>
                                  {statusLabels[deal.status] ?? deal.status}
                                </td>
                                <td className="px-2 py-2.5 text-right text-[13px] text-muted-foreground">
                                  {formatCalendarDateUtc(deal.closeDate)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── All deals — hairline-divided rows. */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border/60">
          <h2 className={SECTION_LABEL}>All deals</h2>
        </div>

        {sortedDeals.length === 0 ? (
          <DashedEmpty>No deals match these filters.</DashedEmpty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Agent</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Stage</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    <button
                      onClick={() => handleSort('value')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Value
                      <ArrowUpDown size={10} />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Priority</th>
                  <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                    <button
                      onClick={() => handleSort('closeDate')}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      Close
                      <ArrowUpDown size={10} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sortedDeals.map((deal) => (
                  <tr key={deal.id} className="hover:bg-foreground/[0.04] transition-colors">
                    <td className="px-3 py-3 font-medium max-w-[240px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <HealthDot health={deal.health} reason={deal.healthReason} />
                        <span className="truncate">{deal.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{deal.agentName}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: deal.stageColor }}
                        />
                        <span className="text-[13px]">{deal.stageName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {deal.value != null ? formatCurrency(deal.value) : '—'}
                    </td>
                    <td className={cn('px-3 py-3 text-[13px]', priorityTone[deal.priority] ?? '')}>
                      {deal.priority.charAt(0) + deal.priority.slice(1).toLowerCase()}
                    </td>
                    <td className={cn('px-3 py-3 text-[13px]', statusTone[deal.status] ?? '')}>
                      {statusLabels[deal.status] ?? deal.status}
                    </td>
                    <td className="px-3 py-3 text-right text-[13px] text-muted-foreground">
                      {formatCalendarDateUtc(deal.closeDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Designed calm empty — a borderless surface card with a soft-circle icon over
 * the section's copy. Keep the copy first-person so Chippi stays the narrator.
 * Fades up quietly on mount; reduced motion drops straight to settled.
 */
function DashedEmpty({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className={cn(SURFACE_CARD, 'px-6 py-10 flex flex-col items-center text-center')}
    >
      <span
        aria-hidden
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.04] text-muted-foreground/60"
      >
        <Inbox size={20} strokeWidth={1.5} />
      </span>
      <p className={cn(BODY_MUTED, 'text-[13px]')}>{children}</p>
    </motion.div>
  );
}

/**
 * Indicator next to a deal title for its health state.
 *
 * On-track renders nothing (visual noise at 50+ deals). At-risk and stuck
 * use BOTH colour and shape so the signal survives red/green colourblind
 * vision — at 2px, tint alone was indistinguishable (audit finding):
 *   - at-risk → filled amber dot (3x3).
 *   - stuck   → filled rose dot (3x3) with a visible ring so the outline
 *               reads even in monochrome.
 */
function HealthDot({ health, reason }: { health: PipelineDeal['health']; reason: string }) {
  if (health === 'on-track') return null;
  const isStuck = health === 'stuck';
  const colorClass = isStuck
    ? 'bg-rose-500 ring-2 ring-rose-300 dark:ring-rose-900'
    : 'bg-amber-500';
  const label = isStuck ? 'Stuck' : 'At risk';
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${colorClass}`}
      title={reason ? `${label} — ${reason}` : label}
      aria-label={reason ? `${label}: ${reason}` : label}
    />
  );
}
