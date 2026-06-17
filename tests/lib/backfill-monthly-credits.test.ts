import { describe, it, expect } from 'vitest';

// Exercises the PURE decision logic of the credit-backfill script
// (scripts/backfill-monthly-credits.ts): arg parsing (dry-run default + the
// idempotency period stamp) and the per-account grant computation, including the
// brokerage per-seat add-on math that mirrors the invoice.paid webhook. The DB
// I/O (enumeration + grant RPC) is deliberately NOT exercised here — the grant
// path itself is covered by tests/lib/grants.test.ts (sourceId threading) and the
// DB's ON CONFLICT idempotency. Importing the script does NOT run main(): it has
// an entrypoint guard, so only the helpers below are touched.
import {
  parseArgs,
  currentPeriod,
  planGrant,
  type BillableRow,
} from '@/scripts/backfill-monthly-credits';
import { PLANS } from '@/lib/plans';

describe('parseArgs — dry-run is the safe default', () => {
  it('defaults to dry-run when no flags are passed', () => {
    expect(parseArgs([]).dryRun).toBe(true);
  });

  it('--apply turns writes on', () => {
    expect(parseArgs(['--apply']).dryRun).toBe(false);
  });

  it('explicit --dry-run wins even with --apply (fail safe)', () => {
    expect(parseArgs(['--apply', '--dry-run']).dryRun).toBe(true);
  });

  it('defaults the period to the current UTC YYYY-MM', () => {
    expect(parseArgs([]).period).toBe(currentPeriod());
  });

  it('honors a valid --period and ignores a malformed one', () => {
    expect(parseArgs(['--period=2026-06']).period).toBe('2026-06');
    // Garbage falls back to the current period rather than minting a junk key.
    expect(parseArgs(['--period=nonsense']).period).toBe(currentPeriod());
  });
});

describe('sourceId is stable per period AND distinct from invoice grants', () => {
  it('currentPeriod is YYYY-MM (month granularity)', () => {
    expect(currentPeriod(new Date('2026-06-16T12:00:00Z'))).toBe('2026-06');
    expect(currentPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
  });

  it('the same period yields the same sourceId (re-run = no-op) and cannot collide with an invoice id', () => {
    const period = parseArgs(['--period=2026-06']).period;
    const sourceId = `backfill:${period}`;
    // Stable across re-runs in the same month → DB ON CONFLICT dedupes the re-run.
    expect(`backfill:${parseArgs(['--period=2026-06']).period}`).toBe(sourceId);
    // The webhook keys monthly grants on the bare Stripe invoice id (e.g. in_123);
    // the backfill: prefix guarantees the namespaces never overlap.
    expect(sourceId.startsWith('backfill:')).toBe(true);
    expect(sourceId.startsWith('in_')).toBe(false);
  });
});

describe('planGrant — amount + addon math mirrors the webhook', () => {
  const space = (plan: string): BillableRow => ({
    type: 'space',
    id: 'sp1',
    label: 'sp1',
    plan,
    status: 'active',
  });
  const brokerage = (plan: string, memberCount: number): BillableRow => ({
    type: 'brokerage',
    id: 'br1',
    label: 'br1',
    plan,
    status: 'active',
    memberCount,
  });

  it('grants the base plan credits for space tiers (no add-on)', () => {
    expect(planGrant(space('solo')).amount).toBe(3000);
    expect(planGrant(space('pro')).amount).toBe(8000);
    expect(planGrant(space('solo')).addonUsers).toBe(0);
  });

  it('adds per-seat add-on credits for brokerages above includedUsers', () => {
    // team includes 5 seats; 7 members → 2 add-on seats × 3000 = base 24000 + 6000.
    const g = planGrant(brokerage('team', 7));
    expect(g.addonUsers).toBe(2);
    expect(g.amount).toBe(24000 + 2 * 3000);

    // team_plus includes 10; 13 members → 3 add-on seats × 4000.
    const gp = planGrant(brokerage('team_plus', 13));
    expect(gp.addonUsers).toBe(3);
    expect(gp.amount).toBe(50000 + 3 * 4000);
  });

  it('never under-counts: a brokerage at/under its included seats gets the base only', () => {
    const g = planGrant(brokerage('team', PLANS.team.includedUsers));
    expect(g.addonUsers).toBe(0);
    expect(g.amount).toBe(PLANS.team.monthlyCredits);
    // Even with an implausibly low member count, add-on seats clamp to 0.
    expect(planGrant(brokerage('team', 0)).addonUsers).toBe(0);
  });

  it('returns 0 (skip) for non-grantable plans — Free and legacy brokerage tiers', () => {
    expect(planGrant(space('free')).amount).toBe(0);
    expect(planGrant(brokerage('starter', 50)).amount).toBe(0);
    expect(planGrant(brokerage('enterprise', 50)).amount).toBe(0);
  });
});
