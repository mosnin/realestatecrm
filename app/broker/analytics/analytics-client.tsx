'use client';

/**
 * AnalyticsClient — interactive funnel + table breakdown for the brokerage
 * analytics page.
 *
 * Design rules (STYLESHEET.md):
 *   - Neutral-first: funnel bars are bg-foreground/[0.08] on bg-foreground/[0.03]
 *     track. No brand orange, no emerald/amber/violet decorative fills.
 *   - Spacing: space-y-6 (SECTION_RHYTHM) between all major blocks.
 *   - Tab indicator: framer-motion layoutId shared element (the iOS move).
 *   - Conversion numbers: tabular-nums + TITLE_FONT serif on the focal stat;
 *     muted plain text elsewhere — not badged with color.
 *   - Table "Won" column: muted, not emerald; data is data, not a status signal.
 *   - StaggerList/StaggerItem on the agent card grid so rows land in sequence.
 *   - No buyer funnel tab — buyer fields have no server data; dead UI is cut.
 *
 * What the numbers say (the brutal-audit upgrade):
 *   - Every agent card carries a vs-team delta on its headline conversion AND a
 *     team benchmark on each pass-through, so "above / below the room" is legible
 *     without arithmetic.
 *   - A one-line "biggest leak" read names the weakest stage for the team and
 *     each agent — the single place to coach.
 *   - The table is sortable on every numeric column (click a header), and the
 *     weakest pass-through cell per row is quietly marked so bottlenecks surface.
 */

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { SECTION_LABEL, TITLE_FONT, BODY_MUTED, CAPTION, META } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import {
  biggestLeak,
  FUNNEL_STEP_LABEL as STEP_LABEL,
  type FunnelStepKey as StepKey,
} from '@/lib/broker-funnel';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentFunnelData {
  userId: string;
  name: string;
  email: string;
  role: string;
  totalLeads: number;
  qualification: number;
  tours: number;
  applications: number;
  activeDeals: number;
  wonDeals: number;
  lostDeals: number;
  totalDeals: number;
  wonValue: number;
  leadToTour: number;
  tourToApp: number;
  appToDeal: number;
  overallConversion: number;
}

interface Props {
  agents: AgentFunnelData[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function initials(name: string) {
  return name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ── vs-team delta chip ─────────────────────────────────────────────────────────
//
// Neutral by default. Above the room reads emerald, below reads amber (coaching,
// not failure — rose stays reserved for destructive). Exactly on pace is muted.

function DeltaChip({ delta }: { delta: number }) {
  const rounded = Math.round(delta);
  if (rounded === 0) {
    return (
      <span className={cn(META, 'inline-flex items-center gap-0.5')}>
        <Minus size={9} aria-hidden />
        on pace
      </span>
    );
  }
  const up = rounded > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
        up
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-amber-700 dark:text-amber-400',
      )}
    >
      {up ? <ArrowUp size={9} aria-hidden /> : <ArrowDown size={9} aria-hidden />}
      {up ? '+' : ''}
      {rounded} pt vs team
    </span>
  );
}

// ── Neutral funnel bar ────────────────────────────────────────────────────────
//
// STYLESHEET rule: neutral-first. Every bar uses the same foreground fill
// so the shape of the funnel is the signal — not the color.

function FunnelBar({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 2 : 0) : 0;

  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
      <span className={cn(CAPTION, 'text-right')}>
        {label}
      </span>
      <div className="relative h-6 rounded-sm overflow-hidden bg-foreground/[0.04]">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-sm bg-foreground/[0.12]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: EASE_OUT }}
        />
        <span className="absolute inset-y-0 left-2 flex items-center text-xs tabular-nums text-foreground font-medium">
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Step conversion label between funnel rows ─────────────────────────────────
//
// Carries an optional team benchmark so an agent's pass-through reads against
// the room. The benchmark is a quiet trailing note, never a second loud number.

