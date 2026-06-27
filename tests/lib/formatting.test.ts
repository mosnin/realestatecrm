/**
 * Shared formatting helpers — imported across ~74 files, so a garbage input
 * leaking "Invalid Date" or "$NaN" into the UI would show up everywhere. These
 * pin the happy paths AND the robustness guards.
 */

import { describe, it, expect } from 'vitest';
import {
  timeAgo,
  formatCurrency,
  formatCompact,
  getInitials,
  formatFollowUpDate,
  toDateInputValue,
} from '@/lib/formatting';

describe('timeAgo', () => {
  it('renders recent durations', () => {
    expect(timeAgo(Date.now())).toBe('just now');
    expect(timeAgo(Date.now() - 5 * 60_000)).toBe('5m ago');
    expect(timeAgo(Date.now() - 3 * 3_600_000)).toBe('3h ago');
    expect(timeAgo(Date.now() - 2 * 86_400_000)).toBe('2d ago');
  });

  it('treats a future timestamp as "just now", not a negative age', () => {
    expect(timeAgo(Date.now() + 5 * 60_000)).toBe('just now');
  });

  it('returns empty string for an invalid date (never "Invalid Date")', () => {
    expect(timeAgo('not a date')).toBe('');
    expect(timeAgo(NaN)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats whole-dollar USD', () => {
    expect(formatCurrency(1_500_000)).toBe('$1,500,000');
    expect(formatCurrency(0)).toBe('$0');
  });

  it('guards non-finite values to "$0", never "$NaN"', () => {
    expect(formatCurrency(NaN)).toBe('$0');
    expect(formatCurrency(Infinity)).toBe('$0');
  });
});

describe('formatCompact', () => {
  it('abbreviates magnitudes', () => {
    expect(formatCompact(1_500_000)).toBe('$1.5M');
    expect(formatCompact(15_000)).toBe('$15K');
    expect(formatCompact(750)).toBe('$750');
  });

  it('handles negatives with a sign', () => {
    expect(formatCompact(-2_000_000)).toBe('-$2.0M');
    expect(formatCompact(-15_000)).toBe('-$15K');
  });

  it('guards non-finite values', () => {
    expect(formatCompact(NaN)).toBe('$0');
  });
});

describe('getInitials', () => {
  it('takes first + last initials, or first two letters', () => {
    expect(getInitials('Jane Doe')).toBe('JD');
    expect(getInitials('Mary Jane Watson')).toBe('MW');
    expect(getInitials('Alice')).toBe('AL');
    expect(getInitials('  ')).toBe('?');
  });

  it('never throws on null/undefined/non-string (nullable names)', () => {
    expect(getInitials(null)).toBe('?');
    expect(getInitials(undefined)).toBe('?');
    // @ts-expect-error — defend against a non-string slipping through at runtime
    expect(getInitials(42)).toBe('?');
  });
});

describe('formatFollowUpDate', () => {
  it('labels relative days and guards invalid input', () => {
    const today = new Date();
    expect(formatFollowUpDate(today)).toBe('Today');
    expect(formatFollowUpDate(new Date(today.getTime() + 86_400_000))).toBe('Tomorrow');
    expect(formatFollowUpDate(null)).toBe('');
    expect(formatFollowUpDate('garbage')).toBe('');
  });
});

describe('toDateInputValue', () => {
  it('formats YYYY-MM-DD and guards invalid input', () => {
    expect(toDateInputValue('2026-03-15T12:00:00Z')).toBe('2026-03-15');
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('nope')).toBe('');
  });
});
