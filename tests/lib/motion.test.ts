/**
 * motion.ts is the core motion vocabulary the whole app imports. It documents
 * hard thresholds — the FAST<BASE<SLOW ladder, a 180ms drop, chat entrances
 * "short of the 0.3s threshold that feels sluggish", a 40ms stagger "not the
 * 100ms that reads as animation", subtle dialog scale (not scale-from-zero).
 * These tests make those numbers load-bearing: drift one and CI fails.
 */

import { describe, it, expect } from 'vitest';
import {
  EASE_OUT,
  EASE_IN_OUT,
  EASE_APPLE,
  DURATION_FAST,
  DURATION_BASE,
  DURATION_SLOW,
  DURATION_DROP,
  PAGE_VARIANTS,
  STAGGER_ITEM,
  CHAT_ENTRANCE_VARIANTS,
  CHAT_STAGGER_DELAY,
  DIALOG_VARIANTS,
} from '@/lib/motion';

const REVEALS = { PAGE_VARIANTS, STAGGER_ITEM, CHAT_ENTRANCE_VARIANTS, DIALOG_VARIANTS };

describe('motion — duration ladder', () => {
  it('keeps fast < base < slow, all calm and positive', () => {
    expect(DURATION_FAST).toBeGreaterThan(0);
    expect(DURATION_FAST).toBeLessThan(DURATION_BASE);
    expect(DURATION_BASE).toBeLessThan(DURATION_SLOW);
    expect(DURATION_SLOW).toBeLessThanOrEqual(0.32);
  });

  it('pins the kanban drop to the Apple 180ms guideline', () => {
    expect(DURATION_DROP).toBe(0.18);
  });

  it('keeps the chat stagger at the Apple 40ms cadence, never the 100ms tell', () => {
    expect(CHAT_STAGGER_DELAY).toBe(0.04);
    expect(CHAT_STAGGER_DELAY).toBeLessThan(0.1);
  });
});

describe('motion — ease curves are valid cubic-beziers', () => {
  it('each ease is a 4-tuple with control-point x in [0,1]', () => {
    for (const ease of [EASE_OUT, EASE_IN_OUT, EASE_APPLE]) {
      expect(ease).toHaveLength(4);
      expect(ease[0]).toBeGreaterThanOrEqual(0);
      expect(ease[0]).toBeLessThanOrEqual(1);
      expect(ease[2]).toBeGreaterThanOrEqual(0);
      expect(ease[2]).toBeLessThanOrEqual(1);
    }
  });
});

describe('motion — entrance variants stay calm', () => {
  it('every reveal fades opacity 0 -> 1 with a small (<=8px) upward translate', () => {
    for (const v of Object.values(REVEALS)) {
      expect(v.initial).toMatchObject({ opacity: 0 });
      expect(v.enter).toMatchObject({ opacity: 1, y: 0 });
      const initialY = (v.initial as { y: number }).y;
      expect(initialY).toBeGreaterThan(0);
      expect(initialY).toBeLessThanOrEqual(8);
    }
  });

  it('caps each entrance duration under the 0.3s sluggish threshold', () => {
    for (const v of Object.values(REVEALS)) {
      const t = (v.enter as { transition: { duration: number; type?: string } }).transition;
      expect(t.duration).toBeGreaterThan(0);
      expect(t.duration).toBeLessThan(0.3);
      expect(t.type).not.toBe('spring');
    }
  });

  it('scales the dialog in subtly — never from zero', () => {
    const initialScale = (DIALOG_VARIANTS.initial as { scale: number }).scale;
    expect(initialScale).toBeGreaterThanOrEqual(0.9);
    expect(initialScale).toBeLessThan(1);
    expect(DIALOG_VARIANTS.enter).toMatchObject({ scale: 1 });
  });
});