function StepRate({
  pct,
  benchmark,
  weak,
}: {
  pct: number;
  benchmark?: number;
  weak?: boolean;
}) {
  return (
    <div className="pl-[calc(6rem+0.75rem)] flex items-center gap-2">
      <span
        className={cn(
          'text-[11px] tabular-nums',
          weak ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-muted-foreground',
        )}
      >
        {pct}% pass-through
      </span>
      {typeof benchmark === 'number' && (
        <span className={cn(META, 'tabular-nums')}>· team {benchmark}%</span>
      )}
    </div>
  );
}

// ── Agent funnel card ─────────────────────────────────────────────────────────

function AgentFunnelCard({
  agent,
  teamConversion,
  teamRates,
}: {
  agent: AgentFunnelData;
  teamConversion: number;
  teamRates: Record<StepKey, number>;
}) {
  const max = agent.totalLeads;
  const leak = biggestLeak(agent);
  const delta = agent.overallConversion - teamConversion;

  return (
    <section className="rounded-xl border border-border/70 bg-background px-4 py-4 space-y-3">
      {/* Header row: avatar + name + focal conversion % */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center text-xs font-medium text-foreground flex-shrink-0">
          {initials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate text-foreground">{agent.name}</p>
          <p className={cn(CAPTION, 'truncate')}>{agent.role}</p>
        </div>
        {/* Focal number: serif Times, tabular-nums + vs-team delta beneath */}
        <div className="text-right flex-shrink-0">
          <p
            className="text-[21px] leading-tight tracking-tight tabular-nums text-foreground"
            style={TITLE_FONT}
          >
            {agent.overallConversion}%
          </p>
          {agent.totalLeads > 0 ? (
            <DeltaChip delta={delta} />
          ) : (
            <p className={CAPTION}>lead to win</p>
          )}
        </div>
      </div>

      {/* Funnel bars: neutral fills, consistent label column. Each pass-through
          carries the team benchmark; the agent's weakest step is marked. */}
      <div className="space-y-1.5 pt-1">
        <FunnelBar label="Leads" value={agent.totalLeads} maxValue={max} />
        <StepRate
          pct={agent.leadToTour}
          benchmark={teamRates.leadToTour}
          weak={leak?.key === 'leadToTour'}
        />
        <FunnelBar label="Tours" value={agent.tours} maxValue={max} />
        <StepRate
          pct={agent.tourToApp}
          benchmark={teamRates.tourToApp}
          weak={leak?.key === 'tourToApp'}
        />
        <FunnelBar label="Applications" value={agent.applications} maxValue={max} />
        <StepRate
          pct={agent.appToDeal}
          benchmark={teamRates.appToDeal}
          weak={leak?.key === 'appToDeal'}
        />
        <FunnelBar label="Deals" value={agent.totalDeals} maxValue={max} />
        <FunnelBar label="Won" value={agent.wonDeals} maxValue={max} />
      </div>

      {/* Biggest leak — the one coaching sentence. Replaces the old footer that
          merely re-printed the three pass-through rates already shown inline. */}
      <div className="pt-3 border-t border-border/60">
        {leak ? (
          <p className={CAPTION}>
            Biggest leak:{' '}
            <span className="text-foreground font-medium">{STEP_LABEL[leak.key]}</span>{' '}
            <span className="tabular-nums">at {leak.pct}%</span>
          </p>
        ) : (
          <p className={CAPTION}>Not enough flow yet to spot a leak.</p>
        )}
      </div>
    </section>
  );
}

// ── Sortable table header cell ─────────────────────────────────────────────────

type TableSortKey =
  | 'name'
  | 'totalLeads'
  | 'tours'
  | 'applications'
  | 'totalDeals'
  | 'wonDeals'
  | 'wonValue'
  | 'leadToTour'
  | 'tourToApp'
  | 'appToDeal'
  | 'overallConversion';

function Th({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = 'right',
  className,
}: {
  label: string;
  sortKey: TableSortKey;
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: (k: TableSortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th className={cn(SECTION_LABEL, align === 'right' ? 'text-right' : 'text-left', 'px-3 py-2', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        <span className="w-2.5 inline-flex justify-center">
          {active &&
            (dir === 'desc' ? <ArrowDown size={10} aria-hidden /> : <ArrowUp size={10} aria-hidden />)}
        </span>
      </button>
    </th>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function AnalyticsClient({ agents }: Props) {
  const [view, setView] = useState<'funnel' | 'table'>('funnel');
  const [sortBy, setSortBy] = useState<'name' | 'leads' | 'conversion'>('leads');
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; dir: 'asc' | 'desc' }>({
    key: 'totalLeads',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    const copy = [...agents];
    if (sortBy === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'leads') copy.sort((a, b) => b.totalLeads - a.totalLeads);
    else if (sortBy === 'conversion') copy.sort((a, b) => b.overallConversion - a.overallConversion);
    return copy;
  }, [agents, sortBy]);

  // Team totals — computed from the full agent list (not sorted slice)
  const teamTotals = useMemo(() => {
    const t = agents.reduce(
      (acc, a) => ({
        totalLeads: acc.totalLeads + a.totalLeads,
        tours: acc.tours + a.tours,
        applications: acc.applications + a.applications,
        totalDeals: acc.totalDeals + a.totalDeals,
        wonDeals: acc.wonDeals + a.wonDeals,
        wonValue: acc.wonValue + a.wonValue,
      }),
      { totalLeads: 0, tours: 0, applications: 0, totalDeals: 0, wonDeals: 0, wonValue: 0 },
    );
    return {
      ...t,
      leadToTour: t.totalLeads > 0 ? Math.round((t.tours / t.totalLeads) * 100) : 0,
      tourToApp: t.tours > 0 ? Math.round((t.applications / t.tours) * 100) : 0,
      appToDeal: t.applications > 0 ? Math.round((t.totalDeals / t.applications) * 100) : 0,
      overallConversion: t.totalLeads > 0 ? Math.round((t.wonDeals / t.totalLeads) * 100) : 0,
    };
  }, [agents]);

  const teamRates = useMemo<Record<StepKey, number>>(
    () => ({
      leadToTour: teamTotals.leadToTour,
      tourToApp: teamTotals.tourToApp,
      appToDeal: teamTotals.appToDeal,
    }),
    [teamTotals],
  );

  const teamLeak = useMemo(
    () =>
      biggestLeak({
        totalLeads: teamTotals.totalLeads,
        tours: teamTotals.tours,
        applications: teamTotals.applications,
        leadToTour: teamTotals.leadToTour,
        tourToApp: teamTotals.tourToApp,
        appToDeal: teamTotals.appToDeal,
      }),
    [teamTotals],
  );

  // Table rows — independent sort so the broker can rank on any column.
  const tableRows = useMemo(() => {
    const copy = [...agents];
    const { key, dir } = tableSort;
    copy.sort((a, b) => {
      if (key === 'name') {
        const cmp = a.name.localeCompare(b.name);
        return dir === 'asc' ? cmp : -cmp;
      }
      const va = a[key] as number;
      const vb = b[key] as number;
      return dir === 'asc' ? va - vb : vb - va;
    });
    return copy;
  }, [agents, tableSort]);

  const handleTableSort = (key: TableSortKey) => {
    setTableSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  const views = [
    { id: 'funnel' as const, label: 'Funnels' },
    { id: 'table' as const, label: 'Table' },
  ];

  return (
    <div className="space-y-6">

      {/* ── Team funnel summary ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/70 bg-background px-4 sm:px-5 py-5 space-y-4">
        <div className="flex items-end justify-between gap-4 pb-3 border-b border-border/60">
          <div className="space-y-0.5">
            <p className={SECTION_LABEL}>Team funnel</p>
            <p className={BODY_MUTED}>Rental pipeline, all agents.</p>
          </div>
          {/* Focal number for the section */}
          <div className="text-right flex-shrink-0">
            <p
              className="text-[25px] leading-tight tracking-tight tabular-nums text-foreground"
              style={TITLE_FONT}
            >
              {teamTotals.overallConversion}%
            </p>
            <p className={CAPTION}>lead to win</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <FunnelBar label="Leads" value={teamTotals.totalLeads} maxValue={teamTotals.totalLeads} />
          <StepRate pct={teamTotals.leadToTour} weak={teamLeak?.key === 'leadToTour'} />
          <FunnelBar label="Tours" value={teamTotals.tours} maxValue={teamTotals.totalLeads} />
          <StepRate pct={teamTotals.tourToApp} weak={teamLeak?.key === 'tourToApp'} />
          <FunnelBar label="Applications" value={teamTotals.applications} maxValue={teamTotals.totalLeads} />
          <StepRate pct={teamTotals.appToDeal} weak={teamLeak?.key === 'appToDeal'} />
          <FunnelBar label="Deals" value={teamTotals.totalDeals} maxValue={teamTotals.totalLeads} />
          <FunnelBar label="Won" value={teamTotals.wonDeals} maxValue={teamTotals.totalLeads} />
        </div>

        {/* The team's single coaching headline — where the pipeline leaks most. */}
        {teamLeak && (
          <p className={cn(CAPTION, 'pt-1')}>
            The team loses the most at{' '}
            <span className="text-foreground font-medium">{STEP_LABEL[teamLeak.key]}</span>{' '}
            — only <span className="tabular-nums">{teamLeak.pct}%</span> get through.
          </p>
        )}
      </section>

      {/* ── View toggle + sort control ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border/60 pb-0">
        {/* Tab strip — framer-motion layoutId for the sliding underline */}
        <div role="tablist" aria-label="View" className="flex items-center">
          {views.map(({ id, label }) => {
            const isActive = view === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setView(id)}
                className={cn(
                  'relative inline-flex items-center px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                {isActive && (
                  <motion.span
                    layoutId="analytics-view-underline"
                    className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                    transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Sort control — only meaningful in the funnel (card) view; the table
            sorts via its own clickable headers. */}
        {view === 'funnel' && (
          <div className="flex items-center gap-2 pb-1">
            <label htmlFor="analytics-sort" className={SECTION_LABEL}>Sort</label>
            <select
              id="analytics-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-border/70 rounded-md px-2 h-8 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-1 focus:ring-offset-background transition-colors"
            >
              <option value="leads">Leads</option>
              <option value="conversion">Conversion</option>
              <option value="name">Name</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Funnel view ─────────────────────────────────────────────────────── */}
      {view === 'funnel' && (
        sorted.length > 0 ? (
          <StaggerList key={`funnel-${sortBy}`} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sorted.map((agent) => (
              <StaggerItem key={agent.userId}>
                <AgentFunnelCard
                  agent={agent}
                  teamConversion={teamTotals.overallConversion}
                  teamRates={teamRates}
                />
              </StaggerItem>
            ))}
          </StaggerList>
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className="text-sm text-foreground">No agents with data yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Lead activity will appear here once realtors are active.
            </p>
          </div>
        )
      )}

      {/* ── Table view ──────────────────────────────────────────────────────── */}
      {view === 'table' && (
        <div className="overflow-x-auto">
          <p className={cn(META, 'mb-2')}>Tap a column to sort.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <Th label="Agent" sortKey="name" align="left" active={tableSort.key === 'name'} dir={tableSort.dir} onSort={handleTableSort} />
                <Th label="Leads" sortKey="totalLeads" active={tableSort.key === 'totalLeads'} dir={tableSort.dir} onSort={handleTableSort} />
                <Th label="Tours" sortKey="tours" active={tableSort.key === 'tours'} dir={tableSort.dir} onSort={handleTableSort} />
                <Th label="Apps" sortKey="applications" active={tableSort.key === 'applications'} dir={tableSort.dir} onSort={handleTableSort} className="hidden md:table-cell" />
                <Th label="Deals" sortKey="totalDeals" active={tableSort.key === 'totalDeals'} dir={tableSort.dir} onSort={handleTableSort} />
                <Th label="Won" sortKey="wonDeals" active={tableSort.key === 'wonDeals'} dir={tableSort.dir} onSort={handleTableSort} className="hidden sm:table-cell" />
                <Th label="Won value" sortKey="wonValue" active={tableSort.key === 'wonValue'} dir={tableSort.dir} onSort={handleTableSort} className="hidden lg:table-cell" />
                <Th label="L → T" sortKey="leadToTour" active={tableSort.key === 'leadToTour'} dir={tableSort.dir} onSort={handleTableSort} />
                <Th label="T → A" sortKey="tourToApp" active={tableSort.key === 'tourToApp'} dir={tableSort.dir} onSort={handleTableSort} className="hidden md:table-cell" />
                <Th label="A → D" sortKey="appToDeal" active={tableSort.key === 'appToDeal'} dir={tableSort.dir} onSort={handleTableSort} className="hidden md:table-cell" />
                <Th label="Conv." sortKey="overallConversion" active={tableSort.key === 'overallConversion'} dir={tableSort.dir} onSort={handleTableSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center">
                    <span className={BODY_MUTED}>No agent data yet.</span>
                  </td>
                </tr>
              )}
              {tableRows.map((a) => {
                const leak = biggestLeak(a);
                return (
                  <tr
                    key={a.userId}
                    className="hover:bg-foreground/[0.04] transition-colors duration-150"
                  >
                    {/* Agent */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[10px] font-medium text-foreground flex-shrink-0">
                          {initials(a.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{a.name}</p>
                          <p className={cn(CAPTION, 'truncate')}>{a.role}</p>
                        </div>
                      </div>
                    </td>
                    {/* Volume numbers: tabular-nums, muted weight */}
                    <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-foreground">{a.totalLeads}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">{a.tours}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">{a.applications}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">{a.totalDeals}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">{a.wonDeals}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden lg:table-cell">{formatCompact(a.wonValue)}</td>
                    {/* Rate columns — the weakest carrying step reads amber */}
                    <td className={cn('px-3 py-3 text-right tabular-nums text-sm', leak?.key === 'leadToTour' ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-muted-foreground')}>{a.leadToTour}%</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums text-sm hidden md:table-cell', leak?.key === 'tourToApp' ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-muted-foreground')}>{a.tourToApp}%</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums text-sm hidden md:table-cell', leak?.key === 'appToDeal' ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-muted-foreground')}>{a.appToDeal}%</td>
                    {/* Overall conversion: tabular serif, the focal data point per row */}
                    <td className="px-3 py-3 text-right">
                      <span
                        className="tabular-nums text-sm font-medium text-foreground"
                        style={TITLE_FONT}
                      >
                        {a.overallConversion}%
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Team totals row — quiet emphasis, foreground/[0.04] bg */}
              {tableRows.length > 0 && (
                <tr className="bg-foreground/[0.04]">
                  <td className="px-3 py-3">
                    <p className={cn(SECTION_LABEL, 'pl-[calc(1.75rem+0.625rem)]')}>Team</p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm font-medium text-foreground">{teamTotals.totalLeads}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">{teamTotals.tours}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">{teamTotals.applications}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">{teamTotals.totalDeals}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">{teamTotals.wonDeals}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden lg:table-cell">{formatCompact(teamTotals.wonValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">{teamTotals.leadToTour}%</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">{teamTotals.tourToApp}%</td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">{teamTotals.appToDeal}%</td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className="tabular-nums text-sm font-medium text-foreground"
                      style={TITLE_FONT}
                    >
                      {teamTotals.overallConversion}%
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
