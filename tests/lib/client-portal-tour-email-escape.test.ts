/**
 * Client-portal tour email boundary — LIKE metacharacters must be escaped.
 *
 * Contact lookups already wrap the verified email in escapeLike() so
 * `john_doe@…` cannot match `johnXdoe@…` and `%@gmail.com` cannot match every
 * Gmail contact. The Tour.guestEmail ILIKE was left raw, which is a
 * cross-tenant PII leak: tours are queried with no spaceId filter, so a
 * wildcard email would return other realtors' bookings (address, time,
 * realtor identity, contactId).
 *
 * These tests execute getClientPortalData / clientOwnsContact against a mocked
 * Supabase chain and assert the ILIKE pattern is the escaped literal.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'limit', 'eq']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.ilike = vi.fn((column: string, value: unknown) => {
    filterCalls.push({ table, method: 'ilike', column, value });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { getClientPortalData, clientOwnsContact } from '@/lib/client-portal-data';

beforeEach(() => {
  vi.clearAllMocks();
  filterCalls.length = 0;
});

function ilikeOn(table: string, column: string): unknown[] {
  return filterCalls
    .filter((c) => c.table === table && c.column === column && c.method === 'ilike')
    .map((c) => c.value);
}

describe('getClientPortalData — email ILIKE is a literal match', () => {
  it('escapes underscore and percent on both Contact.email and Tour.guestEmail', async () => {
    await getClientPortalData('john_doe%test@example.com');

    expect(ilikeOn('Contact', 'email')).toEqual(['john\\_doe\\%test@example.com']);
    expect(ilikeOn('Tour', 'guestEmail')).toEqual(['john\\_doe\\%test@example.com']);
  });

  it('escapes a leading-percent address so it cannot match every Gmail tour', async () => {
    await getClientPortalData('%@gmail.com');

    expect(ilikeOn('Tour', 'guestEmail')).toEqual(['\\%@gmail.com']);
    expect(ilikeOn('Contact', 'email')).toEqual(['\\%@gmail.com']);
  });

  it('leaves a plain email unchanged (no extra escaping)', async () => {
    await getClientPortalData('Buyer@Example.com');

    expect(ilikeOn('Contact', 'email')).toEqual(['buyer@example.com']);
    expect(ilikeOn('Tour', 'guestEmail')).toEqual(['buyer@example.com']);
  });
});

describe('clientOwnsContact — email ILIKE is a literal match', () => {
  it('escapes metacharacters on the Contact ownership check', async () => {
    await clientOwnsContact('a_b%c@x.com', 'contact_1');

    expect(ilikeOn('Contact', 'email')).toEqual(['a\\_b\\%c@x.com']);
  });
});
