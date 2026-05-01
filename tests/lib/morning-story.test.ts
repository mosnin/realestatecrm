import { describe, it, expect } from 'vitest';
import { composeMorningStory } from '@/lib/morning-story';
import type { MorningSummary } from '@/app/api/agent/morning/route';

const empty: MorningSummary = {
  newPeopleCount: 0,
  hotPeopleCount: 0,
  overdueFollowUpsCount: 0,
  stuckDealsCount: 0,
  closingThisWeekCount: 0,
  draftsCount: 0,
  questionsCount: 0,
  topPersonName: null,
  topPersonId: null,
};

const withTopPerson = {
  topPersonName: 'David Chen',
  topPersonId: 'contact_123',
};

describe('composeMorningStory', () => {
  // ── Priority order ────────────────────────────────────────────────────────

  it('prefers stuck deals over everything else', () => {
    const out = composeMorningStory({
      ...empty,
      stuckDealsCount: 1,
      overdueFollowUpsCount: 5,
      newPeopleCount: 3,
      hotPeopleCount: 7,
    });
    expect(out.text).toContain('1 deal is stuck');
  });

  it('prefers overdue follow-ups when no deals are stuck', () => {
    const out = composeMorningStory({
      ...empty,
      overdueFollowUpsCount: 2,
      newPeopleCount: 1,
      hotPeopleCount: 4,
    });
    expect(out.text).toContain('2 follow-ups are overdue');
  });

  it('falls through to drafts/questions when there are no people-side urgencies', () => {
    const out = composeMorningStory({
      ...empty,
      draftsCount: 3,
      questionsCount: 1,
    });
    expect(out.text).toBe('3 drafts · 1 question waiting for you.');
  });

  it('lands on "all clear" when nothing is pressing', () => {
    expect(composeMorningStory(empty).text).toBe(
      "All clear. I'll surface anything that needs you.",
    );
  });

  // ── Composition ──────────────────────────────────────────────────────────

  it('composes stuck + overdue + new into one sentence', () => {
    const out = composeMorningStory({
      ...empty,
      stuckDealsCount: 2,
      overdueFollowUpsCount: 1,
      newPeopleCount: 3,
    });
    expect(out.text).toBe('2 deals are stuck, 1 follow-up overdue, 3 new people.');
  });

  it('keeps singular and plural agreement', () => {
    expect(
      composeMorningStory({ ...empty, stuckDealsCount: 1, overdueFollowUpsCount: 1, newPeopleCount: 1 }).text,
    ).toBe('1 deal is stuck, 1 follow-up overdue, 1 new person.');
  });

  // ── Doorway ──────────────────────────────────────────────────────────────

  it('attaches "Start with X" when a top person is provided', () => {
    const out = composeMorningStory({
      ...empty,
      stuckDealsCount: 1,
      ...withTopPerson,
    });
    expect(out.text).toBe('1 deal is stuck. Start with David Chen.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_123' });
  });

  it('omits "Start with X" when only the name is set (no id)', () => {
    const out = composeMorningStory({
      ...empty,
      stuckDealsCount: 1,
      topPersonName: 'David Chen',
      topPersonId: null,
    });
    expect(out.text).toBe('1 deal is stuck.');
    expect(out.doorway).toBeNull();
  });

  it('does not attach a doorway to drafts/questions/closing/all-clear', () => {
    expect(composeMorningStory({ ...empty, draftsCount: 1, ...withTopPerson }).doorway).toBeNull();
    expect(composeMorningStory({ ...empty, closingThisWeekCount: 1, ...withTopPerson }).doorway).toBeNull();
    expect(composeMorningStory({ ...empty, ...withTopPerson }).doorway).toBeNull();
  });

  // ── Hot people fallback action ──────────────────────────────────────────

  it('says "Reach out." when hot people exist and there is no top person', () => {
    expect(composeMorningStory({ ...empty, hotPeopleCount: 3 }).text).toBe(
      '3 people are hot. Reach out.',
    );
  });

  it('says "Start with X" when hot people exist and a top person resolves', () => {
    expect(
      composeMorningStory({ ...empty, hotPeopleCount: 3, ...withTopPerson }).text,
    ).toBe('3 people are hot. Start with David Chen.');
  });

  // ── Brand-voice anchor (snapshot-style) ─────────────────────────────────
  // These are the canonical sentences. If a future contributor changes them,
  // they should be doing it with intent — and updating these expectations.

  it('matches canonical sentences for each priority branch', () => {
    expect(composeMorningStory({ ...empty, stuckDealsCount: 1 }).text).toBe('1 deal is stuck.');
    expect(composeMorningStory({ ...empty, overdueFollowUpsCount: 1 }).text).toBe('1 follow-up is overdue.');
    expect(composeMorningStory({ ...empty, newPeopleCount: 1 }).text).toBe('1 new person came in. Welcome them.');
    expect(composeMorningStory({ ...empty, hotPeopleCount: 1 }).text).toBe('1 person is hot. Reach out.');
    expect(composeMorningStory({ ...empty, closingThisWeekCount: 1 }).text).toBe(
      '1 deal closing this week. Keep it on track.',
    );
  });
});
