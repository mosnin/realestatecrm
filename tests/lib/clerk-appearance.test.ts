/**
 * clerkAuthAppearance(isDark) maps the theme into Clerk's appearance config so
 * its internal state colors line up with the paper-flat auth chrome (the .cl-*
 * overrides in globals.css are the rest of the truth). The brand choice that
 * must not regress: the primary is FOREGROUND (near-black light / near-white
 * dark), never orange — and the chrome-stripping layout (hidden header/footer,
 * transparent card) stays constant across themes. Pin the theme flip + invariants.
 */

import { describe, it, expect } from 'vitest';
import { clerkAuthAppearance } from '@/components/auth/clerk-appearance';

describe('clerkAuthAppearance', () => {
  it('uses foreground (not orange) as primary, flipped by theme', () => {
    const light = clerkAuthAppearance(false);
    const dark = clerkAuthAppearance(true);
    expect(light.variables.colorPrimary).toBe('#1c1917'); // near-black
    expect(dark.variables.colorPrimary).toBe('#f1f3f5'); // near-white
    // primary and neutral track the same foreground tone
    expect(light.variables.colorNeutral).toBe(light.variables.colorPrimary);
    expect(dark.variables.colorNeutral).toBe(dark.variables.colorPrimary);
  });

  it('keeps non-color variables stable across themes', () => {
    const light = clerkAuthAppearance(false);
    const dark = clerkAuthAppearance(true);
    expect(light.variables.borderRadius).toBe('0.375rem');
    expect(dark.variables.borderRadius).toBe(light.variables.borderRadius);
    expect(dark.variables.fontSize).toBe(light.variables.fontSize);
    expect(dark.variables.fontFamily).toBe(light.variables.fontFamily);
  });

  it('strips Clerk chrome the same way regardless of theme', () => {
    const light = clerkAuthAppearance(false);
    const dark = clerkAuthAppearance(true);
    expect(light.elements).toEqual(dark.elements);
    expect(light.elements.header).toBe('hidden');
    expect(light.elements.footer).toBe('hidden');
    expect(light.elements.card).toContain('bg-transparent');
    expect(light.layout).toEqual(dark.layout);
    expect(light.layout.socialButtonsPlacement).toBe('top');
  });
});
