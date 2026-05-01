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
  topStuckDeal: null,
  topOverdueFollowUp: null,
  topNewPerson: null,
  topHotPerson: null,
};

const stuck = (title: string, daysStuck: number, count = 1) => ({
  stuckDealsCount: count,
  topStuckDeal: { id: 'deal_42', title, daysStuck },
});

const overdue = (name: string, daysOverdue: number, count = 1) => ({
  overdueFollowUpsCount: count,
  topOverdueFollowUp: { id: 'contact_7', name, daysOverdue },
});

const newPerson = (name: string, count = 1) => ({
  newPeopleCount: count,
  topNewPerson: { id: 'contact_new', name },
});

const hotPerson = (name: string, count = 1) => ({
  hotPeopleCount: count,
  topHotPerson: { id: 'contact_hot', name },
});

describe('composeMorningStory', () => {
  // ── Names over counts (the depth move) ──────────────────────────────────

  it('names the longest-stuck deal, not just a count', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Chen', 14),
    });
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
    expect(out.doorway).toEqual({ kind: 'deal', id: 'deal_42' });
  });

  it('names the most-overdue follow-up by person', () => {
    const out = composeMorningStory({
      ...empty,
      ...overdue('Sarah', 4),
    });
    expect(out.text).toBe("Sarah's follow-up is 4 days overdue.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_7' });
  });

  it('names the most-recent new arrival', () => {
    const out = composeMorningStory({
      ...empty,
      ...newPerson('David'),
    });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_new' });
  });

  it('names the hottest unworked person without ambiguity', () => {
    const out = composeMorningStory({
      ...empty,
      ...hotPerson('Maya'),
    });
    expect(out.text).toBe("Maya's score is hot. Reach out.");
    expect(out.doorway).toEqual({ kind: 'person', id: 'contact_hot' });
  });

  // ── Singular vs plural day handling ─────────────────────────────────────

  it('handles 1 day vs N days for stuck deals', () => {
    expect(
      composeMorningStory({ ...empty, ...stuck('Lee', 1) }).text,
    ).toBe("The Lee deal hasn't moved in 1 day.");
    expect(
      composeMorningStory({ ...empty, ...stuck('Lee', 0) }).text,
    ).toBe('The Lee deal is stuck.');
  });

  it('handles "due today" / "1 day overdue" / "N days overdue"', () => {
    expect(
      composeMorningStory({ ...empty, ...overdue('Sam', 0) }).text,
    ).toBe("Sam's follow-up is due today.");
    expect(
      composeMorningStory({ ...empty, ...overdue('Sam', 1) }).text,
    ).toBe("Sam's follow-up is 1 day overdue.");
    expect(
      composeMorningStory({ ...empty, ...overdue('Sam', 9) }).text,
    ).toBe("Sam's follow-up is 9 days overdue.");
  });

  // ── Queue tail: the sentence stays clean, no parenthetical ──────────────
  // The realtor sees the rest of the queue on click-through. A trailing
  // "(N more stuck.)" reads like programmer copy, not a thoughtful friend.

  it('does not append a queue-tail parenthetical for stuck deals', () => {
    const out = composeMorningStory({ ...empty, ...stuck('Chen', 14, 3) });
    expect(out.text).toBe("The Chen deal hasn't moved in 14 days.");
    expect(out.text).not.toMatch(/\(/);
    expect(out.text).not.toMatch(/more/);
  });

  it('does not append a queue-tail parenthetical for overdue follow-ups', () => {
    const out = composeMorningStory({ ...empty, ...overdue('Sarah', 4, 5) });
    expect(out.text).toBe("Sarah's follow-up is 4 days overdue.");
    expect(out.text).not.toMatch(/\(/);
  });

  it('does not append a queue-tail parenthetical for new people', () => {
    const out = composeMorningStory({ ...empty, ...newPerson('David', 2) });
    expect(out.text).toBe('David just applied. Welcome them.');
    expect(out.text).not.toMatch(/\(/);
  });

  it('does not append a queue-tail parenthetical for hot people', () => {
    const out = composeMorningStory({ ...empty, ...hotPerson('Maya', 3) });
    expect(out.text).toBe("Maya's score is hot. Reach out.");
    expect(out.text).not.toMatch(/\(/);
  });

  // ── Long / messy deal titles: fall back to a generic subject ────────────
  // Titles like "Smith — buyer, $700k Sunset Strip" wreck the sentence
  // cadence. Drop to "A deal hasn't moved in 14 days." — doorway is intact.

  it('falls back to a generic subject when the title contains an em-dash', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Smith — buyer, $700k Sunset Strip', 14),
    });
    expect(out.text).toBe("A deal hasn't moved in 14 days.");
    expect(out.doorway).toEqual({ kind: 'deal', id: 'deal_42' });
  });

  it('falls back to a generic subject when the title contains a comma', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Park, downtown', 7),
    });
    expect(out.text).toBe("A deal hasn't moved in 7 days.");
  });

  it('falls back to a generic subject when the title contains parentheses', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Nguyen (referral)', 3),
    });
    expect(out.text).toBe("A deal hasn't moved in 3 days.");
  });

  it('falls back to a generic subject when the title is overly long', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('A really very extremely long deal name here', 5),
    });
    expect(out.text).toBe("A deal hasn't moved in 5 days.");
  });

  it('uses the generic subject for a 0-day stuck deal with a messy title', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Smith — buyer, $700k', 0),
    });
    expect(out.text).toBe('A deal is stuck.');
  });

  // ── Priority order ──────────────────────────────────────────────────────

  it('prefers stuck deals over everything else', () => {
    const out = composeMorningStory({
      ...empty,
      ...stuck('Chen', 14),
      ...overdue('Sarah', 4),
      ...newPerson('David'),
      ...hotPerson('Maya'),
      draftsCount: 5,
    });
    expect(out.text).toContain('Chen');
    expect(out.doorway?.kind).toBe('deal');
  });

  it('prefers overdue follow-ups when no deals are stuck', () => {
    const out = composeMorningStory({
      ...empty,
      ...overdue('Sarah', 4),
      ...newPerson('David'),
    });
    expect(out.text).toContain("Sarah's follow-up");
    expect(out.doorway?.kind).toBe('person');
  });

  // ── Drafts/questions/closing/all-clear branches ─────────────────────────

  it('falls through to drafts/questions when no people-side urgencies', () => {
    expect(
      composeMorningStory({ ...empty, draftsCount: 3, questionsCount: 1 }).text,
    ).toBe('3 drafts · 1 question waiting for you.');
  });

  it('shows closing-this-week when nothing else is loud', () => {
    expect(
      composeMorningStory({ ...empty, closingThisWeekCount: 2 }).text,
    ).toBe('2 deals closing this week. Keep them on track.');
  });

  it('lands on "all clear" when nothing is pressing', () => {
    expect(composeMorningStory(empty).text).toBe(
      "All clear. I'll surface anything that needs you.",
    );
  });

  // ── Doorway integrity ───────────────────────────────────────────────────

  it('drafts/closing/all-clear branches never carry a doorway', () => {
    expect(
      composeMorningStory({ ...empty, draftsCount: 3 }).doorway,
    ).toBeNull();
    expect(
      composeMorningStory({ ...empty, closingThisWeekCount: 1 }).doorway,
    ).toBeNull();
    expect(composeMorningStory(empty).doorway).toBeNull();
  });
});
