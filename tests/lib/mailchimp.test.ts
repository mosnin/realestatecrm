/**
 * Mailchimp helpers — pure-logic unit tests.
 *
 * We pin the two contracts that matter for correctness regardless of the wire:
 *   - subscriberHash normalizes (trim + lowercase) before MD5, because that's
 *     how Mailchimp keys a member; getting this wrong creates duplicates.
 *   - splitName turns our single `name` column into FNAME / LNAME sensibly.
 *
 * upsertMember's input guards are also checked without touching the network.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { subscriberHash, splitName, upsertMember } from '@/lib/mailchimp';

describe('subscriberHash', () => {
  it('is the MD5 of the lowercased, trimmed email (Mailchimp member key)', () => {
    // Known MD5 of "test@example.com".
    expect(subscriberHash('test@example.com')).toBe('55502f40dc8b7c769880b10874abc9d0');
  });

  it('normalizes case and surrounding whitespace to one stable key', () => {
    const canonical = subscriberHash('test@example.com');
    expect(subscriberHash('  Test@Example.COM  ')).toBe(canonical);
  });
});

describe('splitName', () => {
  it('returns empty object for null/blank', () => {
    expect(splitName(null)).toEqual({});
    expect(splitName('   ')).toEqual({});
  });

  it('maps a single token to first name only', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher' });
  });

  it('splits first + rest into first/last', () => {
    expect(splitName('Maya Chen')).toEqual({ firstName: 'Maya', lastName: 'Chen' });
    expect(splitName('Juan de la Cruz')).toEqual({ firstName: 'Juan', lastName: 'de la Cruz' });
  });
});

describe('upsertMember input guards', () => {
  it('rejects an invalid email without hitting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await upsertMember({ email: 'not-an-email', audienceId: 'list_1' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('invalid_email');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects when no audience id is available, without hitting the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await upsertMember({ email: 'dana@example.com' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('no_audience');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
