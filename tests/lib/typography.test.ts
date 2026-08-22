/**
 * typography.ts is the single source of truth for visual hierarchy. A few of
 * its rules are load-bearing design discipline that prose alone can't defend:
 * brand orange lives on the Chippi pill and NOWHERE else among the action
 * pills ("if everything has it, nothing has it"), BODY_COMPACT is a deliberate
 * alias of BODY (the old 13px tier was a dead interval), and the solid action
 * pills carry a focus-visible ring for keyboard a11y. Pin them.
 */

import { describe, it, expect } from 'vitest';
import {
  PRIMARY_PILL,
  CHIPPI_PILL,
  GHOST_PILL,
  QUIET_LINK,
  BODY,
  BODY_COMPACT,
  H1,
  H2,
  H3,
  STAT_NUMBER,
  FONT_SANS_STACK,
  FONT_SERIF_STACK,
} from '@/lib/typography';

describe('typography — brand-orange exclusivity', () => {
  it('puts orange ONLY on the Chippi pill among the action pills', () => {
    expect(CHIPPI_PILL).toContain('orange');
    expect(PRIMARY_PILL).not.toContain('orange');
    expect(GHOST_PILL).not.toContain('orange');
    expect(QUIET_LINK).not.toContain('orange');
  });
});

describe('typography — pill vocabulary is shared', () => {
  it('PRIMARY and CHIPPI share the same pill shape + solid base', () => {
    for (const pill of [PRIMARY_PILL, CHIPPI_PILL]) {
      expect(pill).toContain('rounded-full');
      expect(pill).toContain('px-4');
      expect(pill).toContain('h-9');
      expect(pill).toContain('text-sm');
      expect(pill).toContain('font-medium');
      expect(pill).toContain('bg-foreground');
      expect(pill).toContain('active:scale-[0.98]'); // documented press feedback
    }
  });

  it('keeps a focus-visible ring on the solid pills for keyboard a11y', () => {
    expect(PRIMARY_PILL).toContain('focus-visible:ring-2');
    expect(CHIPPI_PILL).toContain('focus-visible:ring-2');
  });

  it('the ghost pill stays quiet — no solid fill, no ring chrome', () => {
    expect(GHOST_PILL).toContain('rounded-full');
    expect(GHOST_PILL).not.toContain('bg-foreground ');
    expect(GHOST_PILL).toContain('text-muted-foreground');
  });
});

describe('typography — the ladder', () => {
  it('keeps BODY_COMPACT a true alias of BODY (the 13px tier was collapsed)', () => {
    expect(BODY_COMPACT).toBe(BODY);
  });

  it('puts page titles and stats on the serif face, section heads on the UI sans', () => {
    expect(H1).toContain('font-title');
    expect(STAT_NUMBER).toContain('font-title');
    expect(H2).toContain('font-heading');
    expect(H3).toContain('font-heading');
    expect(FONT_SERIF_STACK).toMatch(/Times New Roman/);
    expect(FONT_SANS_STACK).toMatch(/SF Pro Text|system-ui/);
  });
});
