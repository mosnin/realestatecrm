import { describe, it, expect } from 'vitest';
import {
  composeContactsNarration,
  type ContactsNarrationInput,
} from '@/lib/narration/contacts';

// A fixed "now" so overdue math doesn't flap with the wall clock.
const NOW = new Date('2026-05-01T12:00:00Z');

const yesterday = '2026-04-30T09:00:00Z';
const tomorrow  = '2026-05-02T09:00:00Z';

const make = (overrides: Partial<ContactsNarrationInput> = {}): ContactsNarrationInput => ({
  tags: [],
  followUpAt: null,
  leadScore: null,
  ...overrides,
});

describe('composeContactsNarration', () => {
  // ── New-lead branch ─────────────────────────────────────────────────────

  it('names a single new arrival', () => {
    const out = composeContactsNarration([make({ tags: ['new-lead'] })], NOW);
    expect(out.text).toBe('1 new person came in. Welcome them.');
    expect(out.action).toBe('filter-new');
  });

  it('uses plural "people" for multiple new arrivals', () => {
    const out = composeContactsNarration(
      [
        make({ tags: ['new-lead'] }),
        make({ tags: ['new-lead'] }),
        make({ tags: ['new-lead'] }),
      ],
      NOW,
    );
    expect(out.text).toBe('3 new people came in. Welcome them.');
    expect(out.action).toBe('filter-new');
  });

  // ── Overdue branch ──────────────────────────────────────────────────────

  it('names a single overdue follow-up', () => {
    const out = composeContactsNarration(
      [make({ followUpAt: yesterday })],
      NOW,
    );
    expect(out.text).toBe('1 follow-up is overdue. Catch up.');
    expect(out.action).toBe('sort-priority');
  });

  it('pluralises overdue follow-ups', () => {
    const out = composeContactsNarration(
      [
        make({ followUpAt: yesterday }),
        make({ followUpAt: yesterday }),
      ],
      NOW,
    );
    expect(out.text).toBe('2 follow-ups are overdue. Catch up.');
    expect(out.action).toBe('sort-priority');
  });

  // ── Hot-lead branch ─────────────────────────────────────────────────────

  it('names a single hot person', () => {
    const out = composeContactsNarration([make({ leadScore: 85 })], NOW);
    expect(out.text).toBe('1 person is hot. Reach out.');
    expect(out.action).toBe('sort-priority');
  });

  it('uses plural "people" for multiple hot leads', () => {
    const out = composeContactsNarration(
      [make({ leadScore: 90 }), make({ leadScore: 75 })],
      NOW,
    );
    expect(out.text).toBe('2 people are hot. Reach out.');
    expect(out.action).toBe('sort-priority');
  });

  it('treats a score below the hot threshold as not hot', () => {
    // HOT_LEAD_THRESHOLD = 70 — 69 must not light up the hot branch.
    const out = composeContactsNarration([make({ leadScore: 69 })], NOW);
    expect(out.text).toBe('1 person on your roster. Quietly active.');
    expect(out.action).toBeNull();
  });

  // ── Empty + steady-state ────────────────────────────────────────────────

  it('lands on the empty-roster sentence when nothing is there', () => {
    const out = composeContactsNarration([], NOW);
    expect(out.text).toBe('No people yet. Drop your intake link and start collecting.');
    expect(out.action).toBeNull();
  });

  it('names a single roster member quietly', () => {
    const out = composeContactsNarration([make()], NOW);
    expect(out.text).toBe('1 person on your roster. Quietly active.');
    expect(out.action).toBeNull();
  });

  it('uses plural "people" for a steady roster', () => {
    const out = composeContactsNarration(
      [make(), make(), make(), make()],
      NOW,
    );
    expect(out.text).toBe('4 people on your roster. Quietly active.');
    expect(out.action).toBeNull();
  });

  // ── Priority ladder ─────────────────────────────────────────────────────

  it('prefers new arrivals over overdue and hot', () => {
    const out = composeContactsNarration(
      [
        make({ tags: ['new-lead'] }),
        make({ followUpAt: yesterday }),
        make({ leadScore: 95 }),
      ],
      NOW,
    );
    expect(out.text).toBe('1 new person came in. Welcome them.');
    expect(out.action).toBe('filter-new');
  });

  it('prefers overdue over hot when no new arrivals', () => {
    const out = composeContactsNarration(
      [
        make({ followUpAt: yesterday }),
        make({ leadScore: 95 }),
      ],
      NOW,
    );
    expect(out.text).toBe('1 follow-up is overdue. Catch up.');
    expect(out.action).toBe('sort-priority');
  });

  // ── Future follow-ups don't count as overdue ────────────────────────────

  it('does not count tomorrow follow-ups as overdue', () => {
    const out = composeContactsNarration(
      [make({ followUpAt: tomorrow })],
      NOW,
    );
    expect(out.text).toBe('1 person on your roster. Quietly active.');
    expect(out.action).toBeNull();
  });
});
