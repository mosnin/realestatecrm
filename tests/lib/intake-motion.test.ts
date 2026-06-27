/**
 * blurRise / blurRiseStep build the intake-chat entrance props that mirror the
 * onboarding "arrival" motion: content blur-rises into place (y-translate +
 * resolving blur). Both MUST collapse to an opacity-only fade when the visitor
 * prefers reduced motion, and blurRiseStep's exit must mirror the enter offset
 * (-y) so a step lifts away as the next blur-rises in. Pin both branches — a
 * regression here either breaks reduced-motion accessibility or desyncs the
 * intake from the brand's shared motion vocabulary.
 */

import { describe, it, expect } from 'vitest';
import { blurRise, blurRiseStep } from '@/components/intake-chat/intake-motion';

describe('blurRise', () => {
  it('blur-rises with the default y/blur settle when motion is allowed', () => {
    expect(blurRise(false)).toEqual({
      initial: { opacity: 0, y: 14, filter: 'blur(10px)' },
      animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    });
  });

  it('honors custom y and blur radii', () => {
    expect(blurRise(false, 20, 6)).toEqual({
      initial: { opacity: 0, y: 20, filter: 'blur(6px)' },
      animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    });
  });

  it('collapses to an opacity-only fade under reduced motion (no y/blur)', () => {
    expect(blurRise(true)).toEqual({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
    });
  });
});

describe('blurRiseStep', () => {
  it('adds a symmetric exit that mirrors the enter offset (-y)', () => {
    expect(blurRiseStep(false)).toEqual({
      initial: { opacity: 0, y: 18, filter: 'blur(12px)' },
      animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
      exit: { opacity: 0, y: -18, filter: 'blur(12px)' },
    });
  });

  it('mirrors custom y on exit', () => {
    expect(blurRiseStep(false, 30, 8).exit).toEqual({
      opacity: 0,
      y: -30,
      filter: 'blur(8px)',
    });
  });

  it('collapses to an opacity-only cross-fade under reduced motion', () => {
    expect(blurRiseStep(true)).toEqual({
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    });
  });
});
