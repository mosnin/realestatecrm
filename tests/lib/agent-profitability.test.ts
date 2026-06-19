/**
 * Unit tests for the per-agent profitability rollup (lib/agent-profitability.ts).
 *
 * This backs a money/reporting surface, so the assertions are exact on every
 * dollar figure: GCI, agent vs brokerage split, brokerage net, deal count, and
 * the lead -> deal conversion. We also pin the never-divide-by-zero and
 * zero-deal-agent behaviours, and the "no cost data -> needs input" contract.
 *
 * Pure functions, so no Supabase mock — assert directly on hand-built input
 * (mirrors tests/lib/broker-analytics-breakdowns.test.ts and deal-metrics).
 */
import { describe, it, expect } from 'vitest';
import {
  buildAgentProfitability,
  summarizeAgentProfitability,
  ledgerRowGci,
} from '@/lib/agent-profitability';
import type {
  AgentProfitabilityInput,
  ProfitabilityLedgerRow,
} from '@/lib/types';

// ── Fixtures ────────────────────────────────────────────────────────────────

function input(
  partial: Partial<AgentProfitabilityInput> &
    Pick<AgentProfitabilityInput, 'agentUserId'>,
): AgentProfitabilityInput {
  return {
    name: partial.name ?? `Agent ${partial.agentUserId}`,
    email: partial.email ?? `${partial.agentUserId}@example.com`,
    role: partial.role ?? 'Realtor',
    leads: partial.leads ?? 0,
    ...partial,
  };
}

function row(
  partial: Partial<ProfitabilityLedgerRow> &
    Pick<ProfitabilityLedgerRow, 'agentUserId'>,
): ProfitabilityLedgerRow {
  return {
    agentAmount: 0,
    brokerAmount: 0,
    referralAmount: 0,
    status: 'pending',
    ...partial,
  };
}

// ── ledgerRowGci ──────────────────────────────────────────────────────────────

describe('ledgerRowGci', () => {
  it('sums every party slice into gross commission income', () => {
    expect(
      ledgerRowGci(row({ agentUserId: 'a', agentAmount: 9000, brokerAmount: 3000, referralAmount: 1000 })),
    ).toBe(13000);
  });

  it('treats null slices as zero', () => {
    expect(
      ledgerRowGci(row({ agentUserId: 'a', agentAmount: null, brokerAmount: 3000, referralAmount: null })),
    ).toBe(3000);
  });

  it('clamps a stray negative slice to zero rather than understating GCI', () => {
    expect(
      ledgerRowGci(row({ agentUserId: 'a', agentAmount: 9000, brokerAmount: -500, referralAmount: 0 })),
    ).toBe(9000);
  });
});

// ── buildAgentProfitability ───────────────────────────────────────────────────

