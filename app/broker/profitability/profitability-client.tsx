'use client';

/**
 * ProfitabilityClient — sortable per-agent profitability table for the broker
 * profitability page.
 *
 * Design rules (STYLESHEET.md), mirroring analytics-client.tsx:
 *   - Neutral-first: the agent/brokerage split bar uses foreground tints only.
 *     No brand orange, no decorative emerald/amber on data.
 *   - Focal numbers (net to brokerage, GCI) are serif TITLE_FONT + tabular-nums.
 *   - Sortable on every numeric column (click a header); name sorts ascending.
 *   - A team totals row anchors the table, computed from the passed totals so it
 *     can never disagree with the body.
 *   - StaggerList on the split cards so they land in sequence.
 *   - Cost-per-lead has NO real input in the data model, so it is surfaced as an
 *     explicit "needs a cost input" note — never a fabricated dollar figure. The
 *     efficiency column shows the lead -> deal conversion instead.
 *
 * All money/efficiency math is done server-side in lib/agent-profitability.ts;
 * this component only formats and sorts. No design-system primitives touched.
 */

import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp, Info, PieChart } from 'lucide-react';
import {
  SECTION_LABEL,
  TITLE_FONT,
  BODY_MUTED,
  CAPTION,
  META,
} from '@/lib/typography';
import { cn } from '@/lib/utils';
import { formatCurrency, formatCompact, getInitials } from '@/lib/formatting';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { AnimatedNumber } from '@/components/motion/animated-number';
import {
  SurfaceCard,
  AccentBarLabel,
  InsightStrip,
} from '@/components/ui/surface-card';
import { EASE_OUT } from '@/lib/motion';
import type {
  AgentProfitability,
  AgentProfitabilityTotals,
} from '@/lib/types';

interface Props {
  agents: AgentProfitability[];
  totals: AgentProfitabilityTotals;
}

// ── Agent vs brokerage split bar ──────────────────────────────────────────────
// Neutral two-tone bar: the brokerage's net is the solid (darker) fill, the
// agent + referral share the lighter remainder. The shape carries the signal,
// not color. Empty (no GCI) renders a flat track.

function SplitBar({ agent }: { agent: AgentProfitability }) {
  const reduce = useReducedMotion();
  const gci = agent.gci;
  const netPct = gci > 0 ? (agent.brokerageNet / gci) * 100 : 0;
  const agentPct = gci > 0 ? (agent.agentShare / gci) * 100 : 0;

  return (
    <div className="relative h-2 w-full rounded-full overflow-hidden bg-foreground/[0.05] flex">
      {/* Brokerage net — the darker, leading segment (what the house keeps). */}
      <motion.div
        className="h-full bg-foreground/[0.30]"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${netPct}%` }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
      {/* Agent share — the lighter remainder. Referral share is the untinted tail. */}
      <motion.div
        className="h-full bg-foreground/[0.12]"
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${agentPct}%` }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
      />
    </div>
  );
}

// ── Per-agent split card ──────────────────────────────────────────────────────

