/**
 * pickGreeting — deterministic server-picked splash greeting. The invariant
 * that matters most is identical text across repeated server/RSC renders so
 * the client never hydrates a different greeting.
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

  it('is deterministic across repeated renders for hydration safety', () => {
    const first = pickGreeting('Sam');
    for (let i = 0; i < 100; i++) expect(pickGreeting('Sam')).toBe(first);
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
