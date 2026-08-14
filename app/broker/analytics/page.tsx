/**
 * /broker/analytics -- Brokerage conversion funnel + per-agent breakdown.
 *
 * Shows the rental-funnel metrics aggregated across all member spaces.
 * Gated with resolveBrokerContext() (broker_owner + broker_admin only).
 *
 * Structure:
 *   1. Status-sentence header (muted greeting -> serif h1 -> headline stat).
 *   2. Hairline-divider KPI strip (leads, won, pipeline value, team conversion).
 *   3. Client component: lead-type tab, team funnel, agent breakdown.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { supabase } from '@/lib/supabase';
import type { Metadata } from 'next';
import {
  TITLE_FONT,
  BODY_MUTED,
  SECTION_RHYTHM,
  PRIMARY_PILL,
} from '@/lib/typography';
import { StatCard, SURFACE_CARD, InsightStrip } from '@/components/ui/surface-card';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StaggerReveal, SplitReveal, AnimatedNumber } from '@/components/motion';
import {
  SPEED_TO_LEAD_WINDOW_DAYS,
  formatSpeedToLead,
  lastNDaysWindow,
  meaningfulSpeedToLead,
} from '@/lib/analytics/speed-to-lead';
import { fetchSpeedToLead } from '@/lib/analytics/speed-to-lead-data';
import { AnalyticsClient, type AgentFunnelData } from './analytics-client';
import { AnalyticsBreakdowns } from './breakdowns';
import {
  BROKER_COMMAND_HERO,
  BROKER_ORIENTATION,
  BROKER_PAGE_WIDE,
} from '@/components/broker/premium';
import {
  buildLeadSourceBreakdown,
  buildWinLossByReason,
} from '@/lib/broker-analytics-breakdowns';

export const metadata: Metadata = { title: 'Analytics -- Brokerage' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BrokerAnalyticsPage() {
  // Gate: broker_owner + broker_admin only.
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Fetch all members with their spaces.
  const members = await getBrokerageMembers(brokerage.id, { includeSpaceName: true });
  const spaceIds = members.map((m) => m.Space?.id).filter(Boolean) as string[];

  // Fetch contacts and deals across all member spaces.
  const [contactsRes, dealsRes, speedToLeadRes] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('id, spaceId, type, source')
          .in('spaceId', spaceIds)
          .limit(50000)
      : Promise.resolve({ data: [] }),
    spaceIds.length > 0
      ? supabase
          .from('Deal')
          .select('id, spaceId, status, value, closeReason')
          .in('spaceId', spaceIds)
          .limit(50000)
      : Promise.resolve({ data: [] }),
    // Brokerage-wide speed-to-lead. Additive: a failure hides the card
    // (never a fabricated number) instead of taking down the page.
    spaceIds.length > 0
      ? fetchSpeedToLead(spaceIds, lastNDaysWindow()).catch((err) => {
          console.error('[broker/analytics] speed-to-lead failed', err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // Honest-display gate: hidden below 3 leads reached in the window.
  const speed = meaningfulSpeedToLead(speedToLeadRes);

  const contacts = (contactsRes.data ?? []) as {
    id: string;
    spaceId: string;
    type: string;
    source: string | null;
  }[];
  const deals = (dealsRes.data ?? []) as {
    id: string;
    spaceId: string;
    status: string;
    value: number | null;
    closeReason: string | null;
  }[];

  // Build per-space stat buckets.
  type SpaceStats = {
    totalLeads: number;
    qualification: number;
    tour: number;
    application: number;
    activeDeals: number;
    wonDeals: number;
    lostDeals: number;
    wonValue: number;
  };

  const statsBySpace: Record<string, SpaceStats> = {};
  const blank = (): SpaceStats => ({
    totalLeads: 0,
    qualification: 0,
    tour: 0,
    application: 0,
    activeDeals: 0,
    wonDeals: 0,
    lostDeals: 0,
    wonValue: 0,
  });

  for (const c of contacts) {
    if (!statsBySpace[c.spaceId]) statsBySpace[c.spaceId] = blank();
    const s = statsBySpace[c.spaceId];
    s.totalLeads++;
    const t = (c.type ?? 'QUALIFICATION').toUpperCase();
    if (t === 'QUALIFICATION') s.qualification++;
    else if (t === 'TOUR') s.tour++;
    else if (t === 'APPLICATION') s.application++;
  }

  for (const d of deals) {
    if (!statsBySpace[d.spaceId]) statsBySpace[d.spaceId] = blank();
    const s = statsBySpace[d.spaceId];
    if (d.status === 'active') s.activeDeals++;
    else if (d.status === 'won') {
      s.wonDeals++;
      s.wonValue += d.value ?? 0;
    } else if (d.status === 'lost') s.lostDeals++;
  }

  // Build per-agent funnel data for the client component.
  const agentData: AgentFunnelData[] = members
    .filter((m) => m.Space?.id)
    .map((m) => {
      const sid = m.Space?.id ?? '';
      const s = statsBySpace[sid] ?? blank();
      const totalDeals = s.activeDeals + s.wonDeals + s.lostDeals;
      return {
        userId: m.userId,
        name: m.User?.name ?? m.User?.email ?? 'Unknown',
        email: m.User?.email ?? '',
        role:
          m.role === 'broker_owner'
            ? 'Owner'
            : m.role === 'broker_admin'
              ? 'Admin'
              : 'Real estate agent',
        totalLeads: s.totalLeads,
        qualification: s.qualification,
        tours: s.tour,
        applications: s.application,
        activeDeals: s.activeDeals,
        wonDeals: s.wonDeals,
        lostDeals: s.lostDeals,
        totalDeals,
        wonValue: s.wonValue,
        leadToTour: s.totalLeads > 0 ? Math.round((s.tour / s.totalLeads) * 100) : 0,
        tourToApp: s.tour > 0 ? Math.round((s.application / s.tour) * 100) : 0,
        appToDeal: s.application > 0 ? Math.round((totalDeals / s.application) * 100) : 0,
        overallConversion:
          s.totalLeads > 0 ? Math.round((s.wonDeals / s.totalLeads) * 100) : 0,
      };
    });

  // Team-level KPIs for the static strip (server-rendered, no client needed).
  const totalLeads = agentData.reduce((a, x) => a + x.totalLeads, 0);
  const totalWon = agentData.reduce((a, x) => a + x.wonDeals, 0);
  const totalPipelineValue = agentData.reduce((a, x) => a + x.wonValue, 0);
  const teamConversion =
    totalLeads > 0 ? Math.round((totalWon / totalLeads) * 100) : 0;
  const activeAgents = agentData.filter((a) => a.totalLeads > 0).length;

  // Status sentence -- one calm line under the h1.
  const statusSentence = (() => {
    if (totalLeads === 0) return 'No lead activity recorded yet.';
    const parts: string[] = [];
    parts.push(
      `${totalLeads.toLocaleString()} ${totalLeads === 1 ? 'lead' : 'leads'} across ${activeAgents} ${activeAgents === 1 ? 'agent' : 'agents'}`,
    );
    parts.push(`${teamConversion}% lead-to-win`);
    return parts.join(', ') + '.';
  })();

  const isEmpty = totalLeads === 0;

  // Additive breakdowns: lead-source attribution + win/loss-by-reason. Pure
  // aggregations over the same brokerage-wide rows already fetched above.
  const leadSourceRows = buildLeadSourceBreakdown(
    contacts.map((c) => ({ source: c.source, type: c.type })),
  );
  const winLossByReason = buildWinLossByReason(
    deals.map((d) => ({ status: d.status, closeReason: d.closeReason })),
  );

  return (
    <div className={cn(BROKER_PAGE_WIDE, 'max-w-7xl')} data-broker-premium-page="analytics" data-broker-family="performance-report">

      <header className={BROKER_COMMAND_HERO} data-route-orientation="performance-report">
        <div className="max-w-3xl space-y-4">
          <p className={BROKER_ORIENTATION}>Brokerage performance</p>
          <h1 className="text-4xl tracking-[-0.04em] text-foreground sm:text-5xl" style={TITLE_FONT}>
          <SplitReveal as="span" text="Analytics" />
          </h1>
          <p className={cn(BODY_MUTED, 'text-base')}>{statusSentence}</p>
          <Link href="/broker/forecast" className={PRIMARY_PILL}>Turn performance into forecast</Link>
        </div>
        <aside className="grid grid-cols-2 gap-x-8 gap-y-5 border-l chippi-dashboard-divider pl-6" aria-label="Performance outcome summary">
          <div><p className={BROKER_ORIENTATION}>Lead to win</p><p className="mt-1 text-3xl tabular-nums" style={TITLE_FONT}>{teamConversion}%</p></div>
          <div><p className={BROKER_ORIENTATION}>Active agents</p><p className="mt-1 text-3xl tabular-nums" style={TITLE_FONT}>{activeAgents}</p></div>
          <div><p className={BROKER_ORIENTATION}>Leads</p><p className="mt-1 text-2xl tabular-nums" style={TITLE_FONT}>{totalLeads}</p></div>
          <div><p className={BROKER_ORIENTATION}>Won</p><p className="mt-1 text-2xl tabular-nums" style={TITLE_FONT}>{totalWon}</p></div>
        </aside>
      </header>

      {isEmpty ? (
        /* Empty state -- flat surface card, calm copy */
        <div className={cn(SURFACE_CARD, 'px-5 py-10 text-center')}>
          <p className="text-sm text-foreground">No activity yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Lead and deal data across your member real estate agents will appear here.
          </p>
        </div>
      ) : (
        <div className={SECTION_RHYTHM} data-primary-work-geometry="performance-report">

          {/* KPI strip -- floating stat cards (reference language: flat,
              borderless, large radius, accent-bar labels). "Lead to win" is
              the view's ONE solid accent card. The cells cascade in once on
              first paint (StaggerReveal on the direct-child grid); each focal
              numeral then counts up on entry (AnimatedNumber, reduced-motion
              aware). */}
          <StaggerReveal
            as="section"
            className={cn(
              'grid grid-cols-2 gap-4',
              speed ? 'sm:grid-cols-3 lg:grid-cols-5' : 'sm:grid-cols-4',
            )}
          >
            <StatCard
              label="Total leads"
              value={<AnimatedNumber value={totalLeads} format={(n) => Math.round(n).toLocaleString()} />}
            />
            <StatCard
              label="Deals won"
              value={<AnimatedNumber value={totalWon} format={(n) => Math.round(n).toLocaleString()} />}
            />
            {speed && (
              <StatCard
                label="Speed to lead"
                value={<AnimatedNumber value={speed.medianMinutes} format={formatSpeedToLead} />}
                sub={`median · p90 ${formatSpeedToLead(speed.p90Minutes)} · ${SPEED_TO_LEAD_WINDOW_DAYS} days`}
              />
            )}
            <StatCard
              label="Pipeline value"
              value={<AnimatedNumber value={totalPipelineValue} format={formatCompact} />}
            />
            <StatCard
              label="Lead to win"
              value={<AnimatedNumber value={teamConversion} format={(n) => `${Math.round(n)}%`} />}
              accent
            />
          </StaggerReveal>

          {/* Honest computed read: how often Chippi's instant first-touch
              draft was the lead's actual first touch. Hidden unless it
              happened at least once in the window. */}
          {speed && speed.chippiFirstCount > 0 && (
            <InsightStrip icon={<Zap size={14} aria-hidden />}>
              Chippi sent the first touch on {speed.chippiFirstCount} of{' '}
              {speed.touchedCount} new leads reached in the last {SPEED_TO_LEAD_WINDOW_DAYS}{' '}
              days
            </InsightStrip>
          )}

          {/* Agent funnel + table -- all client interactivity */}
          <AnalyticsClient agents={agentData} />

          {/* Lead-source attribution + win/loss-by-reason breakdowns */}
          <AnalyticsBreakdowns leadSources={leadSourceRows} winLoss={winLossByReason} />

        </div>
      )}
    </div>
  );
}
