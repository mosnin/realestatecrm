/**
 * Behavioral tests for lib/offers.ts — the Offer lifecycle CRUD + state
 * machine. Executes the real functions against a mocked supabase client and
 * asserts on the query calls made (tenant scoping) and the rows written
 * (OfferEvent history), never on source text.
 *
 * Contract under test:
 *   - OFFER_TRANSITIONS: 'accepted' reachable only from submitted/countered;
 *     terminal statuses have no legal way out.
 *   - transition() rejects an illegal move and writes NO OfferEvent row.
 *   - transition() on a legal move updates Offer.status AND writes a
 *     matching OfferEvent row (fromStatus/toStatus/note).
 *   - Every query is scoped by .eq('spaceId', …) — the tenant boundary.
 *   - A cross-tenant / missing offer id resolves to null, never throws, and
 *     never reaches the update/insert calls.
 *   - deleteDraftOffer refuses non-draft offers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { advanceDealFromEventMock } = vi.hoisted(() => ({
  advanceDealFromEventMock: vi.fn(async () => ({ ok: true, dealId: 'deal-1', created: false, moved: true })),
}));
vi.mock('@/lib/deals/advance-from-event', () => ({
  advanceDealFromEvent: advanceDealFromEventMock,
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type Terminal = { data?: unknown; error?: unknown };
type Call = { table: string; chain: Array<[string, unknown[]]> };

let queues: Record<string, Terminal[]> = {};
let calls: Call[] = [];

function queue(table: string, terminal: Terminal) {
  (queues[table] ??= []).push(terminal);
}

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    const record: Call = { table, chain: chainCalls };
    calls.push(record);

    const next = (): Promise<Terminal> => {
      const q = queues[table];
      const t = q?.shift() ?? { data: null, error: null };
      return Promise.resolve(t);
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        chainCalls.push([m, args]);
        return chain;
      });
    }
    chain.insert = vi.fn((values: unknown) => {
      chainCalls.push(['insert', [values]]);
      return chain;
    });
    chain.update = vi.fn((values: unknown) => {
      chainCalls.push(['update', [values]]);
      return chain;
    });
    chain.delete = vi.fn(() => {
      chainCalls.push(['delete', []]);
      return chain;
    });
    chain.maybeSingle = vi.fn(() => {
      chainCalls.push(['maybeSingle', []]);
      return next();
    });
    chain.single = vi.fn(() => {
      chainCalls.push(['single', []]);
      return next();
    });
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      next().then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

import {
  transition,
  createOffer,
  updateOffer,
  listOffers,
  deleteDraftOffer,
  getOffer,
  isLegalOfferTransition,
  IllegalOfferTransitionError,
  OFFER_TRANSITIONS,
  OFFER_STATUSES,
  type OfferStatus,
} from '@/lib/offers';

function offerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'offer-1',
    spaceId: 'space-1',
    dealId: null,
    propertyAddress: '123 Elm St',
    buyerName: 'Dana Whitfield',
    amount: 450000,
    status: 'submitted',
    expiresAt: null,
    terms: {},
    notes: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  queues = {};
  calls = [];
  advanceDealFromEventMock.mockClear();
});

// ── Pure state-machine tests ────────────────────────────────────────────

describe('OFFER_TRANSITIONS', () => {
  it('reaches "accepted" only from submitted or countered', () => {
    for (const from of OFFER_STATUSES) {
      const canAccept = OFFER_TRANSITIONS[from].includes('accepted');
      if (from === 'submitted' || from === 'countered') {
        expect(canAccept).toBe(true);
      } else {
        expect(canAccept).toBe(false);
      }
    }
  });

  it('a draft can never be accepted directly', () => {
    expect(isLegalOfferTransition('draft', 'accepted')).toBe(false);
  });

  it('every terminal status has no legal transitions out', () => {
    for (const status of ['accepted', 'rejected', 'withdrawn', 'expired'] as OfferStatus[]) {
      expect(OFFER_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('draft can move to submitted or withdrawn', () => {
    expect(isLegalOfferTransition('draft', 'submitted')).toBe(true);
    expect(isLegalOfferTransition('draft', 'withdrawn')).toBe(true);
    expect(isLegalOfferTransition('draft', 'rejected')).toBe(false);
  });
});

// ── transition() behavioral tests ───────────────────────────────────────

describe('transition', () => {
  it('rejects an illegal move (draft -> accepted) and writes no OfferEvent', async () => {
    queue('Offer', { data: offerRow({ status: 'draft' }), error: null });

    await expect(transition('space-1', 'offer-1', 'accepted')).rejects.toThrow(
      IllegalOfferTransitionError,
    );

    const offerEventCalls = calls.filter((c) => c.table === 'OfferEvent');
    expect(offerEventCalls).toHaveLength(0);
  });

  it('a legal move updates status and writes a matching OfferEvent row', async () => {
    queue('Offer', { data: offerRow({ status: 'submitted' }), error: null }); // getOffer
    queue('Offer', { data: offerRow({ status: 'accepted' }), error: null }); // update result
    queue('OfferEvent', { data: [{ id: 'evt-1' }], error: null }); // insert

    const result = await transition('space-1', 'offer-1', 'accepted', 'Great terms, all cash');

    expect(result?.status).toBe('accepted');

    const eventInsertCall = calls.find(
      (c) => c.table === 'OfferEvent' && c.chain.some(([m]) => m === 'insert'),
    );
    expect(eventInsertCall).toBeTruthy();
    const [, insertArgs] = eventInsertCall!.chain.find(([m]) => m === 'insert')!;
    expect(insertArgs[0]).toMatchObject({
      offerId: 'offer-1',
      spaceId: 'space-1',
      fromStatus: 'submitted',
      toStatus: 'accepted',
      note: 'Great terms, all cash',
    });
  });

  it('every Offer query in the transition is scoped by spaceId', async () => {
    queue('Offer', { data: offerRow({ status: 'submitted' }), error: null });
    queue('Offer', { data: offerRow({ status: 'rejected' }), error: null });
    queue('OfferEvent', { data: [{ id: 'evt-1' }], error: null });

    await transition('space-1', 'offer-1', 'rejected');

    const offerCalls = calls.filter((c) => c.table === 'Offer');
    for (const c of offerCalls) {
      expect(c.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
    }
  });

  it('a cross-tenant / missing offer id resolves to null without writing anything', async () => {
    queue('Offer', { data: null, error: null }); // scoped getOffer finds nothing

    const result = await transition('space-1', 'offer-in-other-space', 'accepted');

    expect(result).toBeNull();
    const offerEventCalls = calls.filter((c) => c.table === 'OfferEvent');
    expect(offerEventCalls).toHaveLength(0);
    // Only the initial existence probe ran — no update.
    const offerUpdateCalls = calls.filter(
      (c) => c.table === 'Offer' && c.chain.some(([m]) => m === 'update'),
    );
    expect(offerUpdateCalls).toHaveLength(0);
  });

  it('moves the linked deal to Under Contract when an offer is accepted', async () => {
    queue('Offer', { data: offerRow({ status: 'submitted', dealId: 'deal-1' }), error: null });
    queue('Offer', { data: offerRow({ status: 'accepted', dealId: 'deal-1' }), error: null });
    queue('OfferEvent', { data: [{ id: 'evt-1' }], error: null });

    await transition('space-1', 'offer-1', 'accepted');

    expect(advanceDealFromEventMock).toHaveBeenCalledWith({
      spaceId: 'space-1',
      dealId: 'deal-1',
      event: 'offer_accepted',
      title: 'Dana Whitfield',
      address: '123 Elm St',
    });
  });

  it('does not move the pipeline when the offer is rejected', async () => {
    queue('Offer', { data: offerRow({ status: 'submitted', dealId: 'deal-1' }), error: null });
    queue('Offer', { data: offerRow({ status: 'rejected', dealId: 'deal-1' }), error: null });
    queue('OfferEvent', { data: [{ id: 'evt-1' }], error: null });

    await transition('space-1', 'offer-1', 'rejected');
    expect(advanceDealFromEventMock).not.toHaveBeenCalled();
  });

  it('allows re-countering (countered -> countered)', async () => {
    queue('Offer', { data: offerRow({ status: 'countered' }), error: null });
    queue('Offer', { data: offerRow({ status: 'countered' }), error: null });
    queue('OfferEvent', { data: [{ id: 'evt-2' }], error: null });

    const result = await transition('space-1', 'offer-1', 'countered', 'Second counter');
    expect(result?.status).toBe('countered');
  });
});

// ── getOffer / listOffers tenant scoping ────────────────────────────────

describe('getOffer', () => {
  it('scopes the lookup by both id and spaceId', async () => {
    queue('Offer', { data: offerRow(), error: null });
    await getOffer('space-1', 'offer-1');

    const call = calls.find((c) => c.table === 'Offer');
    expect(call?.chain).toContainEqual(['eq', ['id', 'offer-1']]);
    expect(call?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
  });

  it('returns null for a row in a different space (scoped query finds nothing)', async () => {
    queue('Offer', { data: null, error: null });
    const result = await getOffer('space-1', 'offer-in-other-space');
    expect(result).toBeNull();
  });
});

describe('listOffers', () => {
  it('scopes the list by spaceId', async () => {
    queue('Offer', { data: [offerRow()], error: null });
    const rows = await listOffers('space-1');
    expect(rows).toHaveLength(1);

    const call = calls.find((c) => c.table === 'Offer');
    expect(call?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
  });
});

// ── createOffer ──────────────────────────────────────────────────────────

describe('createOffer', () => {
  it('inserts the offer scoped to spaceId and writes a creation OfferEvent', async () => {
    queue('Offer', { data: offerRow({ status: 'draft' }), error: null });
    queue('OfferEvent', { data: [{ id: 'evt-0' }], error: null });

    const created = await createOffer('space-1', { buyerName: 'Dana Whitfield' });
    expect(created.status).toBe('draft');

    const offerInsertCall = calls.find(
      (c) => c.table === 'Offer' && c.chain.some(([m]) => m === 'insert'),
    );
    const [, insertArgs] = offerInsertCall!.chain.find(([m]) => m === 'insert')!;
    expect(insertArgs[0]).toMatchObject({ spaceId: 'space-1', buyerName: 'Dana Whitfield' });

    const eventInsertCall = calls.find(
      (c) => c.table === 'OfferEvent' && c.chain.some(([m]) => m === 'insert'),
    );
    const [, evArgs] = eventInsertCall!.chain.find(([m]) => m === 'insert')!;
    expect(evArgs[0]).toMatchObject({
      spaceId: 'space-1',
      fromStatus: null,
      toStatus: 'draft',
    });
  });
});

// ── updateOffer ──────────────────────────────────────────────────────────

describe('updateOffer', () => {
  it('returns null for a cross-tenant offer id without issuing an update', async () => {
    queue('Offer', { data: null, error: null }); // getOffer miss

    const result = await updateOffer('space-1', 'offer-in-other-space', { notes: 'hacked' });
    expect(result).toBeNull();

    const updateCalls = calls.filter((c) => c.table === 'Offer' && c.chain.some(([m]) => m === 'update'));
    expect(updateCalls).toHaveLength(0);
  });

  it('scopes the update by id and spaceId', async () => {
    queue('Offer', { data: offerRow(), error: null }); // getOffer
    queue('Offer', { data: offerRow({ notes: 'Updated note' }), error: null }); // update result

    const result = await updateOffer('space-1', 'offer-1', { notes: 'Updated note' });
    expect(result?.notes).toBe('Updated note');

    const updateCall = calls.find((c) => c.table === 'Offer' && c.chain.some(([m]) => m === 'update'));
    expect(updateCall?.chain).toContainEqual(['eq', ['id', 'offer-1']]);
    expect(updateCall?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
  });
});

// ── deleteDraftOffer ─────────────────────────────────────────────────────

describe('deleteDraftOffer', () => {
  it('refuses to delete a non-draft offer', async () => {
    queue('Offer', { data: offerRow({ status: 'submitted' }), error: null });

    const result = await deleteDraftOffer('space-1', 'offer-1');
    expect(result).toBe(false);

    const deleteCalls = calls.filter((c) => c.table === 'Offer' && c.chain.some(([m]) => m === 'delete'));
    expect(deleteCalls).toHaveLength(0);
  });

  it('deletes a draft offer scoped by spaceId', async () => {
    queue('Offer', { data: offerRow({ status: 'draft' }), error: null }); // getOffer
    queue('Offer', { data: null, error: null }); // delete result

    const result = await deleteDraftOffer('space-1', 'offer-1');
    expect(result).toBe(true);

    const deleteCall = calls.find((c) => c.table === 'Offer' && c.chain.some(([m]) => m === 'delete'));
    expect(deleteCall?.chain).toContainEqual(['eq', ['id', 'offer-1']]);
    expect(deleteCall?.chain).toContainEqual(['eq', ['spaceId', 'space-1']]);
  });

  it('returns false for a cross-tenant offer id without issuing a delete', async () => {
    queue('Offer', { data: null, error: null });
    const result = await deleteDraftOffer('space-1', 'offer-in-other-space');
    expect(result).toBe(false);
  });
});
