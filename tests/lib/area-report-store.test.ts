/**
 * AreaReport store tests — the cache/reuse contract that keeps Property IQ
 * cheap. A fresh cached report is reused without researching; an expired one
 * (or forceRefresh) re-researches and upserts; not_configured / no_evidence
 * pass through without writing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// `server-only` is stubbed globally via vitest.config.mts.
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// ── area-analysis (the network pipeline) is mocked ──────────────────────────
const { analyzeAreaMock, missingKeysMock } = vi.hoisted(() => ({
  analyzeAreaMock: vi.fn(),
  missingKeysMock: vi.fn(() => [] as string[]),
}));
vi.mock('@/lib/area-analysis', () => ({
  analyzeArea: analyzeAreaMock,
  missingResearchKeys: missingKeysMock,
}));

// ── supabase chain mock ─────────────────────────────────────────────────────
const { supabaseMock, state } = vi.hoisted(() => {
  const state = {
    selectRow: null as Record<string, unknown> | null, // what maybeSingle returns
    upsertRow: null as Record<string, unknown> | null, // what upsert .single returns
    upsertError: null as { message: string } | null,
    upsertCalls: 0,
  };
  const chain = {
    select() { return this; },
    eq() { return this; },
    maybeSingle() { return Promise.resolve({ data: state.selectRow, error: null }); },
    upsert(row: Record<string, unknown>) {
      state.upsertCalls += 1;
      state.upsertRow = { ...row };
      return {
        select() { return this; },
        single() {
          return Promise.resolve({ data: state.upsertRow, error: state.upsertError });
        },
      };
    },
  };
  const supabaseMock = { from: () => chain };
  return { supabaseMock, state };
});
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

import { getOrCreateAreaReport } from '@/lib/area-report-store';
import type { NormalizedArea } from '@/lib/areas';

const AREA: NormalizedArea = {
  areaKey: 'zip:78704',
  label: 'Austin, TX 78704',
  city: 'Austin',
  stateRegion: 'TX',
  postalCode: '78704',
};

const NOW = Date.parse('2026-06-25T00:00:00Z');

function intel() {
  return {
    fields: { highlights: [] },
    fieldSources: {},
    verdict: 'A great area.',
    summary: 'A great area.',
    confidence: 'high',
    sources: [],
    stats: { searchResults: 4, scraped: 3 },
    generatedAt: new Date(NOW).toISOString(),
  };
}

beforeEach(() => {
  analyzeAreaMock.mockReset();
  missingKeysMock.mockReturnValue([]);
  state.selectRow = null;
  state.upsertRow = null;
  state.upsertError = null;
  state.upsertCalls = 0;
});

describe('getOrCreateAreaReport', () => {
  it('reuses a fresh cached report without researching', async () => {
    state.selectRow = {
      id: 'ar_1',
      areaKey: AREA.areaKey,
      label: AREA.label,
      intelligence: intel(),
      generatedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 5 * 86_400_000).toISOString(), // 5 days out → fresh
    };
    const out = await getOrCreateAreaReport(AREA, { now: NOW });
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.cached).toBe(true);
    expect(analyzeAreaMock).not.toHaveBeenCalled();
    expect(state.upsertCalls).toBe(0);
  });

  it('re-researches and upserts when the cached report is expired', async () => {
    state.selectRow = {
      id: 'ar_old',
      areaKey: AREA.areaKey,
      label: AREA.label,
      intelligence: intel(),
      generatedAt: new Date(NOW - 60 * 86_400_000).toISOString(),
      expiresAt: new Date(NOW - 1 * 86_400_000).toISOString(), // expired yesterday
    };
    analyzeAreaMock.mockResolvedValue({ status: 'ok', intelligence: intel() });
    const out = await getOrCreateAreaReport(AREA, { now: NOW });
    expect(analyzeAreaMock).toHaveBeenCalledOnce();
    expect(state.upsertCalls).toBe(1);
    // Reuses the existing row id across refresh so links don't break.
    expect(state.upsertRow?.id).toBe('ar_old');
    expect(out.status).toBe('ok');
    if (out.status === 'ok') expect(out.cached).toBe(false);
  });

  it('forceRefresh re-researches even when a fresh report exists', async () => {
    state.selectRow = {
      id: 'ar_1',
      areaKey: AREA.areaKey,
      label: AREA.label,
      intelligence: intel(),
      generatedAt: new Date(NOW).toISOString(),
      expiresAt: new Date(NOW + 5 * 86_400_000).toISOString(),
    };
    analyzeAreaMock.mockResolvedValue({ status: 'ok', intelligence: intel() });
    await getOrCreateAreaReport(AREA, { now: NOW, forceRefresh: true });
    expect(analyzeAreaMock).toHaveBeenCalledOnce();
    expect(state.upsertCalls).toBe(1);
  });

  it('passes through not_configured without researching', async () => {
    missingKeysMock.mockReturnValue(['TAVILY_API_KEY']);
    const out = await getOrCreateAreaReport(AREA, { now: NOW });
    expect(out.status).toBe('not_configured');
    expect(analyzeAreaMock).not.toHaveBeenCalled();
    expect(state.upsertCalls).toBe(0);
  });

  it('passes through no_evidence and does not upsert', async () => {
    analyzeAreaMock.mockResolvedValue({ status: 'no_evidence', generatedAt: new Date(NOW).toISOString() });
    const out = await getOrCreateAreaReport(AREA, { now: NOW });
    expect(out.status).toBe('no_evidence');
    expect(state.upsertCalls).toBe(0);
  });
});
