/**
 * pickGreeting — the server-picked splash greeting. It's random, so pin the
 * invariants that hold across every draw: the result is always a real pool
 * member (never undefined), it embeds the TRIMMED name when one is given and
 * never the raw untrimmed string, and a blank/whitespace name falls back to
 * the no-name pool. Drawing many times exercises the whole pool.
 */

import { describe, it, expect } from 'vitest';
import { pickGreeting } from '@/lib/greetings';

const NAMED_POOL = (n: string) => [
  `Welcome back, ${n}.`,
  `Good to see you, ${n}.`,
  `Hey, ${n}.`,
  `${n}, let's get into it.`,
  `Back at it, ${n}.`,
  `Ready when you are, ${n}.`,
  `Let's make it count, ${n}.`,
];

const ANON_POOL = [
  'Welcome back.',
  'Good to see you.',
  "Let's get into it.",
  'Back at it.',
  'Ready when you are.',
];

describe('pickGreeting', () => {
  it('always returns a real member of the named pool when given a name', () => {
    const pool = new Set(NAMED_POOL('Sam'));
    for (let i = 0; i < 100; i++) {
      const g = pickGreeting('Sam');
      expect(g).toBeTypeOf('string');
      expect(pool.has(g)).toBe(true);
    }
  });

  it('eventually surfaces every named variant (random covers the pool)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(pickGreeting('Sam'));
    expect(seen.size).toBe(NAMED_POOL('Sam').length);
  });

  it('trims the name and never echoes surrounding whitespace', () => {
    for (let i = 0; i < 50; i++) {
      const g = pickGreeting('  Sam  ');
      expect(g).toContain('Sam');
      expect(g).not.toContain('  Sam  ');
      expect(NAMED_POOL('Sam')).toContain(g);
    }
  });

  it('falls back to the no-name pool for empty or whitespace-only input', () => {
    const anon = new Set(ANON_POOL);
    for (const input of ['', '   ']) {
      for (let i = 0; i < 50; i++) {
        const g = pickGreeting(input);
        expect(anon.has(g)).toBe(true);
      }
    }
  });

  it('does not throw on a null-ish name (defends the runtime contract)', () => {
    const anon = new Set(ANON_POOL);
    // Callers are typed string, but the `?? ''` guard exists for a reason.
    const g = pickGreeting(null as unknown as string);
    expect(anon.has(g)).toBe(true);
  });
});
