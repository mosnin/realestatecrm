/**
 * Per-agent profitability / ROI rollup for the broker analytics surface.
 *
 * This is the money-of-record view: for every agent in a brokerage, how much
 * gross commission they generated (GCI), how that splits between the agent and
 * the brokerage, what the brokerage NETS, how many deals they closed, and how
 * efficiently they turn leads into deals.
 *
 * ── Source of truth ─────────────────────────────────────────────────────────
 * Money is derived strictly from the CommissionLedger — one frozen row per won
 * deal in a brokerage-linked space (supabase/migrations/20260507000000_
 * commission_ledger.sql). The ledger is the artifact a broker reconciles
 * against bank deposits: amounts are snapshotted at close and survive later
 * rate edits. We do NOT re-derive GCI from Deal.value * commissionRate here —
 * that's a live proxy the forecast page uses for projections; for a reporting
 * surface the frozen ledger is the accurate number.
 *
 *   GCI (per ledger row) = agentAmount + brokerAmount + referralAmount
 *                          (the full gross commission the deal generated,
 *                           then divided among the parties)
 *   agentShare           = agentAmount      (the producing agent's cut)
 *   brokerageNet         = brokerAmount     (what the house keeps)
 *   referralShare        = referralAmount   (paid out to a referring party)
 *
 * `void` ledger rows are excluded from every dollar figure and the deal count —
 * a voided commission never happened. `pending` and `paid` both count toward
 * GCI/net (the commission was earned; payout status is a cash-flow question the
 * commissions page already answers, not a profitability one).
 *
 * ── Efficiency ──────────────────────────────────────────────────────────────
 * Lead volume is the Contact count in the agent's space. The efficiency metric
 * is the lead -> deal conversion rate (deals closed / leads acquired). We do
 * NOT compute cost-per-lead: no ad-spend / per-lead cost input exists anywhere
 * in the schema, and fabricating one on a money surface is worse than omitting
 * it. `costPerLead` is therefore always null and `costDataAvailable` is false,
 * so the UI can render an explicit "needs a cost input" affordance rather than
 * a made-up dollar figure. If a cost input is added later, only this file and
 * the type need to change — call sites read `costPerLead` / `costDataAvailable`.
 *
 * ── Purity ──────────────────────────────────────────────────────────────────
 * No Supabase, no I/O. Callers fetch the ledger rows + per-agent lead counts
 * and pass them in; these functions do the math. Mirrors lib/deal-metrics.ts
 * and lib/broker-analytics-breakdowns.ts so the same logic is trivially
 * unit-testable and can back a page, a Chippi tool, or an export.
 */

import type {
  AgentProfitability,
  AgentProfitabilityInput,
  AgentProfitabilityTotals,
  ProfitabilityLedgerRow,
} from '@/lib/types';

export type {
  AgentProfitability,
  AgentProfitabilityInput,
  AgentProfitabilityTotals,
  ProfitabilityLedgerRow,
} from '@/lib/types';

/**
 * Gross commission income for a single ledger row = the sum of every party's
 * slice. The ledger stores the split, not the gross, so GCI is reconstructed by
 * adding the slices back together. Missing amounts are treated as 0 (the column
 * is NOT NULL in the schema, but we guard so a malformed row can't poison a
 * sum). Negative amounts are clamped to 0 — a commission slice is never owed
 * back, and a stray negative would silently understate the brokerage's number.
 */
export function ledgerRowGci(row: ProfitabilityLedgerRow): number {
  const agent = Math.max(0, row.agentAmount ?? 0);
  const broker = Math.max(0, row.brokerAmount ?? 0);
  const referral = Math.max(0, row.referralAmount ?? 0);
  return agent + broker + referral;
}

/**
 * Build the per-agent profitability rollup.
 *
 * One row is emitted for EVERY agent in `inputs` — including agents with zero
 * ledger rows and/or zero leads — so the broker sees the whole roster, not just
 * producers. Sorted by brokerage net descending (the number a broker cares most
 * about), tie-broken by GCI then name for a stable order.
 *
 * @param ledger Ledger rows across the brokerage. Rows whose agentUserId is not
 *   in `inputs` are ignored (defensive: an orphaned ledger row for an
 *   ex-member shouldn't invent a phantom agent). `void` rows are skipped.
 * @param inputs One entry per agent the broker wants reported, carrying their
 *   identity and lead count.
 */
