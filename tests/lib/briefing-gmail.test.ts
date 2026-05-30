/**
 * Tests for the pure helpers inside the gmail signal source. The gather()
 * method itself is integration-shaped (Composio + Supabase); the helpers
 * are what make or break the scoring logic, and they're trivially testable
 * in isolation.
 */

import { describe, expect, it } from 'vitest';
import { __internals, type ThreadView } from '@/lib/briefing/signal-sources/gmail';

const { extractEmail, buildThreadViews, dayWord, scoreThread } = __internals;

const REALTOR = 'agent@example.com';
const HOT_SCORE = 90;
const COLD_SCORE = 20;
const MS = (date: string) => new Date(date).getTime();

describe('gmail — extractEmail', () => {
  it('pulls a bare address through and lowercases it', () => {
    expect(extractEmail('Foo@Example.COM')).toBe('foo@example.com');
  });
  it('extracts an address from "Name <addr@x>" form', () => {
    expect(extractEmail('Sarah Chen <Sarah.Chen@example.com>')).toBe('sarah.chen@example.com');
  });
  it('returns null on empty, null, or non-email input', () => {
    expect(extractEmail(null)).toBeNull();
    expect(extractEmail('')).toBeNull();
    expect(extractEmail('not an email')).toBeNull();
  });
});

describe('gmail — dayWord', () => {
  it('returns a weekday name for a valid ISO', () => {
    // 2026-05-26 is a Tuesday.
    expect(dayWord('2026-05-26T10:00:00Z')).toBe('Tuesday');
  });
  it('falls back to "recently" on a bad date', () => {
    expect(dayWord('not-a-date')).toBe('recently');
  });
});

describe('gmail — buildThreadViews', () => {
  it('collapses messages into a per-thread view with the latest as last', () => {
    const messages = [
      { threadId: 't1', sender: REALTOR, to: 'sarah@example.com', messageText: 'first', messageTimestamp: '2026-05-25T10:00:00Z', labelIds: ['SENT'] },
      { threadId: 't1', sender: 'sarah@example.com', to: REALTOR, messageText: 'reply', messageTimestamp: '2026-05-26T10:00:00Z' },
    ];
    const threads = buildThreadViews(messages, REALTOR);
    expect(threads.size).toBe(1);
    const t = threads.get('t1')!;
    expect(t.lastAt).toBe('2026-05-26T10:00:00.000Z');
    expect(t.lastFromRealtor).toBe(false); // the LATEST was from sarah
    expect(t.otherParties.has('sarah@example.com')).toBe(true);
    expect(t.otherParties.has(REALTOR)).toBe(false);
  });

  it('detects realtor-sent via Gmail SENT label even when "from" is missing', () => {
    const messages = [
      { threadId: 't2', to: 'marco@example.com', messageText: 'hey marco', messageTimestamp: '2026-05-26T10:00:00Z', labelIds: ['SENT', 'INBOX'] },
    ];
    const t = buildThreadViews(messages, null).get('t2')!;
    expect(t.lastFromRealtor).toBe(true);
  });

  it('drops messages without a usable timestamp', () => {
    const messages = [
      { threadId: 't3', sender: 'x@example.com' },
      { threadId: 't3', sender: 'x@example.com', messageTimestamp: '2026-05-26T10:00:00Z' },
    ];
    const t = buildThreadViews(messages, REALTOR).get('t3')!;
    expect(t).toBeDefined();
    expect(t.lastAt).toBe('2026-05-26T10:00:00.000Z');
  });

  it('handles internalDate (epoch-ms string) as well as ISO', () => {
    const epoch = String(Date.parse('2026-05-26T12:00:00Z'));
    const messages = [{ threadId: 't4', sender: 'x@example.com', internalDate: epoch }];
    const t = buildThreadViews(messages, REALTOR).get('t4')!;
    expect(t.lastAt).toBe('2026-05-26T12:00:00.000Z');
  });

  it('excludes the realtor from otherParties via case-insensitive match', () => {
    const messages = [
      { threadId: 't5', sender: 'Sarah@Example.com', to: 'Agent@Example.COM', messageText: 'hi', messageTimestamp: '2026-05-26T10:00:00Z' },
    ];
    const t = buildThreadViews(messages, REALTOR).get('t5')!;
    expect([...t.otherParties]).toEqual(['sarah@example.com']);
  });
});

