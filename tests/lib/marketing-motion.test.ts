/**
 * marketing-motion encodes a stated design discipline: "short, calm fades with
 * a small translate. No springs, no rotates, no scale-from-zero" and entrances
 * capped well under the 600ms that reads as vibe-coded. Prose can't enforce
 * that — these tests make it executable: durations stay <= 0.5s, eases are the
 * Apple curve, transforms are opacity + small y only, and nothing is a spring.
 * Add a spring or a 700ms entrance and CI fails.
 */

import { describe, it, expect } from 'vitest';
import {
  MARKETING_REVEAL,
  MARKETING_STAGGER_CONTAINER,
  MARKETING_STAGGER_ITEM,
  MARKETING_HERO_REVEAL,
  MARKETING_VIEWPORT,
  MARKETING_HOVER,
} from '@/lib/marketing-motion';
import { EASE_APPLE } from '@/lib/motion';

const REVEALS = {
  MARKETING_REVEAL,
  MARKETING_STAGGER_ITEM,
  MARKETING_HERO_REVEAL,
};

describe('marketing-motion — entrance discipline', () => {
  it('every reveal fades opacity 0 -> 1 with a small upward translate', () => {
    for (const v of Object.values(REVEALS)) {
      expect(v.initial).toMatchObject({ opacity: 0 });
      expect(v.enter).toMatchObject({ opacity: 1, y: 0 });
      // small translate only — never a big slide
      const initialY = (v.initial as { y: number }).y;
      expect(initialY).toBeGreaterThan(0);
      expect(initialY).toBeLessThanOrEqual(14);
    }
  });

  it('caps every entrance duration at 0.5s (past that it reads as animation)', () => {
    for (const v of Object.values(REVEALS)) {
      const t = (v.enter as { transition: { duration: number } }).transition;
      expect(t.duration).toBeGreaterThan(0);
      expect(t.duration).toBeLessThanOrEqual(0.5);
    }
  });

  it('uses the Apple ease curve, never a spring', () => {
    for (const v of Object.values(REVEALS)) {
      const t = (v.enter as { transition: Record<string, unknown> }).transition;
      expect(t.ease).toEqual(EASE_APPLE);
      expect(t.type).not.toBe('spring');
    }
  });

  it('never uses rotate or scale transforms', () => {
    for (const v of Object.values(REVEALS)) {
      for (const phase of [v.initial, v.enter] as Record<string, unknown>[]) {
        expect(phase).not.toHaveProperty('rotate');
        expect(phase).not.toHaveProperty('scale');
      }
    }
  });

  it('lets the hero settle slightly slower than a section reveal, still under the cap', () => {
    const hero = (MARKETING_HERO_REVEAL.enter as { transition: { duration: number } }).transition;
    const section = (MARKETING_REVEAL.enter as { transition: { duration: number } }).transition;
    expect(hero.duration).toBeGreaterThan(section.duration);
    expect(hero.duration).toBeLessThanOrEqual(0.5);
  });
});

describe('marketing-motion — stagger + viewport', () => {
  it('staggers children with small gentle gaps', () => {
    const t = (MARKETING_STAGGER_CONTAINER.enter as { transition: Record<string, number> }).transition;
    expect(t.staggerChildren).toBeGreaterThan(0);
    expect(t.staggerChildren).toBeLessThanOrEqual(0.1);
    expect(t.delayChildren).toBeLessThanOrEqual(0.1);
  });

  it('reveals once and does not re-trigger on scroll-back', () => {
    expect(MARKETING_VIEWPORT.once).toBe(true);
    expect(MARKETING_VIEWPORT.amount).toBeGreaterThan(0);
  });

  it('keeps the rare hover quick and on the Apple curve', () => {
    expect(MARKETING_HOVER.duration).toBeLessThanOrEqual(0.2);
    expect((MARKETING_HOVER as { ease: unknown }).ease).toEqual(EASE_APPLE);
  });
});
