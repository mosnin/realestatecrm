/**
 * composeChippiOpener — the contract is the VOICE, so we assert it.
 *
 * Chippi's first words must read like a teammate, not a status feed: first
 * person, naming a real subject when there is one, proof she's already worked
 * ("in your voice"), and never an em dash (the house rule). These are the
 * properties the first-impression audit demanded, pinned so they can't quietly
 * regress into notification-speak.
 */

import { describe, it, expect } from 'vitest';
import { composeChippiOpener } from '@/lib/chippi-opener';
import type { MorningResponse } from '@/app/api/agent/morning/route';

const base: MorningResponse = {
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
  composedSentence: null,
};

/** First person = Chippi talks as herself, to the realtor. */
function isFirstPerson(line: string): boolean {
  return /\b(I|I'm|I've|me|my)\b/.test(line) || /\byou(r)?\b/.test(line);
}

describe('composeChippiOpener — voice', () => {
  it('never uses an em dash (house rule), in any branch', () => {
    const lines = [
      composeChippiOpener({ ...base, draftsCount: 3 }).line,
      composeChippiOpener({ ...base, newPeopleCount: 2 }).line,
      composeChippiOpener(base).line,
      composeChippiOpener(base, { fresh: true }).line,
      composeChippiOpener({
        ...base,
        overdueFollowUpsCount: 1,
        topOverdueFollowUp: { id: 'p1', name: 'Priya Raman', daysOverdue: 3 },
      }).line,
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/[—–]/);
      expect(isFirstPerson(line)).toBe(true);
    }
  });

  it('drafts: speaks as Chippi who already worked, in the realtor voice', () => {
    const out = composeChippiOpener({ ...base, draftsCount: 3 });
    expect(out.line).toContain('I drafted 3 replies in your voice');
    expect(out.line).toContain('Want to look?');
    expect(out.chips[0]).toMatchObject({ label: 'Review 3 drafts' });
  });

  it('names the overdue person and offers to nudge them by first name', () => {
    const out = composeChippiOpener({
      ...base,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p1', name: 'Priya Raman', daysOverdue: 3 },
    });
    expect(out.line).toContain('Priya Raman');
    expect(out.line).toContain('3 days late');
    expect(out.line).toContain('Want me to nudge Priya?');
    expect(out.chips[0].label).toBe('Follow up with Priya');
  });

  it('leads with the loudest signal and folds in a second clause', () => {
    const out = composeChippiOpener({
      ...base,
      draftsCount: 2,
      newPeopleCount: 4,
      topNewPerson: { id: 'n1', name: 'Dana Lee' },
    });
    // Drafts outrank new arrivals, so Chippi opens with the work she did.
    expect(out.line.startsWith('I drafted 2 replies in your voice')).toBe(true);
    expect(out.line).toContain(', and 4 new leads just came in');
    // Up to three offers as tappable chips.
    expect(out.chips.length).toBeGreaterThanOrEqual(2);
    expect(out.chips.length).toBeLessThanOrEqual(3);
  });

  it('singular grammar: one draft, one day', () => {
    expect(composeChippiOpener({ ...base, draftsCount: 1 }).line).toContain(
      'I drafted 1 reply in your voice',
    );
    const overdue = composeChippiOpener({
      ...base,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p1', name: 'Sam', daysOverdue: 1 },
    });
    expect(overdue.line).toContain('1 day late');
  });

  it('follow-up due today reads "due today", not "0 days late"', () => {
    const out = composeChippiOpener({
      ...base,
      overdueFollowUpsCount: 1,
      topOverdueFollowUp: { id: 'p1', name: 'Sam Park', daysOverdue: 0 },
    });
    expect(out.line).toContain('due today');
    expect(out.line).not.toContain('0 days');
  });

  it('cold start (fresh workspace) invites the first lead, in first person', () => {
    const out = composeChippiOpener(base, { fresh: true });
    expect(out.coldStart).toBe(true);
    expect(out.line).toContain("I'm set up and ready");
    expect(out.chips.map((c) => c.label)).toContain('Add a lead');
  });

  it('all-clear (nothing pressing) offers to get ahead, not a dead end', () => {
    const out = composeChippiOpener(base);
    expect(out.coldStart).toBe(false);
    expect(out.line).toContain("You're all caught up");
    expect(isFirstPerson(out.line)).toBe(true);
  });
});
