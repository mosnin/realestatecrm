/**
 * Messaging compliance gate (TCPA) — the highest-exposure control in the
 * product. Statutory damages are $500-$1,500 PER message, so these tests pin
 * the fail-closed contract hard:
 *
 *   - an opted-out consumer is never messaged, in ANY category
 *   - automated marketing requires an express-written-consent record
 *   - transactional messages the consumer requested don't require it
 *   - quiet hours are enforced in local time
 *   - a failed lookup BLOCKS the send (never "allow because we couldn't check")
 *   - the realtor's own notifications are unaffected
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const db = vi.hoisted(() => ({
  suppression: null as Record<string, unknown> | null,
  suppressionError: null as Error | null,
  consent: [] as Record<string, unknown>[],
  consentError: null as Error | null,
  timezone: 'America/New_York' as string | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        if (table === 'MessagingSuppression') {
          const b = {
            eq: () => b,
            maybeSingle: async () => {
              if (db.suppressionError) throw db.suppressionError;
              return { data: db.suppression, error: null };
            },
          };
          return b;
        }
        if (table === 'MessagingConsent') {
          const b = {
            eq: () => b,
            is: () => b,
            limit: async () => {
              if (db.consentError) throw db.consentError;
              return { data: db.consent, error: null };
            },
          };
          return b;
        }
        // SpaceSetting timezone lookup
        const b = {
          eq: () => b,
          maybeSingle: async () => ({ data: { timezone: db.timezone }, error: null }),
        };
        return b;
      },
    }),
  },
}));

import {
  checkSendAllowed,
  isStopKeyword,
  isStartKeyword,
  normalizeAddress,
  withOptOutFooter,
  isWithinQuietHours,
} from '@/lib/messaging/compliance';

/** 2pm New York — comfortably inside quiet hours. */
const MIDDAY = new Date('2026-08-10T18:00:00Z');
/** 3am New York — outside. */
const NIGHT = new Date('2026-08-10T07:00:00Z');

const consumerReq = (over: Record<string, unknown> = {}) => ({
  spaceId: 'sp_1',
  channel: 'sms' as const,
  address: '+15551112222',
  audience: 'consumer' as const,
  category: 'transactional' as const,
  now: MIDDAY,
  ...over,
});

beforeEach(() => {
  db.suppression = null;
  db.suppressionError = null;
  db.consent = [{ id: 'c1' }];
  db.consentError = null;
  db.timezone = 'America/New_York';
});

describe('suppression is absolute', () => {
  it('blocks a transactional message to an opted-out consumer', async () => {
    db.suppression = { id: 'sup_1' };
    const d = await checkSendAllowed(consumerReq());
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('suppressed');
  });

  it('blocks marketing to an opted-out consumer', async () => {
    db.suppression = { id: 'sup_1' };
    const d = await checkSendAllowed(consumerReq({ category: 'marketing' }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('suppressed');
  });

  it('allows when not suppressed', async () => {
    expect((await checkSendAllowed(consumerReq())).allowed).toBe(true);
  });
});

describe('consent', () => {
  it('marketing without an express-written record is blocked', async () => {
    db.consent = [];
    const d = await checkSendAllowed(consumerReq({ category: 'marketing' }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('no_consent');
  });

  it('marketing with consent on record is allowed', async () => {
    db.consent = [{ id: 'consent_1' }];
    expect((await checkSendAllowed(consumerReq({ category: 'marketing' }))).allowed).toBe(true);
  });

  it('transactional does not require written consent (they asked for it)', async () => {
    db.consent = [];
    expect((await checkSendAllowed(consumerReq({ category: 'transactional' }))).allowed).toBe(true);
  });

  it('an unclassified consumer send defaults to the STRICTER marketing rules', async () => {
    db.consent = [];
    const d = await checkSendAllowed(consumerReq({ category: undefined }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('no_consent');
  });
});

describe('quiet hours', () => {
  it('blocks a 3am local send', async () => {
    const d = await checkSendAllowed(consumerReq({ now: NIGHT }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('quiet_hours');
  });

  it('allows midday', async () => {
    expect((await checkSendAllowed(consumerReq({ now: MIDDAY }))).allowed).toBe(true);
  });

  it('respects the space timezone, not the server clock', () => {
    // 18:00Z is 11am in LA (inside) and 3am in Tokyo (outside).
    expect(isWithinQuietHours(MIDDAY, 'America/Los_Angeles')).toBe(true);
    expect(isWithinQuietHours(MIDDAY, 'Asia/Tokyo')).toBe(false);
  });

  it('an unknown timezone fails closed', () => {
    expect(isWithinQuietHours(MIDDAY, 'Not/AZone')).toBe(false);
  });
});

describe('fail-closed on infrastructure failure', () => {
  it('a suppression lookup error BLOCKS the send', async () => {
    db.suppressionError = new Error('db down');
    const d = await checkSendAllowed(consumerReq());
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('lookup_failed');
  });

  it('a consent lookup error BLOCKS the send', async () => {
    db.consentError = new Error('db down');
    const d = await checkSendAllowed(consumerReq({ category: 'marketing' }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('lookup_failed');
  });

  it('an unusable address is blocked', async () => {
    const d = await checkSendAllowed(consumerReq({ address: 'nope' }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('invalid_address');
  });
});

describe('internal audience bypasses the consumer rules', () => {
  it("the realtor's own notification sends even at 3am and while suppressed", async () => {
    db.suppression = { id: 'sup_1' };
    const d = await checkSendAllowed(consumerReq({ audience: 'internal', now: NIGHT }));
    expect(d.allowed).toBe(true);
  });
});

describe('STOP / START keywords', () => {
  it('recognizes the CTIA stop family, case and punctuation insensitive', () => {
    for (const s of ['STOP', 'stop', ' Stop ', 'STOP.', 'unsubscribe', 'CANCEL', 'quit', 'End', 'optout']) {
      expect(isStopKeyword(s), s).toBe(true);
    }
  });

  it('does not treat a sentence merely containing the word as an opt-out', () => {
    expect(isStopKeyword('can you stop by the house at 3?')).toBe(false);
    expect(isStopKeyword('I want to cancel my 2pm tour')).toBe(false);
  });

  it('recognizes opt back in', () => {
    expect(isStartKeyword('START')).toBe(true);
    expect(isStartKeyword('unstop')).toBe(true);
    expect(isStartKeyword('stop')).toBe(false);
  });
});

describe('address normalization + opt-out footer', () => {
  it('normalizes phones to E.164 and emails to lowercase', () => {
    expect(normalizeAddress('sms', '(555) 111-2222')).toBe('+15551112222');
    expect(normalizeAddress('sms', '+15551112222')).toBe('+15551112222');
    expect(normalizeAddress('email', '  Bob@Example.COM ')).toBe('bob@example.com');
    expect(normalizeAddress('sms', '123')).toBeNull();
    expect(normalizeAddress('email', 'notanemail')).toBeNull();
  });

  it('appends the opt-out disclosure once', () => {
    expect(withOptOutFooter('Hello')).toContain('Reply STOP to opt out.');
    const already = 'Hi there. Reply STOP to opt out.';
    expect(withOptOutFooter(already)).toBe(already);
  });
});
