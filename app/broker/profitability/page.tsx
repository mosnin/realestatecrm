/**
 * /broker/profitability -- Per-agent profitability / ROI rollup.
 *
 * The deep-dive a broker can't get anywhere else: for every agent, the gross
 * commission they generated (GCI), how it splits between agent and house, what
 * the brokerage NETS, deals closed, and how efficiently they convert leads to
 * deals. Gated with resolveBrokerContext() (broker_owner + broker_admin only).
 *
 * ── Where the money comes from ──────────────────────────────────────────────
 * Dollar figures are read from CommissionLedger — the brokerage's frozen
 * money-of-record (one row per won deal, amounts snapshotted at close). This is
 * the same source /broker/commissions reconciles against; we reuse the FK-join-
 * with-memory-fallback fetch from that page. GCI/split/net are derived purely in
 * lib/agent-profitability.ts (see that file for the math). We deliberately do
 * NOT re-derive GCI from Deal.value * commissionRate — that's a live projection
 * proxy (the forecast page's job), wrong for a reporting surface.
 *
 * Lead volume per agent is the Contact count in their space (the same per-space
 * lead count the analytics funnel uses).
 *
 * Structure mirrors /broker/analytics:
 *   1. Status-sentence header (muted greeting -> serif h1 -> headline stat).
 *   2. Hairline-divider KPI strip (GCI, brokerage net, deals, team conversion).
 *   3. Client component: sortable per-agent table + cost-per-lead "needs input".
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { resolveBrokerContext } from '@/lib/agent/broker-context';
import { getBrokerageMembers } from '@/lib/brokerage-members';
import { supabase } from '@/lib/supabase';
import {
  buildAgentProfitability,
  summarizeAgentProfitability,
} from '@/lib/agent-profitability';
import type {
  AgentProfitabilityInput,
  ProfitabilityLedgerRow,
} from '@/lib/types';
import { formatCompact } from '@/lib/formatting';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_LABEL,
  STAT_NUMBER_COMPACT,
  SECTION_RHYTHM,
} from '@/lib/typography';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/motion/animated-number';
import { ProfitabilityClient } from './profitability-client';

export const metadata: Metadata = { title: 'Profitability -- Brokerage' };

// ── Ledger fetch ─────────────────────────────────────────────────────────────
// Brokerage-scoped CommissionLedger rows. Only the columns the rollup needs.
// No FK joins required here (we resolve agent identity from the membership
// roster, not the ledger), so this is a single flat query.

async function fetchLedgerRows(
  brokerageId: string,
): Promise<ProfitabilityLedgerRow[]> {
  const { data } = await supabase
    .from('CommissionLedger')
    .select('agentUserId, agentAmount, brokerAmount, referralAmount, status')
    .eq('brokerageId', brokerageId)
    .limit(20000);

  return ((data ?? []) as Array<{
    agentUserId: string;
    agentAmount: number | null;
    brokerAmount: number | null;
    referralAmount: number | null;
    status: 'pending' | 'paid' | 'void';
  }>).map((r) => ({
    agentUserId: r.agentUserId,
    agentAmount: r.agentAmount,
    brokerAmount: r.brokerAmount,
    referralAmount: r.referralAmount,
    status: r.status,
  }));
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BrokerProfitabilityPage() {
  // Gate: broker_owner + broker_admin only (same as /broker/analytics).
  const ctx = await resolveBrokerContext();
  if (!ctx) redirect('/');

  const { brokerage } = ctx;

  // Roster + their spaces (space ownerId === CommissionLedger.agentUserId).
  const members = await getBrokerageMembers(brokerage.id, {
    includeSpaceName: true,
  });
  const spaceIds = members
    .map((m) => m.Space?.id)
    .filter((id): id is string => Boolean(id));

  // Per-space lead counts (Contact rows) + the brokerage ledger, in parallel.
  const [contactsRes, ledger] = await Promise.all([
    spaceIds.length > 0
      ? supabase
          .from('Contact')
          .select('spaceId')
          .in('spaceId', spaceIds)
          .limit(100000)
      : Promise.resolve({ data: [] as { spaceId: string }[] }),
    fetchLedgerRows(brokerage.id),
  ]);

  const leadsBySpace = new Map<string, number>();
  for (const c of (contactsRes.data ?? []) as { spaceId: string }[]) {
    leadsBySpace.set(c.spaceId, (leadsBySpace.get(c.spaceId) ?? 0) + 1);
  }

  // Build one profitability input per member. The agent key is their space's
  // ownerId (= userId), which is exactly CommissionLedger.agentUserId.
  const inputs: AgentProfitabilityInput[] = members
    .filter((m) => m.Space?.id)
    .map((m) => {
      const sid = m.Space?.id as string;
      return {
        agentUserId: m.userId,
        name: m.User?.name ?? m.User?.email ?? 'Unknown',
        email: m.User?.email ?? '',
        role:
          m.role === 'broker_owner'
            ? 'Owner'
            : m.role === 'broker_admin'
              ? 'Admin'
              : 'Realtor',
        leads: leadsBySpace.get(sid) ?? 0,
      };
    });

  const agents = buildAgentProfitability(ledger, inputs);
  const totals = summarizeAgentProfitability(agents);

  // Status sentence -- one calm line under the h1.
  const statusSentence = (() => {
    if (totals.dealsClosed === 0 && totals.gci === 0) {
      return 'No closed-deal commissions on the ledger yet.';
    }
    const parts: string[] = [];
    parts.push(
      `${formatCompact(totals.gci)} GCI across ${totals.activeAgents} ${
        totals.activeAgents === 1 ? 'agent' : 'agents'
      }`,
    );
    parts.push(`${formatCompact(totals.brokerageNet)} net to the brokerage`);
    return parts.join(', ') + '.';
  })();

  const isEmpty = totals.gci === 0 && totals.dealsClosed === 0;

  return (
    <div className={cn('max-w-5xl mx-auto pb-56 md:pb-24', SECTION_RHYTHM)}>
      {/* Status-sentence header -- per STYLESHEET the-status-sentence-pattern */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>{brokerage.name}.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Profitability
        </h1>
        <p className={BODY_MUTED}>{statusSentence}</p>
      </header>

      {isEmpty ? (
        /* Empty state -- dashed-border house style per STYLESHEET Empty states */
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">No commission activity yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Per-agent GCI, splits, and net to the brokerage will appear here once
            deals close.
          </p>
        </div>
      ) : (
        <div className={SECTION_RHYTHM}>
          {/* KPI strip -- hairline-divider grid per STYLESHEET Surfaces */}
          <section
            className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60"
            aria-label="Brokerage profitability totals"
          >
            <div className="bg-background px-4 py-4 space-y-0.5">
              <p className={SECTION_LABEL}>Total GCI</p>
              <p className={cn(STAT_NUMBER_COMPACT)} style={TITLE_FONT}>
                <AnimatedNumber value={totals.gci} format={formatCompact} />
              </p>
            </div>
            <div className="bg-background px-4 py-4 space-y-0.5">
              <p className={SECTION_LABEL}>Net to brokerage</p>
              <p className={cn(STAT_NUMBER_COMPACT)} style={TITLE_FONT}>
                <AnimatedNumber value={totals.brokerageNet} format={formatCompact} />
              </p>
            </div>
            <div className="bg-background px-4 py-4 space-y-0.5">
              <p className={SECTION_LABEL}>Deals closed</p>
              <p className={cn(STAT_NUMBER_COMPACT)} style={TITLE_FONT}>
                <AnimatedNumber
                  value={totals.dealsClosed}
                  format={(n) => Math.round(n).toLocaleString()}
                />
              </p>
            </div>
            <div className="bg-background px-4 py-4 space-y-0.5">
              <p className={SECTION_LABEL}>Lead to deal</p>
              <p className={cn(STAT_NUMBER_COMPACT)} style={TITLE_FONT}>
                {totals.teamLeadToDealRate != null ? (
                  <AnimatedNumber
                    value={totals.teamLeadToDealRate}
                    format={(n) => `${Math.round(n * 10) / 10}%`}
                  />
                ) : (
                  '—'
                )}
              </p>
            </div>
          </section>

          {/* Per-agent table + efficiency / cost-per-lead handling */}
          <ProfitabilityClient agents={agents} totals={totals} />
        </div>
      )}
    </div>
  );
}
