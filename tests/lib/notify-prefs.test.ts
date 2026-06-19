/**
 * Unit tests for the notification preference RESOLUTION rules
 * (lib/notify-prefs). These are the load-bearing semantics of the per-member
 * override feature:
 *
 *   - Effective prefs = member override ?? space default, resolved per field.
 *   - A NULL/omitted override field inherits the space default.
 *   - digestCadence default 'off' → per-event email is never suppressed
 *     (no behavior change for existing users).
 *   - A non-off cadence suppresses the per-event email ONLY for event types the
 *     member still wants.
 *
 * mergePrefs / isEmailDigestSuppressed / normalizeCadence are pure, so these
 * run without a DB.
 */
import { describe, it, expect } from 'vitest';
import {
  mergePrefs,
  isEmailDigestSuppressed,
  normalizeCadence,
  type EffectivePrefs,
} from '@/lib/notify-prefs';

const spaceDefault: EffectivePrefs = {
  channels: { email: true, sms: false, push: true },
  eventTypes: { newLeads: true, tourBookings: true, newDeals: true, followUps: true },
  digestCadence: 'off',
};

describe('normalizeCadence', () => {
  it('passes through the two non-off cadences', () => {
    expect(normalizeCadence('daily')).toBe('daily');
    expect(normalizeCadence('weekly')).toBe('weekly');
  });
  it('coerces anything else to off', () => {
    expect(normalizeCadence('off')).toBe('off');
    expect(normalizeCadence(undefined)).toBe('off');
    expect(normalizeCadence(null)).toBe('off');
    expect(normalizeCadence('garbage')).toBe('off');
    expect(normalizeCadence(5)).toBe('off');
  });
});

describe('mergePrefs — member override beats space default', () => {
  it('returns the space default verbatim when there is no override', () => {
    expect(mergePrefs(spaceDefault, null)).toEqual(spaceDefault);
  });

  it('a present override field wins; an omitted one inherits', () => {
    const merged = mergePrefs(spaceDefault, {
      channels: { sms: true }, // override only sms
      eventTypes: { newDeals: false }, // override only newDeals
      digestCadence: 'daily',
    });
    // Overridden:
    expect(merged.channels.sms).toBe(true);
    expect(merged.eventTypes.newDeals).toBe(false);
    expect(merged.digestCadence).toBe('daily');
    // Inherited from the space default:
    expect(merged.channels.email).toBe(true);
    expect(merged.channels.push).toBe(true);
    expect(merged.eventTypes.newLeads).toBe(true);
    expect(merged.eventTypes.tourBookings).toBe(true);
    expect(merged.eventTypes.followUps).toBe(true);
  });

  it('a NULL cadence on the override inherits the space cadence', () => {
    const base: EffectivePrefs = { ...spaceDefault, digestCadence: 'weekly' };
    const merged = mergePrefs(base, { channels: null, eventTypes: null, digestCadence: null });
    expect(merged.digestCadence).toBe('weekly');
  });

  it('an explicit off cadence on the override mutes a space-on digest', () => {
    const base: EffectivePrefs = { ...spaceDefault, digestCadence: 'daily' };
    const merged = mergePrefs(base, { channels: null, eventTypes: null, digestCadence: 'off' });
    expect(merged.digestCadence).toBe('off');
  });

  it('an explicit false override is honored (not treated as "inherit")', () => {
    const merged = mergePrefs(spaceDefault, {
      channels: { email: false },
      eventTypes: null,
      digestCadence: null,
    });
    expect(merged.channels.email).toBe(false);
  });
});

describe('isEmailDigestSuppressed — default-off changes nothing', () => {
  it('cadence off → never suppresses (per-event email always fires)', () => {
    for (const ev of ['newLeads', 'tourBookings', 'newDeals', 'followUps'] as const) {
      expect(isEmailDigestSuppressed(spaceDefault, ev)).toBe(false);
    }
  });

  it('cadence on → suppresses the per-event email for wanted types', () => {
    const prefs: EffectivePrefs = { ...spaceDefault, digestCadence: 'daily' };
    expect(isEmailDigestSuppressed(prefs, 'newLeads')).toBe(true);
    expect(isEmailDigestSuppressed(prefs, 'newDeals')).toBe(true);
  });

  it('cadence on but event type off → not suppressed (nothing to roll up)', () => {
    const prefs: EffectivePrefs = {
      ...spaceDefault,
      digestCadence: 'weekly',
      eventTypes: { ...spaceDefault.eventTypes, tourBookings: false },
    };
    // tourBookings is off: the per-event path wouldn't send it and the digest
    // won't include it, so suppression is moot → false.
    expect(isEmailDigestSuppressed(prefs, 'tourBookings')).toBe(false);
    // Other types still suppressed.
    expect(isEmailDigestSuppressed(prefs, 'newLeads')).toBe(true);
  });
});
