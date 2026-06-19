/**
 * Unit test for lib/esign.ts → dealHasOpenSignatureRequests, the detection
 * primitive behind the configurable e-sign close gate.
 *
 * Contract:
 *   - filters SignatureRequest by dealId + spaceId + status IN
 *     (created|sent|delivered) — the in-flight ("not signed yet") statuses.
 *   - hasOpen = openCount > 0.
 *   - a query error fails OPEN ({ hasOpen: false, openCount: 0 }) so a transient
 *     DB blip can't wedge an otherwise-valid close.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Capture the filters the helper applies, and drive the returned rows/error.
const calls = { eq: [] as Array<[string, unknown]>, in: [] as Array<[string, unknown]> };
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null };

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn((col: string, val: unknown) => {
    calls.eq.push([col, val]);
    return chain;
  });
  chain.in = vi.fn((col: string, val: unknown) => {
    calls.in.push([col, val]);
    return Promise.resolve(result);
  });
  return { supabase: { from: vi.fn(() => chain) } };
});

// Composio mock so importing lib/esign doesn't pull a live SDK.
vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: vi.fn(() => false),
  listConnectedAccountsForEntity: vi.fn(async () => ({ items: [] })),
  loadToolsForEntity: vi.fn(async () => []),
  executeToolForEntity: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(),
  uploadObject: vi.fn(),
  buildKey: (...s: string[]) => s.join('/'),
}));

import { dealHasOpenSignatureRequests } from '@/lib/esign';

beforeEach(() => {
  vi.clearAllMocks();
  calls.eq = [];
  calls.in = [];
  result = { data: [], error: null };
});

describe('dealHasOpenSignatureRequests', () => {
  it('scopes to dealId + spaceId and filters to in-flight statuses', async () => {
    result = { data: [], error: null };
    await dealHasOpenSignatureRequests('deal_1', 'space_1');
    expect(calls.eq).toContainEqual(['dealId', 'deal_1']);
    expect(calls.eq).toContainEqual(['spaceId', 'space_1']);
    // Only created/sent/delivered count as open; terminals are excluded.
    expect(calls.in).toHaveLength(1);
    expect(calls.in[0][0]).toBe('status');
    expect(calls.in[0][1]).toEqual(['created', 'sent', 'delivered']);
  });

  it('hasOpen=true with a positive count when in-flight rows exist', async () => {
    result = { data: [{ id: 'a', status: 'sent' }, { id: 'b', status: 'delivered' }], error: null };
    await expect(dealHasOpenSignatureRequests('deal_1', 'space_1')).resolves.toEqual({
      hasOpen: true,
      openCount: 2,
    });
  });

  it('hasOpen=false when no in-flight rows', async () => {
    result = { data: [], error: null };
    await expect(dealHasOpenSignatureRequests('deal_1', 'space_1')).resolves.toEqual({
      hasOpen: false,
      openCount: 0,
    });
  });

  it('fails OPEN (no block) on a query error', async () => {
    result = { data: null, error: { message: 'boom' } };
    await expect(dealHasOpenSignatureRequests('deal_1', 'space_1')).resolves.toEqual({
      hasOpen: false,
      openCount: 0,
    });
  });
});
