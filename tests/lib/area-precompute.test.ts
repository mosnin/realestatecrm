/**
 * Area precompute runner tests — the nightly warm-up that amortizes research
 * cost. Pins: it skips areas already fresh, researches cold ones up to the
 * limit, stops early when research isn't configured, and never throws on a
 * single-area failure.
 *
 * The store is mocked; `server-only` is stubbed globally via vitest.config.mts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { getAreaReportMock, getOrCreateMock } = vi.hoisted(() => ({
  getAreaReportMock: vi.fn(),
  getOrCreateMock: vi.fn(),
}));
vi.mock('@/lib/area-report-store', () => ({
  getAreaReport: getAreaReportMock,
  getOrCreateAreaReport: getOrCreateMock,
}));

import { precomputeSeedAreas, SEED_AREAS } from '@/lib/area-precompute';

const NOW = Date.parse('2026-06-25T00:00:00Z');

beforeEach(() => {
  getAreaReportMock.mockReset();
  getOrCreateMock.mockReset();
  getAreaReportMock.mockResolvedValue(null); // nothing cached → all cold
  getOrCreateMock.mockResolvedValue({ status: 'ok', cached: false, report: {} });
});

describe('precomputeSeedAreas', () => {
  it('researches cold areas up to the limit', async () => {
    const r = await precomputeSeedAreas({ limit: 3, now: NOW });
    expect(r.researched).toBe(3);
    expect(getOrCreateMock).toHaveBeenCalledTimes(3);
  });

  it('skips areas that are already fresh', async () => {
    // First seed is fresh (expires in the future); rest are cold.
    getAreaReportMock.mockImplementation((areaKey: string) =>
      Promise.resolve(
        areaKey.includes('austin')
          ? { expiresAt: new Date(NOW + 5 * 86_400_000).toISOString() }
          : null,
      ),
    );
    const r = await precomputeSeedAreas({ limit: 2, now: NOW });
    expect(r.skippedFresh).toBeGreaterThanOrEqual(1);
    expect(r.researched).toBe(2);
  });

  it('stops early when research is not configured', async () => {
    getOrCreateMock.mockResolvedValue({ status: 'not_configured', missing: ['TAVILY_API_KEY'] });
    const r = await precomputeSeedAreas({ limit: 5, now: NOW });
    expect(r.researched).toBe(0);
    expect(getOrCreateMock).toHaveBeenCalledTimes(1); // bailed after the first
  });

  it('counts failures and keeps going', async () => {
    getOrCreateMock
      .mockResolvedValueOnce({ status: 'error', message: 'boom' })
      .mockResolvedValue({ status: 'ok', cached: false, report: {} });
    const r = await precomputeSeedAreas({ limit: 2, now: NOW });
    expect(r.failed).toBe(1);
    expect(r.researched).toBe(2);
  });

  it('never exceeds the seed list size', async () => {
    const r = await precomputeSeedAreas({ limit: 999, now: NOW });
    expect(r.researched).toBeLessThanOrEqual(SEED_AREAS.length);
  });
});
