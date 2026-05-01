import { describe, it, expect } from 'vitest';
import { composeFollowUpsNarration } from '@/lib/narration/follow-ups';

describe('composeFollowUpsNarration', () => {
  // ── Overdue branch ──────────────────────────────────────────────────────

  it('names a single overdue with the "start there" nudge', () => {
    const out = composeFollowUpsNarration({ overdue: 1, today: 0, upcoming: 0 });
    expect(out.text).toBe('1 follow-up slipped past its date. Start there.');
    expect(out.targetTab).toBe('overdue');
  });

  it('points at "the oldest" when overdue is plural', () => {
    const out = composeFollowUpsNarration({ overdue: 4, today: 0, upcoming: 0 });
    expect(out.text).toBe('4 follow-ups slipped past. Start with the oldest.');
    expect(out.targetTab).toBe('overdue');
  });

  // ── Today branch ────────────────────────────────────────────────────────

  it('names a single follow-up due today', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 1, upcoming: 0 });
    expect(out.text).toBe('1 follow-up due today.');
    expect(out.targetTab).toBe('today');
  });

  it('pluralises today', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 5, upcoming: 0 });
    expect(out.text).toBe('5 follow-ups due today.');
    expect(out.targetTab).toBe('today');
  });

  // ── Upcoming branch ─────────────────────────────────────────────────────

  it('names a single upcoming follow-up with the quiet aside', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 0, upcoming: 1 });
    expect(out.text).toBe('1 follow-up coming up. Quiet otherwise.');
    expect(out.targetTab).toBe('upcoming');
  });

  it('pluralises upcoming', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 0, upcoming: 3 });
    expect(out.text).toBe('3 follow-ups coming up. Quiet otherwise.');
    expect(out.targetTab).toBe('upcoming');
  });

  // ── Defensive empty fallback ────────────────────────────────────────────

  it('falls back to a count line when every bucket is empty', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 0, upcoming: 0 }, 0);
    expect(out.text).toBe('0 on your list.');
    expect(out.targetTab).toBeNull();
  });

  it('uses an explicit total when provided', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 0, upcoming: 0 }, 7);
    expect(out.text).toBe('7 on your list.');
    expect(out.targetTab).toBeNull();
  });

  // ── Priority ladder ─────────────────────────────────────────────────────

  it('prefers overdue over today and upcoming', () => {
    const out = composeFollowUpsNarration({ overdue: 2, today: 5, upcoming: 9 });
    expect(out.text).toBe('2 follow-ups slipped past. Start with the oldest.');
    expect(out.targetTab).toBe('overdue');
  });

  it('prefers today over upcoming when no overdue', () => {
    const out = composeFollowUpsNarration({ overdue: 0, today: 3, upcoming: 12 });
    expect(out.text).toBe('3 follow-ups due today.');
    expect(out.targetTab).toBe('today');
  });
});
