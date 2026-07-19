/**
 * Pure-logic tests for `expiryReadout` — the offer-expiry copy/tone shared
 * by the offers board (app/s/[slug]/offers/offers-client.tsx) and the
 * deal-detail Offers section (components/deals/deal-offers.tsx). Both files
 * carry their own copy of this function (lib/offers.ts is server-only and
 * can't be imported into either client component — see each file's header
 * comment), so both copies are tested here to keep them honest and in sync.
 *
 * Behavioral (calls the real exported function), never a source-grep.
 */
import { describe, it, expect } from 'vitest';
import { expiryReadout as boardExpiryReadout } from '@/app/s/[slug]/offers/offers-client';
import { expiryReadout as dealExpiryReadout } from '@/components/deals/deal-offers';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe.each([
  ['offers-client (board)', boardExpiryReadout],
  ['deal-offers (deal detail)', dealExpiryReadout],
])('expiryReadout — %s', (_label, expiryReadout) => {
  it('returns null when there is no expiry date', () => {
    expect(expiryReadout(null, 'submitted')).toBeNull();
  });

  it('returns null for an unparseable expiry string rather than fabricating a date', () => {
    expect(expiryReadout('not-a-date', 'submitted')).toBeNull();
  });

  it('labels a terminal-status offer as simply "Expired <date>", normal tone, even if the date is in the future', () => {
    const future = new Date(Date.now() + 5 * DAY).toISOString();
    const readout = expiryReadout(future, 'accepted');
    expect(readout).not.toBeNull();
    expect(readout!.tone).toBe('normal');
    expect(readout!.text).toMatch(/^Expired /);
  });

  it('flags a past, non-terminal expiry as overdue', () => {
    const past = new Date(Date.now() - HOUR).toISOString();
    const readout = expiryReadout(past, 'submitted');
    expect(readout).not.toBeNull();
    expect(readout!.tone).toBe('overdue');
    expect(readout!.text).toMatch(/^Overdue —/);
  });

  it('flags an expiry within 48h as "soon", counting down in hours', () => {
    const soon = new Date(Date.now() + 5 * HOUR).toISOString();
    const readout = expiryReadout(soon, 'submitted');
    expect(readout).not.toBeNull();
    expect(readout!.tone).toBe('soon');
    expect(readout!.text).toMatch(/^Expires in \d+h$/);
  });

  it('treats an expiry beyond 48h as "normal" tone with a calendar date', () => {
    const later = new Date(Date.now() + 10 * DAY).toISOString();
    const readout = expiryReadout(later, 'submitted');
    expect(readout).not.toBeNull();
    expect(readout!.tone).toBe('normal');
    expect(readout!.text).toMatch(/^Expires /);
  });
});
