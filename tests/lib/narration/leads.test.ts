import { describe, it, expect } from 'vitest';
import { composeLeadsNarration } from '@/lib/narration/leads';

describe('composeLeadsNarration', () => {
  // ── Unread arrivals branch ──────────────────────────────────────────────

  it('names a single new application', () => {
    const text = composeLeadsNarration({ unreadCount: 1, hotCount: 0, totalCount: 1 });
    expect(text).toBe('1 new application since you last looked. Open it.');
  });

  it('pluralises new applications and the closing verb', () => {
    const text = composeLeadsNarration({ unreadCount: 4, hotCount: 0, totalCount: 4 });
    expect(text).toBe('4 new applications since you last looked. Open them.');
  });

  // ── Hot branch ──────────────────────────────────────────────────────────

  it('names a single hot application', () => {
    const text = composeLeadsNarration({ unreadCount: 0, hotCount: 1, totalCount: 5 });
    expect(text).toBe('1 hot application waiting. Reach out.');
  });

  it('pluralises hot applications', () => {
    const text = composeLeadsNarration({ unreadCount: 0, hotCount: 3, totalCount: 12 });
    expect(text).toBe('3 hot applications waiting. Reach out.');
  });

  // ── Caught-up branch ────────────────────────────────────────────────────

  it('names a single quiet application', () => {
    const text = composeLeadsNarration({ unreadCount: 0, hotCount: 0, totalCount: 1 });
    expect(text).toBe('Caught up. 1 application on the list.');
  });

  it('pluralises the quiet roster', () => {
    const text = composeLeadsNarration({ unreadCount: 0, hotCount: 0, totalCount: 8 });
    expect(text).toBe('Caught up. 8 applications on the list.');
  });

  // ── Empty workspace ─────────────────────────────────────────────────────

  it('lands on the empty-intake sentence when nothing has come in', () => {
    const text = composeLeadsNarration({ unreadCount: 0, hotCount: 0, totalCount: 0 });
    expect(text).toBe('No applications yet. Drop your intake link and start collecting.');
  });

  // ── Priority ladder ─────────────────────────────────────────────────────

  it('prefers unread arrivals over hot and total', () => {
    const text = composeLeadsNarration({ unreadCount: 2, hotCount: 5, totalCount: 20 });
    expect(text).toBe('2 new applications since you last looked. Open them.');
  });

  it('prefers hot over caught-up when no unread', () => {
    const text = composeLeadsNarration({ unreadCount: 0, hotCount: 1, totalCount: 20 });
    expect(text).toBe('1 hot application waiting. Reach out.');
  });
});
