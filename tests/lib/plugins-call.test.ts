/**
 * Custom-plugin execution guards — the boundaries that make "bring your own
 * tool" safe: unknown/disabled plugins refuse cleanly, the SSRF gate is
 * consulted at CALL time, and input shaping (JSON pass-through vs wrapping)
 * behaves as documented.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const pluginRow: Record<string, unknown> | null = {
  name: 'mls-lookup',
  url: 'https://api.example.com/mls',
  method: 'POST',
  authHeader: { name: 'Authorization', value: 'Bearer sekrit' },
  enabled: true,
};
let currentRow: Record<string, unknown> | null = pluginRow;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: currentRow }),
          }),
        }),
      }),
    }),
  },
}));

const assertPublicHttpTarget = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/net/ssrf-guard', () => ({
  assertPublicHttpTarget: (...a: unknown[]) => assertPublicHttpTarget(...(a as [])),
  getSafeDispatcher: () => undefined,
}));

// server-only is a Next.js marker module — inert under vitest.
vi.mock('server-only', () => ({}));

import { callCustomPlugin } from '@/lib/plugins/call';

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  text: async () => '{"result":"fine"}',
}));

beforeEach(() => {
  currentRow = { ...pluginRow };
  assertPublicHttpTarget.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

describe('callCustomPlugin', () => {
  it('refuses an unknown plugin without fetching', async () => {
    currentRow = null;
    const res = await callCustomPlugin('sp_1', 'nope');
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a disabled plugin without fetching', async () => {
    currentRow = { ...pluginRow, enabled: false };
    const res = await callCustomPlugin('sp_1', 'mls-lookup');
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('turned off');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consults the SSRF guard at call time and refuses on rejection', async () => {
    assertPublicHttpTarget.mockResolvedValueOnce({ ok: false, reason: 'private address' } as never);
    const res = await callCustomPlugin('sp_1', 'mls-lookup');
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes JSON input through as the body and attaches the auth header', async () => {
    const res = await callCustomPlugin('sp_1', 'mls-lookup', '{"address":"12 Oak St"}');
    expect(res.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"address":"12 Oak St"}');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sekrit');
    expect(init.redirect).toBe('manual');
  });

  it('wraps plain-text input as {"input": text}', async () => {
    await callCustomPlugin('sp_1', 'mls-lookup', 'what is the status of 12 Oak St');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ input: 'what is the status of 12 Oak St' });
  });

  it('puts input on the query string for GET plugins', async () => {
    currentRow = { ...pluginRow, method: 'GET' };
    await callCustomPlugin('sp_1', 'mls-lookup', '12 Oak St');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('input=12+Oak+St');
    expect(init.body).toBeUndefined();
  });

  it('reports non-2xx as ok:true / httpOk:false (delivered, but failed)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' } as never);
    const res = await callCustomPlugin('sp_1', 'mls-lookup');
    expect(res.ok).toBe(true);
    expect(res.ok && res.httpOk).toBe(false);
  });
});
