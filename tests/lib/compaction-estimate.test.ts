/**
 * estimateContextChars is the cheap size gauge compactContext uses to decide
 * whether the agent conversation has outgrown its char budget (and must be
 * summarized). It sums message content lengths and must tolerate missing/empty
 * content without throwing — a wrong total either compacts too eagerly (losing
 * context) or never (blowing the window). Pin the sum + the null-safety.
 */

import { describe, it, expect } from 'vitest';
import { estimateContextChars } from '@/lib/agent/compaction';

describe('estimateContextChars', () => {
  it('sums the content lengths across messages', () => {
    expect(estimateContextChars([
      { role: 'user', content: 'hello' }, // 5
      { role: 'assistant', content: 'hi there' }, // 8
    ])).toBe(13);
  });

  it('is 0 for an empty conversation', () => {
    expect(estimateContextChars([])).toBe(0);
  });

  it('treats missing / empty content as 0 (never throws)', () => {
    expect(estimateContextChars([
      { role: 'user', content: '' },
      { role: 'tool', content: undefined as unknown as string },
      { role: 'assistant', content: 'abc' }, // 3
    ])).toBe(3);
  });

  it('counts unicode by code-unit length (matches .length)', () => {
    const s = 'café'; // 4 code units
    expect(estimateContextChars([{ role: 'user', content: s }])).toBe(s.length);
  });
});
