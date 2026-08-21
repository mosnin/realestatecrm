/**
 * Public GET /api/tours/available must treat the realtor's connected
 * calendar as busy time — same connection the write path uses.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { busySlotsMock } = vi.hoisted(() => ({
  busySlotsMock: vi.fn(async () => [] as Array<{ start: number; end: number }>),
}));

vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: vi.fn(async () => ({ id: 'space_1', slug: 'jane', name: 'Jane Realty' })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('@/lib/calendar/busy-times', () => ({
  fetchCalendarBusySlots: (...args: unknown[]) => busySlotsMock(...args),
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      gte: vi.fn(() => chain),
      lte: vi.fn(() => chain),
      order: vi.fn(() => chain),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return chain;
  }
  return { supabase: { from: vi.fn(() => makeChain()) } };
});

import { GET } from '@/app/api/tours/available/route';

function makeReq(date: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/tours/available?slug=jane&date=${date}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
  busySlotsMock.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/tours/available — calendar conflicts', () => {
  it('asks the shared busy-times helper for the same space the book path writes', async () => {
    const res = await GET(makeReq('2026-07-06'));
    expect(res.status).toBe(200);
    expect(busySlotsMock).toHaveBeenCalledWith(
      'space_1',
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('hides a slot that overlaps the realtor calendar', async () => {
    const empty = await GET(makeReq('2026-07-06'));
    const emptyJson = (await empty.json()) as { slots: Array<{ date: string; times: string[] }> };
    const monday = emptyJson.slots.find((s) => s.date === '2026-07-06');
    expect(monday?.times.length).toBeGreaterThan(0);
    const blocked = monday!.times[3];
    expect(blocked).toBeTruthy();

    const start = Date.parse(blocked);
    busySlotsMock.mockResolvedValue([{ start, end: start + 30 * 60_000 }]);

    const res = await GET(makeReq('2026-07-06'));
    const json = (await res.json()) as { slots: Array<{ date: string; times: string[] }> };
    const mondayBusy = json.slots.find((s) => s.date === '2026-07-06');
    expect(mondayBusy?.times ?? []).not.toContain(blocked);
  });
});