export function buildAgentProfitability(
  ledger: ProfitabilityLedgerRow[],
  inputs: AgentProfitabilityInput[],
): AgentProfitability[] {
  // Seed an accumulator for every requested agent so zero-deal agents still
  // appear with explicit zeros (never undefined / NaN).
  type Acc = {
    input: AgentProfitabilityInput;
    gci: number;
    agentShare: number;
    brokerageNet: number;
    referralShare: number;
    dealsClosed: number;
    pendingNet: number;
    paidNet: number;
  };

  const acc = new Map<string, Acc>();
  for (const input of inputs) {
    acc.set(input.agentUserId, {
      input,
      gci: 0,
      agentShare: 0,
      brokerageNet: 0,
      referralShare: 0,
      dealsClosed: 0,
      pendingNet: 0,
      paidNet: 0,
    });
  }

  for (const row of ledger) {
    if (row.status === 'void') continue; // voided commissions never happened
    const bucket = acc.get(row.agentUserId);
    if (!bucket) continue; // ledger row for an agent not in the requested set

    const agentShare = Math.max(0, row.agentAmount ?? 0);
    const brokerageNet = Math.max(0, row.brokerAmount ?? 0);
    const referralShare = Math.max(0, row.referralAmount ?? 0);

    bucket.gci += agentShare + brokerageNet + referralShare;
    bucket.agentShare += agentShare;
    bucket.brokerageNet += brokerageNet;
    bucket.referralShare += referralShare;
    bucket.dealsClosed += 1;
    if (row.status === 'paid') bucket.paidNet += brokerageNet;
    else bucket.pendingNet += brokerageNet; // 'pending' (void already skipped)
  }

  const rows: AgentProfitability[] = [...acc.values()].map((b) => {
    const leads = Math.max(0, b.input.leads);
    // Lead -> deal conversion. Guarded against divide-by-zero: an agent with no
    // leads has no conversion to report (null), distinct from a real 0%.
    const leadToDeal =
      leads > 0 ? Math.round((b.dealsClosed / leads) * 1000) / 10 : null;

    return {
      agentUserId: b.input.agentUserId,
      name: b.input.name,
      email: b.input.email,
      role: b.input.role,
      leads,
      dealsClosed: b.dealsClosed,
      gci: round2(b.gci),
      agentShare: round2(b.agentShare),
      brokerageNet: round2(b.brokerageNet),
      referralShare: round2(b.referralShare),
      pendingNet: round2(b.pendingNet),
      paidNet: round2(b.paidNet),
      leadToDealRate: leadToDeal,
      // No cost input exists in the data model — surface "needs input" rather
      // than fabricating a dollar figure on a money surface.
      costPerLead: null,
      costDataAvailable: false,
    };
  });

  rows.sort(
    (a, b) =>
      b.brokerageNet - a.brokerageNet ||
      b.gci - a.gci ||
      a.name.localeCompare(b.name),
  );

  return rows;
}

/**
 * Brokerage-wide totals across the per-agent rows. Computed from the same rows
 * the table renders so the footer can never disagree with the body.
 *
 * `teamLeadToDealRate` is computed from the SUMMED leads and deals (a true team
 * rate), not an average of per-agent rates — averaging rates would over-weight
 * low-volume agents. Null when the team has no leads at all.
 *
 * `activeAgents` counts agents who closed at least one deal — the producing
 * roster, useful for "X of Y agents produced" copy.
 */
export function summarizeAgentProfitability(
  rows: AgentProfitability[],
): AgentProfitabilityTotals {
  let gci = 0;
  let agentShare = 0;
  let brokerageNet = 0;
  let referralShare = 0;
  let pendingNet = 0;
  let paidNet = 0;
  let dealsClosed = 0;
  let leads = 0;
  let activeAgents = 0;

  for (const r of rows) {
    gci += r.gci;
    agentShare += r.agentShare;
    brokerageNet += r.brokerageNet;
    referralShare += r.referralShare;
    pendingNet += r.pendingNet;
    paidNet += r.paidNet;
    dealsClosed += r.dealsClosed;
    leads += r.leads;
    if (r.dealsClosed > 0) activeAgents += 1;
  }

  const teamLeadToDealRate =
    leads > 0 ? Math.round((dealsClosed / leads) * 1000) / 10 : null;

  return {
    agentCount: rows.length,
    activeAgents,
    leads,
    dealsClosed,
    gci: round2(gci),
    agentShare: round2(agentShare),
    brokerageNet: round2(brokerageNet),
    referralShare: round2(referralShare),
    pendingNet: round2(pendingNet),
    paidNet: round2(paidNet),
    teamLeadToDealRate,
    // Brokerage-wide cost-per-lead is unavailable for the same reason as the
    // per-agent figure: no spend input exists.
    costPerLead: null,
    costDataAvailable: false,
  };
}

/** Round to cents. Keeps summed floats from showing 30000.000000004. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
