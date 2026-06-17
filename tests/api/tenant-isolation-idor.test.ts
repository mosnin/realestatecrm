/**
 * Multi-tenant isolation (IDOR) regressions for two routes that resolve a
 * workspace from a PUBLIC, caller-supplied value (a slug, or a slug + a tour
 * id) and must NOT let one tenant reach another tenant's rows.
 *
 * These lock in two confirmed cross-tenant leaks:
 *
 *   1. GET /api/cards/contact/[id]?slug=<victim>
 *      The handler used to resolve the space from the attacker-controllable
 *      `?slug=` (a PUBLIC value — it appears in /apply/, /book/, /p/ URLs) and
 *      then queried the contact scoped to THAT (victim's) space, so any
 *      authenticated realtor could read another tenant's contact PII by
 *      passing the victim's slug + any contact id. The space is now resolved
 *      from the CALLER (getSpaceForUser); a foreign slug never selects a
 *      foreign space, and a foreign contact id 404s.
 *
 *   2. POST /api/tours/gcal  { action:'sync_tour', slug:<own>, tourId:<any> }
 *      requireSpaceOwner only proves the caller owns `slug`'s space — NOT that
 *      `tourId` belongs to it. The Tour select had no spaceId filter, so a
 *      caller could copy another tenant's tour guest PII into their own Google
 *      Calendar and overwrite the victim's googleEventId. The Tour select + both
 *      Tour updates are now scoped by space.id; a cross-tenant tourId 404s
 *      BEFORE any Google API call.
 *
 * Each test crosses the boundary on purpose and asserts denial. They must FAIL
 * if the spaceId scoping is reverted and PASS on the current code.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── api-auth + space mocks ──────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
  // If the contact route ever resolved the space from the slug again, this spy
  // would record the call — we assert it is NEVER invoked.
  getSpaceFromSlug: vi.fn(),
}));

// crypto is only touched on the OAuth/refresh paths, never on the sync_tour
// denial path under test — stub it so the module imports cleanly.
vi.mock('@/lib/crypto', () => ({
  encrypt: (s: string) => s,
  decrypt: (s: string) => s,
  decryptOrPassthrough: (s: string) => s,
}));

// ── Supabase per-table queue mock ───────────────────────────────────────────
//
// Each table maps to a FIFO of results resolved by the next query against it
// (via `.maybeSingle()`/`.single()` or by awaiting the chain). We also record
// every `.eq(column, value)` so tests can assert the spaceId scoping is applied
// to the right table. A query whose chain includes `.eq('spaceId', X)` against
// a row that does NOT belong to X simply resolves to the seeded "no row"
// result — which is exactly how the real Postgres filter denies the read.

type TableResult = { data?: unknown; error?: unknown };

const tableQueues: Record<string, TableResult[]> = {};
const eqCalls: { table: string; column: string; value: unknown }[] = [];
const updateCalls: { table: string; payload: unknown }[] = [];

function seed(table: string, ...results: TableResult[]) {
  tableQueues[table] = (tableQueues[table] ?? []).concat(results);
}

function nextResult(table: string): TableResult {
  const q = tableQueues[table];
  if (q && q.length > 0) return q.shift() as TableResult;
  return { data: null }; // default: no rows
}

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'order', 'limit', 'in', 'insert', 'delete', 'upsert', 'not', 'is'];
  for (const m of passthrough) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn((column: string, value: unknown) => {
    eqCalls.push({ table, column, value });
    return chain;
  });
  chain.update = vi.fn((payload: unknown) => {
    updateCalls.push({ table, payload });
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(nextResult(table)));
  chain.single = vi.fn(() => Promise.resolve(nextResult(table)));
  (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(nextResult(table)).then(resolve);
  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn((table: string) => makeChain(table)) },
}));

// Import AFTER the mocks.
import { GET as getContactCard } from '@/app/api/cards/contact/[id]/route';
import { POST as gcalPost } from '@/app/api/tours/gcal/route';
import { requireAuth, requireSpaceOwner } from '@/lib/api-auth';
import { getSpaceForUser, getSpaceFromSlug } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockRequireSpaceOwner = vi.mocked(requireSpaceOwner);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockGetSpaceFromSlug = vi.mocked(getSpaceFromSlug);

// The caller's own space throughout: realtor "jane".
const CALLER_SPACE = { id: 'space_caller', slug: 'jane', name: 'Jane', ownerId: 'u_caller' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tableQueues)) delete tableQueues[k];
  eqCalls.length = 0;
  updateCalls.length = 0;
});

function eqOn(table: string, column: string) {
  return eqCalls.filter((c) => c.table === table && c.column === column);
}

// ════════════════════════════════════════════════════════════════════════════
// FIX 1 — GET /api/cards/contact/[id]
// ════════════════════════════════════════════════════════════════════════════

function contactReq(id: string, slug?: string) {
  const url = slug
    ? `http://localhost/api/cards/contact/${id}?slug=${encodeURIComponent(slug)}`
    : `http://localhost/api/cards/contact/${id}`;
  return new NextRequest(url);
}
function contactParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('GET /api/cards/contact/[id] — space resolved from caller, not slug', () => {
  it('401s when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );
    const res = await getContactCard(contactReq('c_x', 'victim'), contactParams('c_x'));
    expect(res.status).toBe(401);
  });

  it('NEVER resolves the space from the slug (getSpaceFromSlug not called)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
    // Caller's own contact exists in the caller's own space.
    seed('Contact', { data: { id: 'c_mine', name: 'Mine', notes: null, updatedAt: null, createdAt: '2026-01-01' } });
    seed('ContactActivity', { data: [] });

    const res = await getContactCard(contactReq('c_mine', 'jane'), contactParams('c_mine'));
    expect(res.status).toBe(200);
    // The hole was slug-based resolution — it must be gone entirely.
    expect(mockGetSpaceFromSlug).not.toHaveBeenCalled();
    expect(mockGetSpaceForUser).toHaveBeenCalledWith('u_caller');
  });

  it('scopes the Contact + ContactActivity queries to the CALLER space', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
    seed('Contact', { data: { id: 'c_mine', name: 'Mine', notes: null, updatedAt: null, createdAt: '2026-01-01' } });
    seed('ContactActivity', { data: [] });

    await getContactCard(contactReq('c_mine'), contactParams('c_mine'));

    // Both PII tables filtered by the caller's own space id, never a victim's.
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
    expect(eqOn('ContactActivity', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('404s a victim slug (mismatch) WITHOUT leaking PII or querying Contact', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
    // If the route ever queried with the victim's scope, this is the PII that
    // would leak. It must never be reached because the slug mismatch 404s first.
    seed('Contact', { data: { id: 'c_victim', name: 'VICTIM SECRET', email: 'victim@x.com', notes: 'private', updatedAt: null, createdAt: '2026-01-01' } });

    const res = await getContactCard(contactReq('c_victim', 'victim-slug'), contactParams('c_victim'));
    expect(res.status).toBe(404);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain('VICTIM SECRET');
    expect(body).not.toContain('victim@x.com');
    // The mismatch short-circuits before touching the Contact table.
    expect(eqOn('Contact', 'spaceId')).toHaveLength(0);
    expect(mockGetSpaceFromSlug).not.toHaveBeenCalled();
  });

  it('404s a cross-tenant contact id (scoped query returns no row)', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
    // The scoped `.eq('spaceId', space_caller)` query finds nothing for a
    // foreign id — default no-row result.
    seed('Contact', { data: null });

    const res = await getContactCard(contactReq('c_other_tenant'), contactParams('c_other_tenant'));
    expect(res.status).toBe(404);
    expect(eqOn('Contact', 'spaceId').map((c) => c.value)).toEqual(['space_caller']);
  });

  it('404s when the caller has no space', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await getContactCard(contactReq('c_x', 'victim'), contactParams('c_x'));
    expect(res.status).toBe(404);
    expect(eqOn('Contact', 'spaceId')).toHaveLength(0);
  });

  it('control: serves the caller their OWN contact with a matching slug', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'u_caller' });
    mockGetSpaceForUser.mockResolvedValue(CALLER_SPACE);
    seed('Contact', { data: { id: 'c_mine', name: 'Jane Lead', email: 'lead@x.com', notes: null, updatedAt: null, createdAt: '2026-01-01' } });
    seed('ContactActivity', { data: [] });

    const res = await getContactCard(contactReq('c_mine', 'jane'), contactParams('c_mine'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('c_mine');
    expect(body.data.name).toBe('Jane Lead');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FIX 2 — POST /api/tours/gcal  (action: sync_tour)
// ════════════════════════════════════════════════════════════════════════════

function gcalReq(body: unknown) {
  return new NextRequest('http://localhost/api/tours/gcal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/tours/gcal sync_tour — Tour scoped to caller space', () => {
  beforeEach(() => {
    // Caller legitimately owns their own space (requireSpaceOwner passes).
    mockRequireSpaceOwner.mockResolvedValue({ userId: 'u_caller', space: CALLER_SPACE });
  });

  it("404s a cross-tenant tourId and makes NO Google API call", async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Caller's calendar IS connected (token row exists).
    seed('GoogleCalendarToken', {
      data: { id: 't1', spaceId: 'space_caller', accessToken: 'a', refreshToken: 'r', calendarId: 'primary', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    // The victim's tour exists, but the scoped `.eq('spaceId', space_caller)`
    // query returns nothing for it — default no-row result.
    seed('Tour', { data: null });

    const res = await gcalPost(gcalReq({ slug: 'jane', action: 'sync_tour', tourId: 'tour_victim' }));
    expect(res.status).toBe(404);

    // The Tour SELECT was scoped to the caller's own space.
    expect(eqOn('Tour', 'spaceId').map((c) => c.value)).toContain('space_caller');
    // Crucially: nothing was written and no calendar event was created — the PII
    // never left the victim's tenant.
    expect(updateCalls.filter((u) => u.table === 'Tour')).toHaveLength(0);
    const googleCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes('googleapis.com/calendar'));
    expect(googleCalls).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it('scopes BOTH the Tour select and the success Tour update to space.id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'gcal_evt_1' }), { status: 200 }),
    );
    seed('GoogleCalendarToken', {
      data: { id: 't1', spaceId: 'space_caller', accessToken: 'a', refreshToken: 'r', calendarId: 'primary', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    // Caller's OWN tour (no prior googleEventId → create path → single update).
    seed('Tour', {
      data: { id: 'tour_mine', spaceId: 'space_caller', guestName: 'Sam', guestEmail: null, guestPhone: null, propertyAddress: null, notes: null, startsAt: '2026-07-01T10:00:00Z', endsAt: '2026-07-01T11:00:00Z', googleEventId: null },
    });

    const res = await gcalPost(gcalReq({ slug: 'jane', action: 'sync_tour', tourId: 'tour_mine' }));
    expect(res.status).toBe(200);

    // Select scoped.
    expect(eqOn('Tour', 'spaceId').map((c) => c.value)).toContain('space_caller');
    // The googleEventId write-back happened AND was scoped by spaceId.
    const tourUpdates = updateCalls.filter((u) => u.table === 'Tour');
    expect(tourUpdates).toHaveLength(1);
    // Every Tour .eq('spaceId', ...) seen carries the caller's space — the
    // update's scoping shares the same eqCalls log.
    expect(eqOn('Tour', 'spaceId').every((c) => c.value === 'space_caller')).toBe(true);
    fetchSpy.mockRestore();
  });

  it('still 400s when tourId is missing (unchanged behavior)', async () => {
    seed('GoogleCalendarToken', {
      data: { id: 't1', spaceId: 'space_caller', accessToken: 'a', refreshToken: 'r', calendarId: 'primary', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    const res = await gcalPost(gcalReq({ slug: 'jane', action: 'sync_tour' }));
    expect(res.status).toBe(400);
  });

  it('propagates the requireSpaceOwner 403 (caller does not own slug)', async () => {
    mockRequireSpaceOwner.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const res = await gcalPost(gcalReq({ slug: 'someone-else', action: 'sync_tour', tourId: 'tour_x' }));
    expect(res.status).toBe(403);
  });
});
