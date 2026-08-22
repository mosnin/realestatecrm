/**
 * GET /api/contacts — first-class lead-org filters land on the Contact query
 * after space scope, and a foreign owner never opens another workspace.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Call = { op: string; args: unknown[] };

const { calls, requireSpaceOwner } = vi.hoisted(() => ({
  calls: [] as Call[],
  requireSpaceOwner: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner }));
vi.mock('@/lib/vectorize', () => ({ syncContact: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyNewContact: vi.fn() }));
vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger: vi.fn() }));
vi.mock('@/lib/leads/first-touch', () => ({ fireFirstTouch: vi.fn() }));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflowsForEvent: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (...args: unknown[]) => {
        if (table === 'Contact') calls.push({ op, args });
        return chain;
      };
      chain.select = record('select');
      chain.eq = record('eq');
      chain.is = record('is');
      chain.or = record('or');
      chain.contains = record('contains');
      chain.gt = record('gt');
      chain.gte = record('gte');
      chain.lt = record('lt');
      chain.lte = record('lte');
      chain.maybeSingle = vi.fn(async () => {
        if (table === 'SavedView') return { data: null, error: null };
        return { data: null, error: null };
      });
      chain.order = record('order');
      chain.range = vi.fn(() => {
        calls.push({ op: 'range', args: [] });
        return Promise.resolve({ data: [], error: null });
      });
      return chain;
    }),
  },
}));

import { GET } from '@/app/api/contacts/route';
import { LEAD_ORG_EMPTY_ID, CONTACT_ARCHIVE_UNTIL } from '@/lib/leads/org-filters';

const SPACE = { id: 'space_1', slug: 'acme', ownerId: 'owner_1' };

beforeEach(() => {
  calls.length = 0;
  requireSpaceOwner.mockResolvedValue({ userId: 'user_1', space: SPACE });
});

async function get(qs: string) {
  return GET(new NextRequest(`http://localhost/api/contacts?slug=acme&${qs}`));
}

describe('GET /api/contacts lead-org filters', () => {
  it('always scopes by spaceId before any org filter', async () => {
    const res = await get('segment=buyer&stage=TOUR');
    expect(res.status).toBe(200);
    const spaceEq = calls.find((c) => c.op === 'eq' && c.args[0] === 'spaceId');
    expect(spaceEq).toEqual({ op: 'eq', args: ['spaceId', 'space_1'] });
    expect(calls.findIndex((c) => c.op === 'eq' && c.args[0] === 'spaceId')).toBeLessThan(
      calls.findIndex((c) => c.op === 'eq' && c.args[0] === 'leadType'),
    );
  });

  it('applies segment/stage/source/tag onto existing Contact columns', async () => {
    await get('segment=buyer&stage=TOUR&source=referral&tag=vip');
    expect(calls).toContainEqual({ op: 'eq', args: ['leadType', 'buyer'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['type', 'TOUR'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['source', 'referral'] });
    expect(calls).toContainEqual({ op: 'contains', args: ['tags', ['vip']] });
  });

  it('maps status=archived to the shared snooze sentinel', async () => {
    await get('status=archived');
    expect(calls).toContainEqual({ op: 'gte', args: ['snoozedUntil', CONTACT_ARCHIVE_UNTIL] });
  });

  it('a foreign owner filter matches nothing inside this space — no other spaceId', async () => {
    await get('owner=other_tenant');
    expect(calls).toContainEqual({ op: 'eq', args: ['id', LEAD_ORG_EMPTY_ID] });
    const spaceIds = calls.filter((c) => c.op === 'eq' && c.args[0] === 'spaceId');
    expect(spaceIds).toEqual([{ op: 'eq', args: ['spaceId', 'space_1'] }]);
  });

  it('this-space owner is a no-op (does not add a second tenant column)', async () => {
    await get('owner=owner_1');
    expect(calls.some((c) => c.op === 'eq' && c.args[0] === 'id')).toBe(false);
    expect(calls).toContainEqual({ op: 'eq', args: ['spaceId', 'space_1'] });
  });
});
