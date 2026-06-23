/**
 * kvCORE adapter — transport + mapping unit tests.
 *
 * The adapter talks to a gated API whose exact response shape isn't publicly
 * documented, so the contract we pin is the DEFENSIVE behavior:
 *   - verifyApiKey reads the auth signal from the status code: 2xx/403 = real
 *     credential (403 = authentic but narrow scope), 401 = rejected, other =
 *     "couldn't reach". A blank key never hits the network.
 *   - listContacts peels back several envelope shapes (bare array, {data},
 *     {results}, {contacts}, {items}) and maps snake_case OR camelCase fields,
 *     degrading to { ok: false } on any non-ok response.
 *
 * fetch is mocked so no network is touched.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyApiKey, listContacts } from '@/lib/integrations/kvcore';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

function mockFetchOnce(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  } as Response);
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('verifyApiKey', () => {
  it('rejects a blank token without hitting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await verifyApiKey('   ');
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('accepts a 2xx as a valid contacts-scoped token', async () => {
    mockFetchOnce(200, { data: [] });
    const res = await verifyApiKey('tok_good');
    expect(res.ok).toBe(true);
    expect(res.label).toBe('kvCORE');
  });

  it('rejects a 401 (wrong/expired token)', async () => {
    mockFetchOnce(401, { error: 'unauthorized' });
    const res = await verifyApiKey('tok_bad');
    expect(res.ok).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('accepts a 403 as an authentic-but-narrow-scope token', async () => {
    // A bad token returns 401; a 403 means the token authenticated but lacks
    // the contacts scope — still a real credential, so we store it.
    mockFetchOnce(403, { error: 'forbidden' });
    const res = await verifyApiKey('tok_narrow');
    expect(res.ok).toBe(true);
  });

  it('surfaces an upstream hiccup (5xx) without accepting the key', async () => {
    mockFetchOnce(500, { error: 'server' });
    const res = await verifyApiKey('tok_x');
    expect(res.ok).toBe(false);
  });
});

describe('listContacts', () => {
  it('maps a bare array of snake_case contacts to SyncRecords', async () => {
    mockFetchOnce(200, [
      {
        id: 7,
        first_name: 'Dana',
        last_name: 'Lee',
        email: 'dana@example.com',
        cell_phone_1: '555-200-3000',
        lead_status: 'Hot',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ]);
    const { ok, records } = await listContacts('tok');
    expect(ok).toBe(true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: '7',
      name: 'Dana Lee',
      email: 'dana@example.com',
      phone: '555-200-3000',
      stage: 'Hot',
      recordType: 'Contact',
    });
  });

  it('peels the {data:[...]} envelope and falls back to camelCase + composed name', async () => {
    mockFetchOnce(200, {
      data: [{ id: 'abc', firstName: 'Sam', lastName: 'Park', phone: '555-1' }],
    });
    const { ok, records } = await listContacts('tok');
    expect(ok).toBe(true);
    expect(records[0]).toMatchObject({ id: 'abc', name: 'Sam Park', phone: '555-1', email: null });
  });

  it('returns { ok: false } on a non-ok response', async () => {
    mockFetchOnce(500, { error: 'boom' });
    const { ok, records } = await listContacts('tok');
    expect(ok).toBe(false);
    expect(records).toEqual([]);
  });

  it('handles an unrecognized envelope shape as empty rather than throwing', async () => {
    mockFetchOnce(200, { weird: { nested: true } });
    const { ok, records } = await listContacts('tok');
    expect(ok).toBe(true);
    expect(records).toEqual([]);
  });
});
