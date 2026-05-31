/**
 * Mail send validator — unit tests.
 *
 * Composio + Supabase live behind network/auth and aren't worth mocking
 * here. What IS worth locking in: the validator accepts every shape the
 * compose modal could legitimately send and rejects every malformed
 * shape with a copy that's safe to show the realtor.
 */

import { describe, expect, it } from 'vitest';
import { validateSendPayload } from '@/lib/mail/validation';

describe('validateSendPayload', () => {
  const baseOK = {
    to: 'sam@example.com',
    subject: 'Hello',
    body: 'Hi Sam, just checking in.',
  };

  it('accepts a clean minimal payload', () => {
    const res = validateSendPayload(baseOK);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.to).toEqual(['sam@example.com']);
    expect(res.value.cc).toEqual([]);
    expect(res.value.bcc).toEqual([]);
    expect(res.value.subject).toBe('Hello');
    expect(res.value.body).toBe('Hi Sam, just checking in.');
    expect(res.value.inReplyToId).toBeNull();
  });

  it('parses comma-separated To strings into arrays', () => {
    const res = validateSendPayload({
      ...baseOK,
      to: 'sam@example.com, jordan@example.com , alex@example.com',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.to).toEqual([
      'sam@example.com',
      'jordan@example.com',
      'alex@example.com',
    ]);
  });

  it('accepts a To array verbatim', () => {
    const res = validateSendPayload({
      ...baseOK,
      to: ['sam@example.com', 'jordan@example.com'],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.to).toEqual(['sam@example.com', 'jordan@example.com']);
  });

  it('dedupes recipients case-insensitively', () => {
    const res = validateSendPayload({
      ...baseOK,
      to: 'sam@example.com, SAM@example.com, sam@Example.com',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.to).toEqual(['sam@example.com']);
  });

  it('accepts cc and bcc when provided', () => {
    const res = validateSendPayload({
      ...baseOK,
      cc: 'cc1@example.com, cc2@example.com',
      bcc: 'bcc@example.com',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.cc).toEqual(['cc1@example.com', 'cc2@example.com']);
    expect(res.value.bcc).toEqual(['bcc@example.com']);
  });

  it('treats empty cc / bcc strings as empty arrays', () => {
    const res = validateSendPayload({ ...baseOK, cc: '', bcc: '' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.cc).toEqual([]);
    expect(res.value.bcc).toEqual([]);
  });

  it('rejects empty To', () => {
    const res = validateSendPayload({ ...baseOK, to: '' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/recipient/i);
  });

  it('rejects malformed email', () => {
    const res = validateSendPayload({ ...baseOK, to: 'not-an-email' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/invalid email/i);
  });

  it('rejects malformed cc', () => {
    const res = validateSendPayload({ ...baseOK, cc: 'bad-cc' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/invalid cc/i);
  });

  it('rejects missing subject', () => {
    const res = validateSendPayload({ ...baseOK, subject: '   ' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/subject/i);
  });

  it('rejects empty body', () => {
    const res = validateSendPayload({ ...baseOK, body: '   \n  ' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/body/i);
  });

  it('rejects subject over 250 chars', () => {
    const res = validateSendPayload({
      ...baseOK,
      subject: 'x'.repeat(251),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/too long/i);
  });

  it('rejects body over 50k chars', () => {
    const res = validateSendPayload({
      ...baseOK,
      body: 'x'.repeat(50_001),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/too long/i);
  });

  it('rejects > 50 total recipients', () => {
    const many = Array.from({ length: 51 }, (_, i) => `r${i}@example.com`);
    const res = validateSendPayload({ ...baseOK, to: many });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/too many/i);
  });

  it('passes through inReplyToId when present', () => {
    const res = validateSendPayload({
      ...baseOK,
      inReplyToId: 'msg_abc123',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.inReplyToId).toBe('msg_abc123');
  });

  it('preserves intentional leading/trailing whitespace in body', () => {
    const res = validateSendPayload({
      ...baseOK,
      body: '\n\nHi there.\n\n— Pat\n',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.body).toBe('\n\nHi there.\n\n— Pat\n');
  });
});
