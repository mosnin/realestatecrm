/**
 * verifyTelnyxSignature guards an inbound webhook, so its routing is security-
 * relevant: no public key -> 'unconfigured' (caller decides), missing
 * signature/timestamp headers -> 'invalid' WITHOUT even calling the verifier
 * (can't be bypassed), a verifier throw -> 'invalid' (fail closed), and a
 * clean verify -> 'ok'. Mock the Telnyx SDK so we drive each branch.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock('telnyx/webhooks', () => ({
  TelnyxWebhook: class {
    constructor(_key: string) {}
    verify = verify;
  },
}));

import { verifyTelnyxSignature } from '@/lib/telnyx-webhook';

const ORIG_KEY = process.env.TELNYX_PUBLIC_KEY;

const signedHeaders = () =>
  new Headers({
    'telnyx-signature-ed25519': 'sig',
    'telnyx-timestamp': '1700000000',
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.TELNYX_PUBLIC_KEY = 'test-public-key';
});
afterAll(() => {
  if (ORIG_KEY === undefined) delete process.env.TELNYX_PUBLIC_KEY;
  else process.env.TELNYX_PUBLIC_KEY = ORIG_KEY;
});

describe('verifyTelnyxSignature', () => {
  it('returns "unconfigured" when no public key is set', async () => {
    delete process.env.TELNYX_PUBLIC_KEY;
    expect(await verifyTelnyxSignature('{}', signedHeaders())).toBe('unconfigured');
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns "invalid" without calling the verifier when headers are missing', async () => {
    expect(await verifyTelnyxSignature('{}', new Headers())).toBe('invalid');
    expect(await verifyTelnyxSignature('{}', new Headers({ 'telnyx-timestamp': '1' }))).toBe('invalid');
    expect(verify).not.toHaveBeenCalled();
  });

  it('returns "ok" when the SDK verifies the raw body', async () => {
    verify.mockResolvedValueOnce(undefined);
    expect(await verifyTelnyxSignature('{"a":1}', signedHeaders())).toBe('ok');
    expect(verify).toHaveBeenCalledWith('{"a":1}', {
      'telnyx-signature-ed25519': 'sig',
      'telnyx-timestamp': '1700000000',
    });
  });

  it('fails closed to "invalid" when the SDK throws (bad sig / replay)', async () => {
    verify.mockRejectedValueOnce(new Error('bad signature'));
    expect(await verifyTelnyxSignature('{}', signedHeaders())).toBe('invalid');
  });
});