describe('gmail — scoreThread', () => {
  const now = MS('2026-05-30T10:00:00Z');
  const sarah = { id: 'c1', name: 'Sarah Chen', email: 'sarah@example.com', leadScore: COLD_SCORE };
  const marco = { id: 'c2', name: 'Marco Reyes', email: 'marco@example.com', leadScore: HOT_SCORE };

  function thread(overrides: Partial<ThreadView>): ThreadView {
    return {
      threadId: 't', otherParties: new Set(['sarah@example.com']),
      lastAt: '2026-05-26T10:00:00Z', lastFromRealtor: true, lastBodyLen: 200,
      ...overrides,
    };
  }

  it('signal 1 — realtor sent, no reply 4 days, body > 100 chars → urgency 2, 0.85', () => {
    // 2026-05-26 was Tuesday; the brief is composed on the 30th.
    const t = thread({ lastAt: '2026-05-26T10:00:00Z', lastBodyLen: 200 });
    const s = scoreThread(t, sarah, now, false);
    expect(s).not.toBeNull();
    expect(s!.urgency).toBe(2);
    expect(s!.confidence).toBe(0.85);
    expect(s!.evidence).toBe("Sarah Chen hasn't replied to your Tuesday email.");
  });

  it('signal 1 — does NOT fire when last body was a one-liner (≤100 chars)', () => {
    const t = thread({ lastAt: '2026-05-26T10:00:00Z', lastBodyLen: 40 });
    expect(scoreThread(t, sarah, now, false)).toBeNull();
  });

  it('signal 1 — does NOT fire when only 3 days have passed', () => {
    const t = thread({ lastAt: '2026-05-27T10:00:00Z', lastBodyLen: 200 });
    expect(scoreThread(t, sarah, now, false)).toBeNull();
  });

  it('signal 2 — hot contact, no reply 2 days → urgency 1, 0.9, "Hot tier"', () => {
    // 2026-05-28 was Thursday; brief composed on the 30th = 2 days later.
    const t = thread({ lastAt: '2026-05-28T10:00:00Z', lastBodyLen: 30 });
    const s = scoreThread(t, marco, now, false);
    expect(s).not.toBeNull();
    expect(s!.urgency).toBe(1);
    expect(s!.confidence).toBe(0.9);
    expect(s!.evidence).toBe("Marco Reyes hasn't replied since Thursday. Hot tier.");
  });

  it('signal 2 — hot contact wins even when body length is short (no 100-char gate)', () => {
    const t = thread({ lastAt: '2026-05-28T10:00:00Z', lastBodyLen: 5 });
    const s = scoreThread(t, marco, now, false);
    expect(s).not.toBeNull();
    expect(s!.confidence).toBe(0.9);
  });

  it('signal 2 — does NOT fire for hot at only 1 day cool', () => {
    const t = thread({ lastAt: '2026-05-29T10:00:00Z', lastBodyLen: 200 });
    expect(scoreThread(t, marco, now, false)).toBeNull();
  });

  it('signal 3 — inbound ≤6h ago, no draft → urgency 1, 0.82', () => {
    const t = thread({ lastAt: '2026-05-30T06:00:00Z', lastFromRealtor: false });
    const s = scoreThread(t, sarah, now, /* hasGmailDraft */ false);
    expect(s).not.toBeNull();
    expect(s!.urgency).toBe(1);
    expect(s!.confidence).toBe(0.82);
    expect(s!.evidence).toMatch(/Sarah Chen emailed at \d{2}:\d{2} — Chippi didn't draft\. Worth a look\./);
  });

  it('signal 3 — DOES NOT FIRE when a Gmail-triggered draft exists for the contact', () => {
    const t = thread({ lastAt: '2026-05-30T06:00:00Z', lastFromRealtor: false });
    expect(scoreThread(t, sarah, now, /* hasGmailDraft */ true)).toBeNull();
  });

  it('signal 3 — does not fire for inbound older than 6h', () => {
    const t = thread({ lastAt: '2026-05-30T00:00:00Z', lastFromRealtor: false });
    expect(scoreThread(t, sarah, now, false)).toBeNull();
  });

  it('subject deep-link points at the contact card', () => {
    const t = thread({ lastAt: '2026-05-26T10:00:00Z', lastBodyLen: 200 });
    const s = scoreThread(t, sarah, now, false);
    expect(s!.subject.href).toBe('/contacts/c1');
    expect((s!.draftedAction as { kind: string; href: string }).href).toBe('/contacts/c1');
  });

  it('source/kind are stable for downstream rank/dedup', () => {
    const t = thread({ lastAt: '2026-05-26T10:00:00Z', lastBodyLen: 200 });
    const s = scoreThread(t, sarah, now, false)!;
    expect(s.source).toBe('gmail');
    expect(s.kind).toBe('reply');
  });
});
