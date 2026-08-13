import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const orderCalls: Array<[string, { ascending: boolean }]> = [];
const rangeCalls: Array<[number, number]> = [];

vi.mock('@/lib/api-auth', () => ({
  requireSpaceOwner: vi.fn(async () => ({ userId: 'user-1', space: { id: 'space-1' } })),
}));
vi.mock('@/lib/vectorize', () => ({ syncContact: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notifyNewContact: vi.fn() }));
vi.mock('@/lib/agent/fire-trigger', () => ({ fireAgentTrigger: vi.fn() }));
vi.mock('@/lib/leads/first-touch', () => ({ fireFirstTouch: vi.fn() }));
vi.mock('@/lib/workflows/executor', () => ({ runWorkflowsForEvent: vi.fn() }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.is = vi.fn(() => chain);
      chain.or = vi.fn(() => chain);
      chain.gt = vi.fn(() => chain);
      chain.order = vi.fn((column: string, options: { ascending: boolean }) => {
        orderCalls.push([column, options]);
        return chain;
      });
      chain.range = vi.fn((from: number, to: number) => {
        rangeCalls.push([from, to]);
        return Promise.resolve({ data: [], error: null });
      });
      return chain;
    }),
  },
}));

import { GET } from '@/app/api/contacts/route';

beforeEach(() => {
  orderCalls.length = 0;
  rangeCalls.length = 0;
});

describe('GET /api/contacts pagination', () => {
  it('uses a unique deterministic order across 500-row offset boundaries', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/contacts?slug=home&limit=500&offset=500'),
    );

    expect(response.status).toBe(200);
    expect(orderCalls).toEqual([
      ['createdAt', { ascending: false }],
      ['id', { ascending: true }],
    ]);
    expect(rangeCalls).toEqual([[500, 999]]);
  });
});
