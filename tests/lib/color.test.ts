/**
 * pickContrastColor — picks readable text (white or near-black) for a given
 * background hex. Pins the luminance decision and the robustness guards (null,
 * malformed hex) since the accent color it reads is user-supplied and nullable.
 */

import { describe, it, expect } from 'vitest';
import { pickContrastColor } from '@/lib/color';

describe('pickContrastColor', () => {
  it('uses dark text on light backgrounds', () => {
    expect(pickContrastColor('#ffffff')).toBe('#0c0c0d');
    expect(pickContrastColor('#ffeb3b')).toBe('#0c0c0d'); // bright yellow
    expect(pickContrastColor('#fff')).toBe('#0c0c0d'); // 3-digit shorthand
  });

  it('uses white text on dark backgrounds', () => {
    expect(pickContrastColor('#000000')).toBe('#ffffff');
    expect(pickContrastColor('#1d4ed8')).toBe('#ffffff'); // deep blue
    expect(pickContrastColor('#000')).toBe('#ffffff');
  });

  it('tolerates a missing leading hash and surrounding whitespace', () => {
    expect(pickContrastColor('  ffffff ')).toBe('#0c0c0d');
    expect(pickContrastColor('000')).toBe('#ffffff');
  });

  it('falls back to white for null / undefined (never throws)', () => {
    expect(pickContrastColor(null)).toBe('#ffffff');
    expect(pickContrastColor(undefined)).toBe('#ffffff');
  });

  it('falls back to white for malformed hex (bad length or non-hex chars)', () => {
    expect(pickContrastColor('#gggggg')).toBe('#ffffff');
    expect(pickContrastColor('#12345')).toBe('#ffffff');
    expect(pickContrastColor('purple')).toBe('#ffffff');
    expect(pickContrastColor('')).toBe('#ffffff');
  });
});
