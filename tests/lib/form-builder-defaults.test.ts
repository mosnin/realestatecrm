/**
 * getDefaultFormConfig is the selector that decides which starter intake form a
 * new space gets (buyer vs rental); snapshotFormConfig freezes the form shape at
 * submission time so later edits to the live form can't retro-change stored
 * answers' structure. Pin the selector's mapping + leadType tag, and the
 * snapshot's deep-clone + deep-freeze guarantees — a regression in either
 * corrupts onboarding or historical submissions.
 */

import { describe, it, expect } from 'vitest';
import {
  getDefaultFormConfig,
  snapshotFormConfig,
  DEFAULT_BUYER_FORM_CONFIG,
  DEFAULT_RENTAL_FORM_CONFIG,
} from '@/lib/form-builder';

describe('getDefaultFormConfig', () => {
  it('returns the buyer config for buyer and the rental config for rental', () => {
    expect(getDefaultFormConfig('buyer')).toBe(DEFAULT_BUYER_FORM_CONFIG);
    expect(getDefaultFormConfig('rental')).toBe(DEFAULT_RENTAL_FORM_CONFIG);
  });

  it('tags each default with its own leadType (self-consistent)', () => {
    expect(getDefaultFormConfig('buyer').leadType).toBe('buyer');
    expect(getDefaultFormConfig('rental').leadType).toBe('rental');
  });
});

describe('snapshotFormConfig', () => {
  it('returns a deep copy — mutating the source never touches the snapshot', () => {
    const source = getDefaultFormConfig('rental');
    const snap = snapshotFormConfig(source);
    expect(snap).not.toBe(source); // new reference
    expect(snap.sections).not.toBe(source.sections); // nested arrays cloned too
    expect(snap).toEqual(source); // but structurally identical
  });

  it('freezes the snapshot so it cannot be mutated after the fact', () => {
    const snap = snapshotFormConfig(getDefaultFormConfig('buyer'));
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as { version: number }).version = 999;
    }).toThrow();
    expect(snap.version).toBe(DEFAULT_BUYER_FORM_CONFIG.version);
  });

  it('preserves the leadType and section ids through the snapshot', () => {
    const source = getDefaultFormConfig('rental');
    const snap = snapshotFormConfig(source);
    expect(snap.leadType).toBe('rental');
    expect(snap.sections.map((s) => s.id)).toEqual(source.sections.map((s) => s.id));
  });
});
