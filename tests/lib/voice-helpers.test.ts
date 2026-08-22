/**
 * voice pure helpers. toE164 normalizes a number before it's dialed, so it
 * must reject anything that isn't a plausible E.164 number (too short/long,
 * empty) and not mangle an already-valid one. The client_state base64 helpers
 * carry call context across Telnyx webhooks and must round-trip and decode
 * defensively (bad input -> {}, never throw).
 */

import { describe, it, expect } from 'vitest';
import { toE164, encodeClientState, decodeClientState } from '@/lib/voice';

describe('toE164', () => {
  it('normalizes a formatted US number to +1E.164', () => {
    expect(toE164('(415) 555-0123')).toBe('+14155550123');
    expect(toE164('415-555-0123')).toBe('+14155550123');
    expect(toE164('4155550123')).toBe('+14155550123');
  });

  it('passes an already +-prefixed number through when well-formed', () => {
    expect(toE164('+14155550123')).toBe('+14155550123');
    expect(toE164('+442071234567')).toBe('+442071234567');
    expect(toE164('14155550123')).toBe('+14155550123');
  });

  it('returns null for empty / too short / too long input', () => {
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164('12345')).toBeNull(); // < 10 digits
    expect(toE164('+1234567890123456')).toBeNull(); // > 15 digits
  });
});

describe('client_state round-trip', () => {
  it('encodes and decodes back to the same object', () => {
    const state = { bridgeTo: '+14155550123', spaceId: 's1', contactId: 'c1' };
    expect(decodeClientState(encodeClientState(state))).toEqual(state);
  });

  it('decodes empty / missing input to {}', () => {
    expect(decodeClientState(null)).toEqual({});
    expect(decodeClientState(undefined)).toEqual({});
    expect(decodeClientState('')).toEqual({});
  });

  it('decodes garbage to {} instead of throwing', () => {
    expect(decodeClientState('not-valid-base64-json!!!')).toEqual({});
    expect(decodeClientState(Buffer.from('not json', 'utf8').toString('base64'))).toEqual({});
  });
});
