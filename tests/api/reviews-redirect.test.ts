/**
 * Route test for GET /api/reviews/[campaignId] — the public click-tracking
 * redirect. Asserts the click is stamped (status 'clicked' + clickedAt) and
 * the response 302s to the stored reviewUrl; a malformed id or unknown
 * campaign 404s without a redirect.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

type Terminal = { data?: unknown; error?: unknown };
const queues: Record<string, Terminal[]> = {};
const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

function queueFor(table: string): Terminal[] {
  if (!queues[table]) queues[table] = [];
  return queues[table];
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const q = queueFor(table);
    const chain: Record<string, unknown> = {};
    const next = (): Promise<Terminal> => Promise.resolve(q.shift() ?? { data: null, error: null });
    for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
    chain.update = vi.fn((values: Record<string, unknown>) => {
      updates.push({ table, values });
      return chain;
    });
    chain.maybeSingle = vi.fn(() => next());
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET } from '@/app/api/reviews/[campaignId]/route';

const VALID_ID = '11111111-2222-3333-4444-555555555555';

function invoke(campaignId: string) {
  const req = new Request(`http://localhost/api/reviews/${campaignId}`);
  return GET(req as never, { params: Promise.resolve({ campaignId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(queues)) delete queues[k];
  updates.length = 0;
});

describe('GET /api/reviews/[campaignId]', () => {
  it('stamps clicked + 302-redirects to the stored reviewUrl on first click', async () => {
    queueFor('ReviewCampaign').push({
      data: { id: VALID_ID, reviewUrl: 'https://g.page/r/acme/review', clickedAt: null },
      error: null,
    });

    const res = await invoke(VALID_ID);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://g.page/r/acme/review');

    const stamp = updates.find((u) => u.table === 'ReviewCampaign');
    expect(stamp).toBeDefined();
    expect(stamp!.values.status).toBe('clicked');
    expect(typeof stamp!.values.clickedAt).toBe('string');
  });

  it('does not re-stamp an already-clicked campaign but still redirects', async () => {
    queueFor('ReviewCampaign').push({
      data: { id: VALID_ID, reviewUrl: 'https://g.page/r/acme/review', clickedAt: '2026-07-01T00:00:00.000Z' },
      error: null,
    });

    const res = await invoke(VALID_ID);

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://g.page/r/acme/review');
    expect(updates).toHaveLength(0);
  });

  it('404s a malformed campaign id without touching the DB', async () => {
    const res = await invoke('not-a-valid-id!!');
    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it('404s an unknown campaign', async () => {
    queueFor('ReviewCampaign').push({ data: null, error: null });
    const res = await invoke(VALID_ID);
    expect(res.status).toBe(404);
  });

  it('404s a campaign with no reviewUrl (cannot redirect anywhere honest)', async () => {
    queueFor('ReviewCampaign').push({
      data: { id: VALID_ID, reviewUrl: null, clickedAt: null },
      error: null,
    });
    const res = await invoke(VALID_ID);
    expect(res.status).toBe(404);
  });
});
