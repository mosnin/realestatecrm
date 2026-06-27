/**
 * The media aspect-ratio + fit helpers map a tool's declared ratio/fit onto the
 * Tailwind classes the media frame renders. The schemas default to the safe
 * "auto"/"cover" when a tool omits them, and RATIO_CLASS_MAP must cover every
 * ratio the schema allows (a missing entry renders an undefined class). Pin the
 * class lookups, the schema defaults + rejection, and full enum coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  AspectRatioSchema,
  MediaFitSchema,
  RATIO_CLASS_MAP,
  getRatioClass,
  getFitClass,
} from '@/components/tool-ui/shared/media/aspect-ratio';

describe('getRatioClass', () => {
  it('maps each ratio to its Tailwind class (auto = none)', () => {
    expect(getRatioClass('auto')).toBe('');
    expect(getRatioClass('1:1')).toBe('aspect-square');
    expect(getRatioClass('4:3')).toBe('aspect-[4/3]');
    expect(getRatioClass('16:9')).toBe('aspect-video');
    expect(getRatioClass('9:16')).toBe('aspect-[9/16]');
  });
});

describe('getFitClass', () => {
  it('maps cover/contain to object-fit classes', () => {
    expect(getFitClass('cover')).toBe('object-cover');
    expect(getFitClass('contain')).toBe('object-contain');
  });
});

describe('schemas', () => {
  it('default to the safe values when omitted', () => {
    expect(AspectRatioSchema.parse(undefined)).toBe('auto');
    expect(MediaFitSchema.parse(undefined)).toBe('cover');
  });

  it('accept valid values and reject junk', () => {
    expect(AspectRatioSchema.parse('16:9')).toBe('16:9');
    expect(AspectRatioSchema.safeParse('3:2').success).toBe(false);
    expect(MediaFitSchema.safeParse('fill').success).toBe(false);
  });
});

describe('RATIO_CLASS_MAP coverage', () => {
  it('has a class for every ratio the schema allows', () => {
    for (const ratio of ['auto', '1:1', '4:3', '16:9', '9:16'] as const) {
      expect(ratio in RATIO_CLASS_MAP).toBe(true);
      expect(typeof RATIO_CLASS_MAP[ratio]).toBe('string');
    }
  });
});
