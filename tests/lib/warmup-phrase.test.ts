/**
 * warmupPhraseFor — the honest, time-based status line shown while a Chippi
 * turn is warming up (streaming open, no concrete output yet). The wording must
 * escalate with elapsed time (never sit frozen) and only name the Modal sandbox
 * warmup on a genuine cold start.
 */
import { describe, it, expect } from 'vitest';
import { warmupPhraseFor } from '@/components/chippi/chippi-workspace';

describe('warmupPhraseFor', () => {
  it('cold start names honest warmup steps that escalate with time', () => {
    expect(warmupPhraseFor(true, 0)).toBe('Getting things ready…');
    expect(warmupPhraseFor(true, 3000)).toBe('Warming up…');
    expect(warmupPhraseFor(true, 7000)).toBe('Lining up the work…');
    expect(warmupPhraseFor(true, 20000)).toBe('Still working on it…');
  });

  it('warm turns use calm thinking copy that still escalates when slow', () => {
    expect(warmupPhraseFor(false, 0)).toBe('Thinking…');
    expect(warmupPhraseFor(false, 4000)).toBe('Working it through…');
    expect(warmupPhraseFor(false, 12000)).toBe('Still working on it…');
  });

  it('never names sandbox/infrastructure on a warm turn (honest UI)', () => {
    for (const ms of [0, 2000, 5000, 9000, 30000]) {
      const phrase = warmupPhraseFor(false, ms);
      expect(phrase.toLowerCase()).not.toMatch(/warm|sandbox|ready|lining/);
    }
  });

  it('phrase changes at least twice across a 12s wait (never frozen)', () => {
    const cold = new Set([0, 3000, 7000, 12000].map((ms) => warmupPhraseFor(true, ms)));
    const warm = new Set([0, 4000, 9000].map((ms) => warmupPhraseFor(false, ms)));
    expect(cold.size).toBeGreaterThanOrEqual(3);
    expect(warm.size).toBeGreaterThanOrEqual(3);
  });
});
