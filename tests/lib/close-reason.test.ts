/**
 * Unit tests for the close-reason taxonomy helpers (lib/close-reason.ts).
 * normalizeCloseReason enforces that a won deal only carries a won reason (and a
 * lost deal a lost reason), and never throws — the affordance is optional.
 */
import { describe, it, expect } from 'vitest';
import {
  WON_CLOSE_REASONS,
  LOST_CLOSE_REASONS,
  isCloseReason,
  normalizeCloseReason,
  closeReasonLabel,
  closeReasonOptions,
} from '@/lib/close-reason';

describe('close-reason taxonomy', () => {
  it('recognizes every won and lost reason key', () => {
    for (const r of [...WON_CLOSE_REASONS, ...LOST_CLOSE_REASONS]) {
      expect(isCloseReason(r)).toBe(true);
    }
    expect(isCloseReason('not_a_reason')).toBe(false);
    expect(isCloseReason(null)).toBe(false);
  });

  it('accepts a won reason only for a won outcome', () => {
    expect(normalizeCloseReason('price', 'won')).toBe('price');
    // a won reason supplied for a lost outcome is rejected
    expect(normalizeCloseReason('price', 'lost')).toBeNull();
  });

  it('accepts a lost reason only for a lost outcome', () => {
    expect(normalizeCloseReason('financing_fell_through', 'lost')).toBe('financing_fell_through');
    expect(normalizeCloseReason('financing_fell_through', 'won')).toBeNull();
  });

  it('returns null for unknown values without throwing', () => {
    for (const bad of ['', 'whatever', 123, null, undefined, {}]) {
      expect(normalizeCloseReason(bad, 'won')).toBeNull();
      expect(normalizeCloseReason(bad, 'lost')).toBeNull();
    }
  });

  it('labels reasons and falls back to "Unspecified"', () => {
    expect(closeReasonLabel('price')).toBe('Price');
    expect(closeReasonLabel('went_with_other_agent')).toBe('Went with another agent');
    expect(closeReasonLabel(null)).toBe('Unspecified');
    expect(closeReasonLabel('nope')).toBe('Unspecified');
  });

  it('exposes ordered {key,label} options per outcome', () => {
    const won = closeReasonOptions('won');
    expect(won.map((o) => o.key)).toEqual([...WON_CLOSE_REASONS]);
    expect(won[0]).toEqual({ key: 'price', label: 'Price' });

    const lost = closeReasonOptions('lost');
    expect(lost.map((o) => o.key)).toEqual([...LOST_CLOSE_REASONS]);
  });
});
