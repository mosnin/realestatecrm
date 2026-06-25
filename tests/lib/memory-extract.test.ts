/**
 * Automatic memory extraction (P3) — the two pieces with real logic:
 *   - parseCandidates: tolerant of model junk, clamps/sanitizes, caps count.
 *   - storeNovelCandidates: dedupes against existing memories by similarity so
 *     the Memory list doesn't fill with near-duplicates; never throws.
 *
 * The LLM distill itself isn't unit-tested (it's a network call); these pin the
 * deterministic guardrails around it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { recallMock, storeMock } = vi.hoisted(() => ({
  recallMock: vi.fn(),
  storeMock: vi.fn(),
}));
vi.mock('@/lib/agent-memory/store', () => ({
  recallMemory: recallMock,
  storeMemory: storeMock,
}));

import { parseCandidates, storeNovelCandidates } from '@/lib/agent-memory/extract';

beforeEach(() => {
  recallMock.mockReset();
  storeMock.mockReset();
  recallMock.mockResolvedValue([]);
  storeMock.mockResolvedValue({ id: 'm_new' });
});

describe('parseCandidates', () => {
  it('parses a well-formed memories array', () => {
    const out = parseCandidates(
      JSON.stringify({
        memories: [
          { content: 'Works mainly with first-time buyers in Austin', kind: 'fact', importance: 0.8 },
          { content: 'Prefers texting over email', kind: 'preference', importance: 0.4 },
        ],
      }),
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ kind: 'fact', importance: 0.8 });
    expect(out[1]).toMatchObject({ kind: 'preference' });
  });

  it('returns [] for non-JSON or missing array', () => {
    expect(parseCandidates('not json')).toEqual([]);
    expect(parseCandidates('{}')).toEqual([]);
    expect(parseCandidates(JSON.stringify({ memories: 'nope' }))).toEqual([]);
  });

  it('clamps importance to [0,1] and defaults bad values', () => {
    const out = parseCandidates(
      JSON.stringify({
        memories: [
          { content: 'a durable fact about the agent', kind: 'fact', importance: 5 },
          { content: 'another durable fact here', kind: 'fact', importance: 'high' },
        ],
      }),
    );
    expect(out[0].importance).toBe(1);
    expect(out[1].importance).toBe(0.5);
  });

  it('defaults an unknown kind to "fact" and drops too-short content', () => {
    const out = parseCandidates(
      JSON.stringify({
        memories: [
          { content: 'ok', kind: 'preference' }, // too short → dropped
          { content: 'a real durable fact', kind: 'wat' }, // unknown kind → fact
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('fact');
  });

  it('caps at three candidates', () => {
    const memories = Array.from({ length: 6 }, (_, i) => ({
      content: `durable fact number ${i}`,
      kind: 'fact',
      importance: 0.5,
    }));
    expect(parseCandidates(JSON.stringify({ memories }))).toHaveLength(3);
  });
});

describe('storeNovelCandidates', () => {
  const cands = [
    { content: 'Works with first-time buyers', kind: 'fact' as const, importance: 0.8 },
  ];

  it('stores a candidate when nothing similar exists', async () => {
    recallMock.mockResolvedValue([]);
    const n = await storeNovelCandidates('sp1', cands);
    expect(n).toBe(1);
    expect(storeMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'sp1', kind: 'fact', content: 'Works with first-time buyers' }),
    );
  });

  it('skips a candidate that is already remembered (similarity >= 0.9)', async () => {
    recallMock.mockResolvedValue([{ content: 'Works with first-time buyers', similarity: 0.95 }]);
    const n = await storeNovelCandidates('sp1', cands);
    expect(n).toBe(0);
    expect(storeMock).not.toHaveBeenCalled();
  });

  it('stores when the closest existing memory is only loosely related', async () => {
    recallMock.mockResolvedValue([{ content: 'Likes golf', similarity: 0.42 }]);
    const n = await storeNovelCandidates('sp1', cands);
    expect(n).toBe(1);
    expect(storeMock).toHaveBeenCalledTimes(1);
  });

  it('never throws when a store fails, and keeps going', async () => {
    storeMock.mockRejectedValueOnce(new Error('db down'));
    const two = [
      { content: 'First durable fact about them', kind: 'fact' as const, importance: 0.6 },
      { content: 'Second durable fact about them', kind: 'fact' as const, importance: 0.6 },
    ];
    const n = await storeNovelCandidates('sp1', two);
    // First throws (swallowed), second succeeds.
    expect(n).toBe(1);
  });
});
