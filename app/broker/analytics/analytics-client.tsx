'use client';

import { useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { SECTION_LABEL, TITLE_FONT, BODY_MUTED } from '@/lib/typography';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

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
  // Buyer funnel counts
  buyerLeads?: number;
  buyerPreApproved?: number;
  buyerShowings?: number;
  buyerOffers?: number;
  buyerUnderContract?: number;
  buyerClosed?: number;
}

interface Props {
  agents: AgentFunnelData[];
}

// ── Conversion threshold constants ───────────────────────────────────────────

const CONVERSION_THRESHOLD_GOOD = 20; // % above this = green
const CONVERSION_THRESHOLD_OK = 10;   // % above this = amber, below = muted

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Funnel bar component ─────────────────────────────────────────────────────

function FunnelBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 text-right flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 h-7 bg-muted/40 rounded-md overflow-hidden relative">
        <div
          className={`h-full rounded-md transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

// ── Agent funnel card (paper-flat) ───────────────────────────────────────────

function AgentFunnelCard({ agent }: { agent: AgentFunnelData }) {
  return (
    <section className="rounded-xl border border-border/70 bg-background px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-foreground/[0.06] flex items-center justify-center text-xs font-semibold text-foreground flex-shrink-0">
          {initials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{agent.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p
            className="text-[21px] leading-tight tracking-tight tabular-nums text-foreground"
            style={TITLE_FONT}
          >
            {agent.overallConversion}%
          </p>
          <p className="text-[10px] text-muted-foreground">Lead to win</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <FunnelBar label="Leads" value={agent.totalLeads} maxValue={agent.totalLeads} color="bg-violet-500/60" />
        <FunnelBar label="Tours" value={agent.tours} maxValue={agent.totalLeads} color="bg-purple-500/60" />
        <FunnelBar label="Applications" value={agent.applications} maxValue={agent.totalLeads} color="bg-amber-500/60" />
        <FunnelBar label="Deals" value={agent.totalDeals} maxValue={agent.totalLeads} color="bg-cyan-500/60" />
        <FunnelBar label="Won" value={agent.wonDeals} maxValue={agent.totalLeads} color="bg-emerald-500/60" />
      </div>

      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60">
        <div className="text-center">
          <p className="text-xs font-semibold tabular-nums">{agent.leadToTour}%</p>
          <p className="text-[10px] text-muted-foreground">Lead to tour</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold tabular-nums">{agent.tourToApp}%</p>
          <p className="text-[10px] text-muted-foreground">Tour to app</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold tabular-nums">{agent.appToDeal}%</p>
          <p className="text-[10px] text-muted-foreground">App to deal</p>
        </div>
      </div>
    </section>
  );
}

function BuyerFunnelCard({ agent }: { agent: AgentFunnelData }) {
  const maxVal = agent.buyerLeads ?? 0;
  const closeRate = maxVal > 0 ? Math.round(((agent.buyerClosed ?? 0) / maxVal) * 100) : 0;
  return (
    <section className="rounded-xl border border-border/70 bg-background px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-foreground/[0.06] flex items-center justify-center text-xs font-semibold text-foreground flex-shrink-0">
          {initials(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{agent.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p
            className="text-[21px] leading-tight tracking-tight tabular-nums text-foreground"
            style={TITLE_FONT}
          >
            {closeRate}%
          </p>
          <p className="text-[10px] text-muted-foreground">Lead to close</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <FunnelBar label="Leads" value={agent.buyerLeads ?? 0} maxValue={maxVal} color="bg-violet-500/60" />
        <FunnelBar label="Pre-approved" value={agent.buyerPreApproved ?? 0} maxValue={maxVal} color="bg-blue-500/60" />
        <FunnelBar label="Showings" value={agent.buyerShowings ?? 0} maxValue={maxVal} color="bg-purple-500/60" />
        <FunnelBar label="Offers" value={agent.buyerOffers ?? 0} maxValue={maxVal} color="bg-amber-500/60" />
        <FunnelBar label="Under contract" value={agent.buyerUnderContract ?? 0} maxValue={maxVal} color="bg-cyan-500/60" />
        <FunnelBar label="Closed" value={agent.buyerClosed ?? 0} maxValue={maxVal} color="bg-emerald-500/60" />
      </div>
    </section>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AnalyticsClient({ agents }: Props) {
  const [view, setView] = useState<'funnel' | 'table'>('funnel');
  const [sortBy, setSortBy] = useState<'name' | 'leads' | 'conversion'>('leads');
  const [leadType, setLeadType] = useState<'rental' | 'buyer'>('rental');

  const sorted = useMemo(() => {
    const copy = [...agents];
    if (sortBy === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === 'leads') copy.sort((a, b) => b.totalLeads - a.totalLeads);
    else if (sortBy === 'conversion') copy.sort((a, b) => b.overallConversion - a.overallConversion);
    return copy;
  }, [agents, sortBy]);

  // Team totals
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
      { totalLeads: 0, tours: 0, applications: 0, totalDeals: 0, wonDeals: 0, wonValue: 0 }
    );
    return {
      ...t,
      leadToTour: t.totalLeads > 0 ? Math.round((t.tours / t.totalLeads) * 100) : 0,
      tourToApp: t.tours > 0 ? Math.round((t.applications / t.tours) * 100) : 0,
      appToDeal: t.applications > 0 ? Math.round((t.totalDeals / t.applications) * 100) : 0,
      overallConversion: t.totalLeads > 0 ? Math.round((t.wonDeals / t.totalLeads) * 100) : 0,
    };
  }, [agents]);

  const buyerTeamTotals = useMemo(() => {
    const t = agents.reduce(
      (acc, a) => ({
        buyerLeads: acc.buyerLeads + (a.buyerLeads ?? 0),
        buyerPreApproved: acc.buyerPreApproved + (a.buyerPreApproved ?? 0),
        buyerShowings: acc.buyerShowings + (a.buyerShowings ?? 0),
        buyerOffers: acc.buyerOffers + (a.buyerOffers ?? 0),
        buyerUnderContract: acc.buyerUnderContract + (a.buyerUnderContract ?? 0),
        buyerClosed: acc.buyerClosed + (a.buyerClosed ?? 0),
      }),
      { buyerLeads: 0, buyerPreApproved: 0, buyerShowings: 0, buyerOffers: 0, buyerUnderContract: 0, buyerClosed: 0 }
    );
    return t;
  }, [agents]);

  // Headline conversion % for the team funnel block. Read big in serif.
  const teamHeadline = leadType === 'rental'
    ? teamTotals.overallConversion
    : buyerTeamTotals.buyerLeads > 0
      ? Math.round((buyerTeamTotals.buyerClosed / buyerTeamTotals.buyerLeads) * 100)
      : 0;

  return (
    <div className="space-y-10">
      {/* Lead type toggle — paper-flat segmented control on a hairline strip. */}
      <div role="tablist" aria-label="Lead type" className="flex items-center gap-1 border-b border-border/70 pb-0 -mb-2">
        {(['rental', 'buyer'] as const).map((t) => {
          const isActive = leadType === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setLeadType(t)}
              className={cn(
                'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'rental' ? 'Rental' : 'Buyer'}
              {isActive && (
                <span
                  className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Team funnel — hairline section, serif headline. The bars stay loud. */}
      <section className="rounded-xl border border-border/70 bg-background px-4 sm:px-5 py-5 space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap pb-3 border-b border-border/60">
          <div className="space-y-1">
            <p className={SECTION_LABEL}>Team funnel · {leadType === 'buyer' ? 'buyer' : 'rental'}</p>
            <p className="text-[13px] text-muted-foreground">Conversion top to bottom.</p>
          </div>
          <p
            className="text-[25px] leading-tight tracking-tight tabular-nums text-foreground"
            style={TITLE_FONT}
          >
            {teamHeadline}%
          </p>
        </div>

        {leadType === 'rental' ? (
          <div className="space-y-2">
            <FunnelBar label="Leads" value={teamTotals.totalLeads} maxValue={teamTotals.totalLeads} color="bg-violet-500/60" />
            <StepArrow pct={teamTotals.leadToTour} />
            <FunnelBar label="Tours" value={teamTotals.tours} maxValue={teamTotals.totalLeads} color="bg-purple-500/60" />
            <StepArrow pct={teamTotals.tourToApp} />
            <FunnelBar label="Applications" value={teamTotals.applications} maxValue={teamTotals.totalLeads} color="bg-amber-500/60" />
            <StepArrow pct={teamTotals.appToDeal} />
            <FunnelBar label="Deals" value={teamTotals.totalDeals} maxValue={teamTotals.totalLeads} color="bg-cyan-500/60" />
            <FunnelBar label="Won" value={teamTotals.wonDeals} maxValue={teamTotals.totalLeads} color="bg-emerald-500/60" />
          </div>
        ) : (
          <div className="space-y-2">
            <FunnelBar label="Leads" value={buyerTeamTotals.buyerLeads} maxValue={buyerTeamTotals.buyerLeads} color="bg-violet-500/60" />
            <StepArrow pct={buyerTeamTotals.buyerLeads > 0 ? Math.round((buyerTeamTotals.buyerPreApproved / buyerTeamTotals.buyerLeads) * 100) : 0} />
            <FunnelBar label="Pre-approved" value={buyerTeamTotals.buyerPreApproved} maxValue={buyerTeamTotals.buyerLeads} color="bg-blue-500/60" />
            <StepArrow pct={buyerTeamTotals.buyerPreApproved > 0 ? Math.round((buyerTeamTotals.buyerShowings / buyerTeamTotals.buyerPreApproved) * 100) : 0} />
            <FunnelBar label="Showings" value={buyerTeamTotals.buyerShowings} maxValue={buyerTeamTotals.buyerLeads} color="bg-purple-500/60" />
            <StepArrow pct={buyerTeamTotals.buyerShowings > 0 ? Math.round((buyerTeamTotals.buyerOffers / buyerTeamTotals.buyerShowings) * 100) : 0} />
            <FunnelBar label="Offers" value={buyerTeamTotals.buyerOffers} maxValue={buyerTeamTotals.buyerLeads} color="bg-amber-500/60" />
            <StepArrow pct={buyerTeamTotals.buyerOffers > 0 ? Math.round((buyerTeamTotals.buyerUnderContract / buyerTeamTotals.buyerOffers) * 100) : 0} />
            <FunnelBar label="Under contract" value={buyerTeamTotals.buyerUnderContract} maxValue={buyerTeamTotals.buyerLeads} color="bg-cyan-500/60" />
            <StepArrow pct={buyerTeamTotals.buyerUnderContract > 0 ? Math.round((buyerTeamTotals.buyerClosed / buyerTeamTotals.buyerUnderContract) * 100) : 0} />
            <FunnelBar label="Closed" value={buyerTeamTotals.buyerClosed} maxValue={buyerTeamTotals.buyerLeads} color="bg-emerald-500/60" />
          </div>
        )}
      </section>

      {/* View toggle + sort — paper-flat row. */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-border/60">
        <div role="tablist" aria-label="View" className="flex items-center">
          {(['funnel', 'table'] as const).map((v) => {
            const isActive = view === v;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setView(v)}
                className={cn(
                  'relative inline-flex items-center px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v === 'funnel' ? 'Funnels' : 'Table'}
                {isActive && (
                  <span
                    className="absolute bottom-[-13px] left-2 right-2 h-[2px] rounded-full bg-foreground"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="analytics-sort" className={SECTION_LABEL}>Sort</label>
          <select
            id="analytics-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm border border-border/70 rounded-md px-2 h-8 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="leads">Leads</option>
            <option value="conversion">Conversion</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {/* Funnel view */}
      {view === 'funnel' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((agent) =>
            leadType === 'buyer' ? (
              <BuyerFunnelCard key={agent.userId} agent={agent} />
            ) : (
              <AgentFunnelCard key={agent.userId} agent={agent} />
            )
          )}
          {sorted.length === 0 && (
            <div className="md:col-span-2 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
              <p className={cn(BODY_MUTED, 'text-[13px]')}>No agents with data yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Table view */}
      {view === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Agent</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Leads</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Tours</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden md:table-cell">Apps</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Deals</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden sm:table-cell">Won</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden lg:table-cell">Won value</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">L→T</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden md:table-cell">T→A</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground hidden md:table-cell">A→D</th>
                <th className="text-right px-3 py-2 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Conv.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sorted.map((a) => (
                <tr key={a.userId} className="hover:bg-foreground/[0.04] transition-colors">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[10px] font-semibold text-foreground flex-shrink-0">
                        {initials(a.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{a.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold">{a.totalLeads}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px]">{a.tours}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] hidden md:table-cell">{a.applications}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold">{a.totalDeals}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] hidden sm:table-cell text-emerald-700 dark:text-emerald-400 font-semibold">{a.wonDeals}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] hidden lg:table-cell text-emerald-700 dark:text-emerald-400">{formatCompact(a.wonValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px]">{a.leadToTour}%</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] hidden md:table-cell">{a.tourToApp}%</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] hidden md:table-cell">{a.appToDeal}%</td>
                  <td className="px-3 py-3 text-right">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums',
                      a.overallConversion >= CONVERSION_THRESHOLD_GOOD
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        : a.overallConversion >= CONVERSION_THRESHOLD_OK
                        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'bg-muted/60 text-muted-foreground',
                    )}>
                      {a.overallConversion}%
                    </span>
                  </td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center">
                    <span className={cn(BODY_MUTED, 'text-[13px]')}>No agent data yet.</span>
                  </td>
                </tr>
              )}
              {/* Totals row — quiet emphasis, no pedestal. */}
              {sorted.length > 0 && (
                <tr className="bg-muted/30">
                  <td className="px-3 py-3 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Team</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold">{teamTotals.totalLeads}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold">{teamTotals.tours}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold hidden md:table-cell">{teamTotals.applications}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold">{teamTotals.totalDeals}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold hidden sm:table-cell text-emerald-700 dark:text-emerald-400">{teamTotals.wonDeals}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold hidden lg:table-cell text-emerald-700 dark:text-emerald-400">{formatCompact(teamTotals.wonValue)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold">{teamTotals.leadToTour}%</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold hidden md:table-cell">{teamTotals.tourToApp}%</td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] font-semibold hidden md:table-cell">{teamTotals.appToDeal}%</td>
                  <td className="px-3 py-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums bg-foreground/[0.06] text-foreground">
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

/**
 * Inline step arrow between two funnel bars — small, muted, conversion %.
 * Lives between bars and reads in one glance.
 */
function StepArrow({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-1 pl-28">
      <ArrowRight size={10} className="text-muted-foreground/50" />
      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}