describe('buildAgentProfitability', () => {
  it('returns an empty list when there are no agents', () => {
    expect(buildAgentProfitability([], [])).toEqual([]);
  });

  it('computes GCI, splits, net, and deal count from ledger rows', () => {
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', agentAmount: 9000, brokerAmount: 3000, referralAmount: 0, status: 'paid' }),
        row({ agentUserId: 'a', agentAmount: 6000, brokerAmount: 2000, referralAmount: 0, status: 'pending' }),
      ],
      [input({ agentUserId: 'a', name: 'Alice', leads: 50 })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentUserId: 'a',
      name: 'Alice',
      dealsClosed: 2,
      gci: 20000, // (9000+3000) + (6000+2000)
      agentShare: 15000, // 9000 + 6000
      brokerageNet: 5000, // 3000 + 2000
      referralShare: 0,
      paidNet: 3000, // only the 'paid' row's broker slice
      pendingNet: 2000, // only the 'pending' row's broker slice
    });
  });

  it('splits referral commission out of GCI without inflating agent or brokerage shares', () => {
    const rows = buildAgentProfitability(
      [row({ agentUserId: 'a', agentAmount: 8000, brokerAmount: 2000, referralAmount: 1500 })],
      [input({ agentUserId: 'a', leads: 10 })],
    );
    expect(rows[0]).toMatchObject({
      gci: 11500,
      agentShare: 8000,
      brokerageNet: 2000,
      referralShare: 1500,
    });
  });

  it('excludes void ledger rows from every figure and the deal count', () => {
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', agentAmount: 9000, brokerAmount: 3000, status: 'paid' }),
        row({ agentUserId: 'a', agentAmount: 99999, brokerAmount: 99999, status: 'void' }),
      ],
      [input({ agentUserId: 'a', leads: 20 })],
    );
    expect(rows[0]).toMatchObject({
      dealsClosed: 1,
      gci: 12000,
      agentShare: 9000,
      brokerageNet: 3000,
    });
  });

  it('emits a zero row for an agent with no ledger rows (never undefined/NaN)', () => {
    const rows = buildAgentProfitability(
      [],
      [input({ agentUserId: 'z', name: 'Zoe', leads: 12 })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentUserId: 'z',
      name: 'Zoe',
      leads: 12,
      dealsClosed: 0,
      gci: 0,
      agentShare: 0,
      brokerageNet: 0,
      referralShare: 0,
      pendingNet: 0,
      paidNet: 0,
      leadToDealRate: 0, // 0 deals over 12 leads is a real 0%, not null
    });
  });

  it('reports leadToDealRate as null (not a divide-by-zero) when an agent has no leads', () => {
    const rows = buildAgentProfitability(
      [row({ agentUserId: 'a', agentAmount: 9000, brokerAmount: 3000 })],
      [input({ agentUserId: 'a', leads: 0 })],
    );
    expect(rows[0].leadToDealRate).toBeNull();
    // The deal still counts and money is still summed.
    expect(rows[0].dealsClosed).toBe(1);
    expect(rows[0].brokerageNet).toBe(3000);
  });

  it('computes lead -> deal conversion as a one-decimal percentage', () => {
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', brokerAmount: 1000 }),
        row({ agentUserId: 'a', brokerAmount: 1000 }),
        row({ agentUserId: 'a', brokerAmount: 1000 }),
      ],
      [input({ agentUserId: 'a', leads: 8 })], // 3/8 = 37.5%
    );
    expect(rows[0].leadToDealRate).toBe(37.5);
  });

  it('ignores ledger rows for agents not in the requested roster', () => {
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', brokerAmount: 3000 }),
        row({ agentUserId: 'ghost', brokerAmount: 999999 }), // not in inputs
      ],
      [input({ agentUserId: 'a', leads: 10 })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].agentUserId).toBe('a');
    expect(rows[0].brokerageNet).toBe(3000);
  });

  it('sorts by brokerage net descending, then GCI, then name', () => {
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', agentAmount: 1000, brokerAmount: 1000 }), // net 1000
        row({ agentUserId: 'b', agentAmount: 5000, brokerAmount: 5000 }), // net 5000
        row({ agentUserId: 'c', agentAmount: 1, brokerAmount: 0 }), // net 0
      ],
      [
        input({ agentUserId: 'a', name: 'A' }),
        input({ agentUserId: 'b', name: 'B' }),
        input({ agentUserId: 'c', name: 'C' }),
      ],
    );
    expect(rows.map((r) => r.agentUserId)).toEqual(['b', 'a', 'c']);
  });

  it('always reports cost-per-lead as unavailable (needs input, never fabricated)', () => {
    const rows = buildAgentProfitability(
      [row({ agentUserId: 'a', brokerAmount: 3000 })],
      [input({ agentUserId: 'a', leads: 10 })],
    );
    expect(rows[0].costPerLead).toBeNull();
    expect(rows[0].costDataAvailable).toBe(false);
  });

  it('treats null amounts and negative strays defensively per agent', () => {
    const rows = buildAgentProfitability(
      [row({ agentUserId: 'a', agentAmount: null, brokerAmount: -100, referralAmount: 2000 })],
      [input({ agentUserId: 'a', leads: 5 })],
    );
    expect(rows[0]).toMatchObject({
      agentShare: 0,
      brokerageNet: 0,
      referralShare: 2000,
      gci: 2000,
    });
  });
});

