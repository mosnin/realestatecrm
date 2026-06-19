/**
 * Client-portal DEAL visibility — access-control + data-exposure regressions.
 *
 * This surface exposes deal data to EXTERNAL clients, so the security bar is
 * strict. These tests lock in three guarantees:
 *
 *   1. A client sees ONLY deals they are a party to (verified email → Contact →
 *      DealContact). A deal they are NOT linked to is unreachable.
 *   2. A foreign / non-existent deal id returns 404 from the detail route and
 *      null from the helper — never leaking that the deal exists, never leaking
 *      its fields. FAIL CLOSED.
 *   3. Only client-SAFE fields are ever selected/returned. Internal columns
 *      (value, commissionRate, probability, priority, nextAction, wonLost*,
 *      closeReason*, description) are never read.
 *
 * They must FAIL if the DealContact scoping is loosened, the email→contact
 * boundary is bypassed, or an internal field is added to a select.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// lib/client-deals has `import 'server-only'` — a build-time guard that throws
// under vitest. Neutralize it (same pattern as tests/lib/cma.test.ts).
vi.mock('server-only', () => ({}));

// ── Supabase per-table queue mock ───────────────────────────────────────────
// Same pattern as tests/api/tenant-isolation-idor.test.ts: each table maps to a
// FIFO of results; every `.eq` / `.in` / `.ilike` is recorded so we can assert
// the scoping columns. A query whose chain filters on a contactId/dealId the
// fixture doesn't seed simply resolves to the seeded "no row" result — exactly
// how Postgres would deny the read.

type TableResult = { data?: unknown; error?: unknown };

const tableQueues: Record<string, TableResult[]> = {};
const filterCalls: { table: string; method: string; column: string; value: unknown }[] = [];
const selectCols: { table: string; cols: string }[] = [];

function seed(table: string, ...results: TableResult[]) {
  tableQueues[table] = (tableQueues[table] ?? []).concat(results);
}

function nextResult(table: string): TableResult {
  const q = tableQueues[table];
  if (q && q.length > 0) return q.shift() as TableResult;
  return { data: null };
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = ['order', 'limit', 'not', 'is'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.select = vi.fn((cols: string) => {
    selectCols.push({ table, cols });
    return chain;
  });
  for (const m of ['eq', 'in', 'ilike'] as const) {
    chain[m] = vi.fn((column: string, value: unknown) => {
      filterCalls.push({ table, method: m, column, value });
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

vi.mock('@/lib/client-auth', () => ({
  getClientUser: vi.fn(),
}));

// Import AFTER the mocks.
import { getClientDeals, getClientDeal } from '@/lib/client-deals';
import { GET as listDeals } from '@/app/api/clients/deals/route';
import { GET as getDeal } from '@/app/api/clients/deals/[id]/route';
import { getClientUser } from '@/lib/client-auth';

const mockGetClientUser = vi.mocked(getClientUser);

const VERIFIED_USER = {
  id: 'cu_1',
  email: 'Buyer@Example.com',
  emailLower: 'buyer@example.com',
  name: 'Bea Buyer',
  phone: null,
  emailVerifiedAt: '2026-01-01T00:00:00Z',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  filterCalls.length = 0;
  selectCols.length = 0;
});

function filtersOn(table: string, column: string) {
  return filterCalls.filter((c) => c.table === table && c.column === column);
}

// ════════════════════════════════════════════════════════════════════════════
// Helper: getClientDeals — list scope
// ════════════════════════════════════════════════════════════════════════════

describe('getClientDeals — resolves only the client\'s own linked deals', () => {
  it('returns [] (no contacts) without ever querying DealContact/Deal', async () => {
    seed('Contact', { data: [] }); // email owns no contacts
    const deals = await getClientDeals('nobody@example.com');
    expect(deals).toEqual([]);
    expect(filtersOn('DealContact', 'contactId')).toHaveLength(0);
  });

  it('resolves contacts by verified email (escaped, case-insensitive), then deals via DealContact', async () => {
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: [{ dealId: 'd_mine', role: 'buyer' }] });
    seed('Deal', {
      data: [
        { id: 'd_mine', title: '123 Main', address: '123 Main St', status: 'active', stageId: 'st_2', closeDate: null, updatedAt: '2026-02-01' },
      ],
    });
    seed('DealStage', { data: [{ id: 'st_2', name: 'Under Contract', kind: 'under_contract' }] });

    const deals = await getClientDeals('Buyer@Example.com');
    expect(deals).toHaveLength(1);
    expect(deals[0].id).toBe('d_mine');
    expect(deals[0].role).toBe('buyer');
    expect(deals[0].progress).toBe('under_contract');
    expect(deals[0].stageName).toBe('Under Contract');

    // The Contact lookup used ilike on the email (case-insensitive boundary).
    expect(filtersOn('Contact', 'email').some((c) => c.method === 'ilike')).toBe(true);
    // Deals were resolved THROUGH DealContact scoped to the owned contact id.
    expect(filtersOn('DealContact', 'contactId')).toEqual([
      { table: 'DealContact', method: 'in', column: 'contactId', value: ['c_mine'] },
    ]);
  });

  it('returns [] when the client owns contacts but none are linked to a deal', async () => {
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: [] }); // no links
    const deals = await getClientDeals('Buyer@Example.com');
    expect(deals).toEqual([]);
  });

  it('NEVER selects internal/financial columns on Deal', async () => {
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: [{ dealId: 'd_mine', role: 'buyer' }] });
    seed('Deal', { data: [{ id: 'd_mine', title: 'X', address: null, status: 'active', stageId: 's', closeDate: null, updatedAt: '2026-02-01' }] });
    seed('DealStage', { data: [{ id: 's', name: 'Lead', kind: 'lead' }] });

    await getClientDeals('Buyer@Example.com');
    const dealSelects = selectCols.filter((s) => s.table === 'Deal').map((s) => s.cols).join(' ');
    for (const banned of [
      'value',
      'commissionRate',
      'probability',
      'priority',
      'nextAction',
      'wonLostReason',
      'wonLostNote',
      'closeReason',
      'description',
    ]) {
      expect(dealSelects).not.toContain(banned);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Helper: getClientDeal — single-deal scope (the security-critical path)
// ════════════════════════════════════════════════════════════════════════════

describe('getClientDeal — fail-closed single-deal access', () => {
  it('returns null for a deal the client is NOT linked to (no DealContact row)', async () => {
    seed('Contact', { data: [{ id: 'c_mine' }] });
    // Scoped DealContact lookup for the foreign deal finds nothing.
    seed('DealContact', { data: null });
    // Even if the Deal table HAD the foreign row, it must never be read.
    seed('Deal', { data: { id: 'd_victim', title: 'VICTIM DEAL', value: 999999, commissionRate: 3, spaceId: 'sp_v', status: 'active', stageId: 's', closeDate: null, updatedAt: '2026-02-01' } });

    const deal = await getClientDeal('Buyer@Example.com', 'd_victim');
    expect(deal).toBeNull();

    // The authorization lookup was scoped by BOTH the requested deal id AND the
    // client's own contact ids — never trusting the id alone.
    expect(filtersOn('DealContact', 'dealId')).toEqual([
      { table: 'DealContact', method: 'eq', column: 'dealId', value: 'd_victim' },
    ]);
    expect(filtersOn('DealContact', 'contactId')).toEqual([
      { table: 'DealContact', method: 'in', column: 'contactId', value: ['c_mine'] },
    ]);
    // The Deal row was never fetched, so nothing could leak.
    expect(filtersOn('Deal', 'id')).toHaveLength(0);
  });

  it('returns null when the client owns no contacts at all', async () => {
    seed('Contact', { data: [] });
    const deal = await getClientDeal('Buyer@Example.com', 'd_any');
    expect(deal).toBeNull();
    expect(filtersOn('DealContact', 'dealId')).toHaveLength(0);
  });

  it('returns null for an empty deal id (never builds an unscoped query)', async () => {
    const deal = await getClientDeal('Buyer@Example.com', '');
    expect(deal).toBeNull();
    expect(filtersOn('Contact', 'email')).toHaveLength(0);
  });

  it('returns a SAFE detail (timeline + milestones) for a deal the client owns', async () => {
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: { dealId: 'd_mine', role: 'buyer' } });
    seed('Deal', { data: { id: 'd_mine', spaceId: 'sp_1', title: '7 Oak Ave', address: '7 Oak Ave', status: 'active', stageId: 'st_ctr', closeDate: '2026-08-01', updatedAt: '2026-02-01' } });
    seed('DealStage', {
      data: [
        { id: 'st_lead', name: 'New Lead', position: 0, kind: 'lead' },
        { id: 'st_ctr', name: 'Under Contract', position: 1, kind: 'under_contract' },
        { id: 'st_close', name: 'Closing', position: 2, kind: 'closing' },
      ],
    });
    seed('DealChecklistItem', {
      data: [
        { id: 'ck1', label: 'Inspection period ends', dueAt: '2026-07-01', completedAt: '2026-07-01', position: 0 },
        { id: 'ck2', label: 'Closing', dueAt: '2026-08-01', completedAt: null, position: 1 },
      ],
    });

    const deal = await getClientDeal('Buyer@Example.com', 'd_mine');
    expect(deal).not.toBeNull();
    expect(deal!.title).toBe('7 Oak Ave');
    expect(deal!.stageName).toBe('Under Contract');

    // Timeline: lead=done, under_contract=current, closing=upcoming.
    expect(deal!.timeline.map((s) => s.state)).toEqual(['done', 'current', 'upcoming']);
    // Milestones reflect completion.
    expect(deal!.milestones).toHaveLength(2);
    expect(deal!.milestones[0].completed).toBe(true);
    expect(deal!.milestones[1].completed).toBe(false);

    // The returned object carries no internal keys.
    const keys = Object.keys(deal!);
    for (const banned of ['value', 'commissionRate', 'probability', 'priority', 'nextAction', 'description', 'wonLostReason', 'closeReason']) {
      expect(keys).not.toContain(banned);
    }
  });

  it('marks every step done for a WON deal', async () => {
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: { dealId: 'd_mine', role: 'buyer' } });
    seed('Deal', { data: { id: 'd_mine', spaceId: 'sp_1', title: 'Done Deal', address: null, status: 'won', stageId: 'st_close', closeDate: null, updatedAt: '2026-02-01' } });
    seed('DealStage', {
      data: [
        { id: 'st_lead', name: 'Lead', position: 0, kind: 'lead' },
        { id: 'st_close', name: 'Closing', position: 1, kind: 'closing' },
      ],
    });
    seed('DealChecklistItem', { data: [] });

    const deal = await getClientDeal('Buyer@Example.com', 'd_mine');
    expect(deal!.progress).toBe('closed');
    expect(deal!.timeline.every((s) => s.state === 'done')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Route handlers — auth gates + 404 (never-leak) behavior
// ════════════════════════════════════════════════════════════════════════════

function listReq() {
  return new NextRequest('http://localhost/api/clients/deals');
}
function detailReq(id: string) {
  return new NextRequest(`http://localhost/api/clients/deals/${id}`);
}
function detailParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/clients/deals[/:id] — auth + scope at the edge', () => {
  it('401s the list when unauthenticated', async () => {
    mockGetClientUser.mockResolvedValue(null);
    const res = await listDeals();
    expect(res.status).toBe(401);
  });

  it('401s the list when the email is not verified', async () => {
    mockGetClientUser.mockResolvedValue({ ...VERIFIED_USER, emailVerifiedAt: null });
    const res = await listDeals();
    expect(res.status).toBe(401);
  });

  it('401s the detail route when unauthenticated', async () => {
    mockGetClientUser.mockResolvedValue(null);
    const res = await getDeal(detailReq('d_x'), detailParams('d_x'));
    expect(res.status).toBe(401);
  });

  it('404s a deal the client is NOT linked to — and leaks nothing', async () => {
    mockGetClientUser.mockResolvedValue(VERIFIED_USER);
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: null }); // foreign deal → no link
    seed('Deal', { data: { id: 'd_victim', title: 'VICTIM SECRET', value: 1, spaceId: 'x', status: 'active', stageId: 's', closeDate: null, updatedAt: '2026-01-01' } });

    const res = await getDeal(detailReq('d_victim'), detailParams('d_victim'));
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('VICTIM SECRET');
    expect(body).not.toContain('"value"');
  });

  it('returns the client\'s own deals from the list route', async () => {
    mockGetClientUser.mockResolvedValue(VERIFIED_USER);
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: [{ dealId: 'd_mine', role: 'buyer' }] });
    seed('Deal', { data: [{ id: 'd_mine', title: 'Mine', address: null, status: 'active', stageId: 's', closeDate: null, updatedAt: '2026-02-01' }] });
    seed('DealStage', { data: [{ id: 's', name: 'Lead', kind: 'lead' }] });

    const res = await listDeals();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deals).toHaveLength(1);
    expect(body.deals[0].id).toBe('d_mine');
  });

  it('serves a SAFE detail for an owned deal', async () => {
    mockGetClientUser.mockResolvedValue(VERIFIED_USER);
    seed('Contact', { data: [{ id: 'c_mine' }] });
    seed('DealContact', { data: { dealId: 'd_mine', role: 'buyer' } });
    seed('Deal', { data: { id: 'd_mine', spaceId: 'sp', title: 'Mine', address: null, status: 'active', stageId: 's', closeDate: null, updatedAt: '2026-02-01' } });
    seed('DealStage', { data: [{ id: 's', name: 'Lead', position: 0, kind: 'lead' }] });
    seed('DealChecklistItem', { data: [] });

    const res = await getDeal(detailReq('d_mine'), detailParams('d_mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deal.id).toBe('d_mine');
    expect(body.deal).not.toHaveProperty('value');
    expect(body.deal).not.toHaveProperty('commissionRate');
  });
});
