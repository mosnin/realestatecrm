/**
 * getClientPortalData tour lookup must escape LIKE metacharacters on
 * guestEmail the same way Contact.email already does. A verified client
 * registered as `%@gmail.com` must not match every gmail tour.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type TableResult = { data?: unknown; error?: unknown };
const tableQueues: Record<string, TableResult[]> = {};
const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];

function seed(table: string, ...results: TableResult[]) {
  tableQueues[table] = (tableQueues[table] ?? []).concat(results);
}

function nextResult(table: string): TableResult {
  const q = tableQueues[table];
  if (q && q.length > 0) return q.shift() as TableResult;
  return { data: [] };
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    filterCalls.push({ table, method: 'eq', column, value });
    return chain;
  });
  chain.ilike = vi.fn((column: string, value: unknown) => {
    filterCalls.push({ table, method: 'ilike', column, value });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

import { getClientPortalData } from '@/lib/client-portal-data';

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  filterCalls.length = 0;
});

describe('getClientPortalData — email wildcard injection', () => {
  it('escapes % and _ on both Contact.email and Tour.guestEmail', async () => {
    seed('Contact', { data: [] });
    seed('Tour', { data: [] });

    await getClientPortalData('%@gmail.com');

    const contactEmail = filterCalls.find((c) => c.table === 'Contact' && c.column === 'email');
    const tourEmail = filterCalls.find((c) => c.table === 'Tour' && c.column === 'guestEmail');
    expect(contactEmail).toEqual({
      table: 'Contact',
      method: 'ilike',
      column: 'email',
      value: '\\%@gmail.com',
    });
    expect(tourEmail).toEqual({
      table: 'Tour',
      method: 'ilike',
      column: 'guestEmail',
      value: '\\%@gmail.com',
    });
  });
});
