/**
 * Behavioral tests for persistCmaNarrative (lib/cma-narrative.ts) — the
 * write side of the pre-listing packet track: saving a generated narrative
 * onto its CmaReport row so app/api/cma/packet/[id]/route.ts can include it.
 *
 *   - writes narrative + narrativeUpdatedAt scoped by id AND spaceId
 *   - a cross-tenant / missing row (no match under that spaceId) resolves
 *     `false` without throwing — the `.eq('spaceId', ...)` IS the security
 *     boundary (CLAUDE.md), so this never writes into another workspace
 *   - a DB error surfaces as `false` (logged), not a thrown exception —
 *     losing the cached copy is recoverable, never worth failing an
 *     already-successful generation
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── Supabase mock — records every chained call so assertions can inspect
// exactly which columns / filters were used, mirroring the pattern in
// tests/api/cma-narrative.test.ts. ─────────────────────────────────────────
let updateResult: { data: { id: string } | null; error: { message: string } | null };
const calls: Array<[string, unknown[]]> = [];
let lastUpdatePayload: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn((payload: Record<string, unknown>) => {
      calls.push(['update', [payload]]);
      lastUpdatePayload = payload;
      return chain;
    });
    chain.eq = vi.fn((...args: unknown[]) => {
      calls.push(['eq', args]);
      return chain;
    });
    chain.select = vi.fn((...args: unknown[]) => {
      calls.push(['select', args]);
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      calls.push(['maybeSingle', []]);
      return Promise.resolve(updateResult);
    });
    void table;
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { persistCmaNarrative } from '@/lib/cma-narrative';
import { logger } from '@/lib/logger';

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  lastUpdatePayload = null;
  updateResult = { data: { id: 'report_1' }, error: null };
});

describe('persistCmaNarrative — writes scoped by spaceId', () => {
  it('updates narrative + narrativeUpdatedAt filtered by id AND spaceId, returns true on match', async () => {
    const ok = await persistCmaNarrative({
      spaceId: 'space_1',
      id: 'report_1',
      narrative: 'A grounded three-paragraph pitch.',
    });

    expect(ok).toBe(true);
    expect(lastUpdatePayload).toMatchObject({ narrative: 'A grounded three-paragraph pitch.' });
    expect(typeof (lastUpdatePayload as Record<string, unknown>).narrativeUpdatedAt).toBe('string');
    expect(calls).toContainEqual(['eq', ['id', 'report_1']]);
    expect(calls).toContainEqual(['eq', ['spaceId', 'space_1']]);
  });
});

describe('persistCmaNarrative — cross-tenant safety', () => {
  it('resolves false (no throw) when no row matches spaceId — never writes cross-tenant', async () => {
    updateResult = { data: null, error: null };

    const ok = await persistCmaNarrative({
      spaceId: 'space_other',
      id: 'report_1',
      narrative: 'Some pitch.',
    });

    expect(ok).toBe(false);
  });
});

describe('persistCmaNarrative — DB error handling', () => {
  it('returns false and logs a warning instead of throwing on a DB error', async () => {
    updateResult = { data: null, error: { message: 'connection reset' } };

    const ok = await persistCmaNarrative({
      spaceId: 'space_1',
      id: 'report_1',
      narrative: 'Some pitch.',
    });

    expect(ok).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      '[cma-narrative] persist failed',
      expect.objectContaining({ spaceId: 'space_1', id: 'report_1' }),
    );
  });
});