// ── summarizeAgentProfitability ───────────────────────────────────────────────

describe('summarizeAgentProfitability', () => {
  it('returns all-zero totals (and null team rate) for an empty roster', () => {
    expect(summarizeAgentProfitability([])).toEqual({
      agentCount: 0,
      activeAgents: 0,
      leads: 0,
      dealsClosed: 0,
      gci: 0,
      agentShare: 0,
      brokerageNet: 0,
      referralShare: 0,
      pendingNet: 0,
      paidNet: 0,
      teamLeadToDealRate: null,
      costPerLead: null,
      costDataAvailable: false,
    });
  });

  it('sums dollar figures and deal/lead counts across agents', () => {
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', agentAmount: 9000, brokerAmount: 3000, status: 'paid' }),
        row({ agentUserId: 'b', agentAmount: 6000, brokerAmount: 2000, referralAmount: 500, status: 'pending' }),
      ],
      [
        input({ agentUserId: 'a', leads: 40 }),
        input({ agentUserId: 'b', leads: 60 }),
      ],
    );
    const totals = summarizeAgentProfitability(rows);
    expect(totals).toMatchObject({
      agentCount: 2,
      activeAgents: 2,
      leads: 100,
      dealsClosed: 2,
      gci: 20500, // 12000 + 8500
      agentShare: 15000,
      brokerageNet: 5000,
      referralShare: 500,
      paidNet: 3000,
      pendingNet: 2000,
    });
  });

  it('counts only producing agents in activeAgents', () => {
    const rows = buildAgentProfitability(
      [row({ agentUserId: 'a', brokerAmount: 3000 })],
      [
        input({ agentUserId: 'a', leads: 10 }), // closed a deal
        input({ agentUserId: 'b', leads: 20 }), // zero deals
      ],
    );
    const totals = summarizeAgentProfitability(rows);
    expect(totals.agentCount).toBe(2);
    expect(totals.activeAgents).toBe(1);
  });

  it('computes the team conversion from summed leads/deals, not an average of rates', () => {
    // Agent a: 1 deal / 10 leads (10%). Agent b: 3 deals / 90 leads (3.33%).
    // Average of rates would be ~6.7%; true team rate is 4/100 = 4%.
    const rows = buildAgentProfitability(
      [
        row({ agentUserId: 'a', brokerAmount: 1 }),
        row({ agentUserId: 'b', brokerAmount: 1 }),
        row({ agentUserId: 'b', brokerAmount: 1 }),
        row({ agentUserId: 'b', brokerAmount: 1 }),
      ],
      [
        input({ agentUserId: 'a', leads: 10 }),
        input({ agentUserId: 'b', leads: 90 }),
      ],
    );
    expect(summarizeAgentProfitability(rows).teamLeadToDealRate).toBe(4);
  });

  it('reports a null team rate when the whole team has no leads', () => {
    const rows = buildAgentProfitability(
      [row({ agentUserId: 'a', brokerAmount: 3000 })],
      [input({ agentUserId: 'a', leads: 0 })],
    );
    expect(summarizeAgentProfitability(rows).teamLeadToDealRate).toBeNull();
  });

  it('keeps cost-per-lead unavailable at the team level too', () => {
    const totals = summarizeAgentProfitability(
      buildAgentProfitability(
        [row({ agentUserId: 'a', brokerAmount: 3000 })],
        [input({ agentUserId: 'a', leads: 10 })],
      ),
    );
    expect(totals.costPerLead).toBeNull();
    expect(totals.costDataAvailable).toBe(false);
  });
});
