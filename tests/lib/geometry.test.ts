/**
 * geometry.ts is the macro-frame single-source-of-truth: "the geometry can
 * never silently drift." But the Tailwind class strings (w-[240px],
 * max-w-[868px], ...) are hand-written duplicates of the numeric px constants
 * — nothing in the module guarantees they agree. These tests lock the two
 * together: the rhythm multiples, the φ derivations, and that every arbitrary
 * Tailwind width embeds exactly its corresponding px constant. Edit PHI or a
 * px ceiling without updating its class string and one of these fails.
 */

import { describe, it, expect } from 'vitest';
import {
  RHYTHM_U,
  PHI,
  SIDEBAR_WIDTH_PX,
  SIDEBAR_COLLAPSED_PX,
  CHIPPI_BAR_WIDTH_PX,
  PAGE_PAD_LG_PX,
  PAGE_MAX_PX,
  CONTENT_COLUMN_PX,
  FOCUS_CARD_WIDTH_PX,
  SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED,
  PAGE_MAX,
  FOCUS_CARD_MAX,
} from '@/lib/geometry';

describe('geometry — rhythm family (multiples of RHYTHM_U)', () => {
  it('keeps the harmonic unit at 48', () => {
    expect(RHYTHM_U).toBe(48);
  });

  it('derives each rhythm width as the documented multiple', () => {
    expect(SIDEBAR_WIDTH_PX).toBe(RHYTHM_U * 5); // 240
    expect(CHIPPI_BAR_WIDTH_PX).toBe(RHYTHM_U * 16); // 768
    expect(PAGE_PAD_LG_PX).toBe(RHYTHM_U * 1); // 48
  });

  it('documents the collapsed sidebar as the named non-rhythm exception', () => {
    expect(SIDEBAR_COLLAPSED_PX).toBe(56);
    expect(SIDEBAR_COLLAPSED_PX % RHYTHM_U).not.toBe(0); // intentionally off-lattice
  });
});

describe('geometry — φ family (the FocusCard chain)', () => {
  it('uses the true golden ratio', () => {
    expect(PHI).toBeCloseTo(1.618033988, 6);
  });

  it('derives the content column and the golden FocusCard width', () => {
    expect(CONTENT_COLUMN_PX).toBe(PAGE_MAX_PX - 2 * PAGE_PAD_LG_PX); // 1404
    expect(CONTENT_COLUMN_PX).toBe(1404);
    expect(FOCUS_CARD_WIDTH_PX).toBe(Math.round(CONTENT_COLUMN_PX / PHI)); // 868
    expect(FOCUS_CARD_WIDTH_PX).toBe(868);
  });
});

describe('geometry — Tailwind class strings must embed their px constant', () => {
  it('binds every arbitrary-value width class to its numeric source', () => {
    expect(SIDEBAR_WIDTH).toBe(`w-[${SIDEBAR_WIDTH_PX}px]`);
    expect(SIDEBAR_COLLAPSED).toBe(`w-[${SIDEBAR_COLLAPSED_PX}px]`);
    expect(PAGE_MAX).toBe(`max-w-[${PAGE_MAX_PX}px]`);
    expect(FOCUS_CARD_MAX).toBe(`max-w-[${FOCUS_CARD_WIDTH_PX}px]`);
  });
});
