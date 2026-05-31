import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findSmsConnection, smsConfigured } from '@/lib/sms/connect';

/**
 * Telnyx is workspace-level env config (not per-user OAuth), so the
 * "connection" helpers reduce to env presence + E.164 shape checks.
 * These tests pin that contract — if the env shape changes, the SMS
 * page's not-set-up gate would silently let bad sends through.
 */
describe('findSmsConnection / smsConfigured', () => {
  const originalApiKey = process.env.TELNYX_API_KEY;
  const originalFromNumber = process.env.TELNYX_FROM_NUMBER;

  beforeEach(() => {
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_FROM_NUMBER;
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.TELNYX_API_KEY;
    } else {
      process.env.TELNYX_API_KEY = originalApiKey;
    }
    if (originalFromNumber === undefined) {
      delete process.env.TELNYX_FROM_NUMBER;
    } else {
      process.env.TELNYX_FROM_NUMBER = originalFromNumber;
    }
  });

  it('returns null when both env vars are missing', async () => {
    expect(smsConfigured()).toBe(false);
    expect(await findSmsConnection('space-1')).toBeNull();
  });

  it('returns null when only the API key is set', async () => {
    process.env.TELNYX_API_KEY = 'KEY01234567890';
    expect(smsConfigured()).toBe(false);
    expect(await findSmsConnection('space-1')).toBeNull();
  });

  it('returns null when only the from-number is set', async () => {
    process.env.TELNYX_FROM_NUMBER = '+15555550100';
    expect(smsConfigured()).toBe(false);
    expect(await findSmsConnection('space-1')).toBeNull();
  });

  it('returns null when the from-number is not valid E.164', async () => {
    process.env.TELNYX_API_KEY = 'KEY01234567890';
    process.env.TELNYX_FROM_NUMBER = '5555550100'; // missing leading +
    expect(smsConfigured()).toBe(false);
    expect(await findSmsConnection('space-1')).toBeNull();
  });

  it('returns a connection object when both env vars are valid', async () => {
    process.env.TELNYX_API_KEY = 'KEY01234567890';
    process.env.TELNYX_FROM_NUMBER = '+15555550100';
    expect(smsConfigured()).toBe(true);
    const conn = await findSmsConnection('space-1');
    expect(conn).toEqual({ toolkit: 'telnyx', fromNumber: '+15555550100' });
  });
});