function AgentSplitCard({ agent }: { agent: AgentProfitability }) {
  return (
    <SurfaceCard className="p-4 sm:p-5 space-y-3">
      {/* Header: identity + focal net to brokerage (StatCard-style label) */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-foreground/[0.06] flex items-center justify-center text-xs font-medium text-foreground flex-shrink-0">
          {getInitials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate text-foreground">
            {agent.name}
          </p>
          <p className={cn(CAPTION, 'truncate')}>{agent.role}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <AccentBarLabel>Net to brokerage</AccentBarLabel>
          <p
            className="text-[21px] leading-tight tracking-tight tabular-nums text-foreground"
            style={TITLE_FONT}
          >
            <AnimatedNumber value={agent.brokerageNet} format={formatCompact} />
          </p>
        </div>
      </div>

      {/* Split bar + legend */}
      <div className="space-y-1.5 pt-1">
        <SplitBar agent={agent} />
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5">
          <span className={cn(META, 'inline-flex items-center gap-1')}>
            <span className="w-2 h-2 rounded-sm bg-foreground/[0.30]" aria-hidden />
            Brokerage {formatCompact(agent.brokerageNet)}
          </span>
          <span className={cn(META, 'inline-flex items-center gap-1')}>
            <span className="w-2 h-2 rounded-sm bg-foreground/[0.12]" aria-hidden />
            Agent {formatCompact(agent.agentShare)}
          </span>
          {agent.referralShare > 0 && (
            <span className={cn(META)}>
              Referral {formatCompact(agent.referralShare)}
            </span>
          )}
        </div>
      </div>

      {/* Footer: GCI + deals + efficiency */}
      <div className="pt-3 border-t border-border/60 flex items-center flex-wrap gap-x-3 gap-y-0.5">
        <span className={CAPTION}>
          GCI{' '}
          <span className="text-foreground font-medium tabular-nums">
            {formatCompact(agent.gci)}
          </span>
        </span>
        <span className={CAPTION}>
          {agent.dealsClosed} deal{agent.dealsClosed === 1 ? '' : 's'}
        </span>
        <span className={CAPTION}>
          {agent.leadToDealRate != null
            ? `${agent.leadToDealRate}% of ${agent.leads} leads`
            : 'no leads yet'}
        </span>
      </div>
    </SurfaceCard>
  );
}

// ── Sortable table header cell ─────────────────────────────────────────────────

type SortKey =
  | 'name'
  | 'leads'
  | 'dealsClosed'
  | 'gci'
  | 'agentShare'
  | 'brokerageNet'
  | 'leadToDealRate';

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
  sortKey: SortKey;
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={cn(
        SECTION_LABEL,
        align === 'right' ? 'text-right' : 'text-left',
        'px-3 py-2',
        className,
      )}
    >
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
            (dir === 'desc' ? (
              <ArrowDown size={10} aria-hidden />
            ) : (
              <ArrowUp size={10} aria-hidden />
            ))}
        </span>
      </button>
    </th>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export function ProfitabilityClient({ agents, totals }: Props) {
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'brokerageNet',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    const copy = [...agents];
    const { key, dir } = sort;
    copy.sort((a, b) => {
      if (key === 'name') {
        const cmp = a.name.localeCompare(b.name);
        return dir === 'asc' ? cmp : -cmp;
      }
      // leadToDealRate can be null — sort nulls to the bottom regardless of dir.
      if (key === 'leadToDealRate') {
        const va = a.leadToDealRate;
        const vb = b.leadToDealRate;
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return dir === 'asc' ? va - vb : vb - va;
      }
      const va = a[key] as number;
      const vb = b[key] as number;
      return dir === 'asc' ? va - vb : vb - va;
    });
    return copy;
  }, [agents, sort]);

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  const views = [
    { id: 'cards' as const, label: 'Splits' },
    { id: 'table' as const, label: 'Table' },
  ];

  return (
    <div className="space-y-6">
      {/* ── View toggle ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border/60 pb-0">
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
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                {isActive && (
                  <motion.span
                    layoutId="profitability-view-underline"
                    className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                    transition={{ duration: 0.22, ease: EASE_OUT }}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cards (split) view ──────────────────────────────────────────────── */}
      {view === 'cards' &&
        (sorted.length > 0 ? (
          <StaggerList className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sorted.map((agent) => (
              <StaggerItem key={agent.agentUserId}>
                <AgentSplitCard agent={agent} />
              </StaggerItem>
            ))}
          </StaggerList>
        ) : (
          <SurfaceCard className="px-6 py-10 flex flex-col items-center text-center">
            <span
              aria-hidden
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-foreground/[0.04] text-muted-foreground/60"
            >
              <PieChart size={20} strokeWidth={1.5} />
            </span>
            <p className="text-sm text-foreground">No agents with data yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Commission activity will appear here once deals close.
            </p>
          </SurfaceCard>
        ))}

      {/* ── Table view ──────────────────────────────────────────────────────── */}
      {view === 'table' && (
        <div className="overflow-x-auto">
          <p className={cn(META, 'mb-2')}>Tap a column to sort.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <Th
                  label="Agent"
                  sortKey="name"
                  align="left"
                  active={sort.key === 'name'}
                  dir={sort.dir}
                  onSort={handleSort}
                />
                <Th
                  label="Leads"
                  sortKey="leads"
                  active={sort.key === 'leads'}
                  dir={sort.dir}
                  onSort={handleSort}
                  className="hidden sm:table-cell"
                />
                <Th
                  label="Deals"
                  sortKey="dealsClosed"
                  active={sort.key === 'dealsClosed'}
                  dir={sort.dir}
                  onSort={handleSort}
                />
                <Th
                  label="GCI"
                  sortKey="gci"
                  active={sort.key === 'gci'}
                  dir={sort.dir}
                  onSort={handleSort}
                />
                <Th
                  label="Agent share"
                  sortKey="agentShare"
                  active={sort.key === 'agentShare'}
                  dir={sort.dir}
                  onSort={handleSort}
                  className="hidden md:table-cell"
                />
                <Th
                  label="Net to brokerage"
                  sortKey="brokerageNet"
                  active={sort.key === 'brokerageNet'}
                  dir={sort.dir}
                  onSort={handleSort}
                />
                <Th
                  label="Lead → deal"
                  sortKey="leadToDealRate"
                  active={sort.key === 'leadToDealRate'}
                  dir={sort.dir}
                  onSort={handleSort}
                  className="hidden lg:table-cell"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center">
                    <span className={BODY_MUTED}>No agent data yet.</span>
                  </td>
                </tr>
              )}
              {sorted.map((a) => (
                <tr
                  key={a.agentUserId}
                  className="hover:bg-foreground/[0.04] transition-colors duration-150"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[10px] font-medium text-foreground flex-shrink-0">
                        {getInitials(a.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate text-foreground">
                          {a.name}
                        </p>
                        <p className={cn(CAPTION, 'truncate')}>{a.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">
                    {a.leads.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">
                    {a.dealsClosed}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-foreground font-medium">
                    {formatCurrency(a.gci)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">
                    {formatCurrency(a.agentShare)}
                  </td>
                  {/* Net to brokerage — the focal data point per row: serif. */}
                  <td className="px-3 py-3 text-right">
                    <span
                      className="tabular-nums text-sm font-medium text-foreground"
                      style={TITLE_FONT}
                    >
                      {formatCurrency(a.brokerageNet)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden lg:table-cell">
                    {a.leadToDealRate != null ? `${a.leadToDealRate}%` : '—'}
                  </td>
                </tr>
              ))}

              {/* Team totals row — quiet emphasis, foreground/[0.04] bg. */}
              {sorted.length > 0 && (
                <tr className="bg-foreground/[0.04]">
                  <td className="px-3 py-3">
                    <p
                      className={cn(
                        SECTION_LABEL,
                        'pl-[calc(1.75rem+0.625rem)]',
                      )}
                    >
                      Team
                    </p>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden sm:table-cell">
                    {totals.leads.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground">
                    {totals.dealsClosed}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-foreground font-medium">
                    {formatCurrency(totals.gci)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden md:table-cell">
                    {formatCurrency(totals.agentShare)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span
                      className="tabular-nums text-sm font-medium text-foreground"
                      style={TITLE_FONT}
                    >
                      {formatCurrency(totals.brokerageNet)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-sm text-muted-foreground hidden lg:table-cell">
                    {totals.teamLeadToDealRate != null
                      ? `${totals.teamLeadToDealRate}%`
                      : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Efficiency / cost-per-lead note ─────────────────────────────────── */}
      {/* Cost-per-lead has no input in the data model. Rather than fabricate a
          number on a money surface, we state plainly that the efficiency metric
          shown is lead -> deal conversion and that cost-per-lead needs a spend
          input. Neutral info affordance, no alarming color. */}
      {!totals.costDataAvailable && (
        <div className="space-y-1.5">
          <InsightStrip icon={<Info size={15} aria-hidden />} className="mt-0">
            Efficiency shown is lead → deal conversion.
          </InsightStrip>
          <p className={cn(CAPTION, 'px-4')}>
            Cost-per-lead needs a marketing-spend input, which isn&rsquo;t
            tracked yet — so it&rsquo;s left out rather than estimated. Add
            per-agent or per-channel ad spend and it&rsquo;ll appear here.
          </p>
        </div>
      )}

      {/* Source note — keep the reporting surface honest about provenance. */}
      <p className={cn(CAPTION, 'text-muted-foreground/70')}>
        Figures come from the commission ledger — one row per won deal,
        snapshotted at close. GCI is the full commission a deal generated; the
        split shows the agent&rsquo;s cut versus the brokerage&rsquo;s net (plus
        any referral payout). Voided ledger rows are excluded.
      </p>
    </div>
  );
}
