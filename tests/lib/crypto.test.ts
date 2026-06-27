/**
 * lib/crypto is encrypt-at-rest for OAuth tokens (AES-256-GCM). Security-
 * critical, so pin the contract: round-trip fidelity, a fresh random IV per
 * call (same plaintext -> different ciphertext), GCM integrity (tampering
 * throws), fail-closed key derivation (never key off the empty string), and
 * the soft-migration passthrough that tolerates legacy plaintext but only
 * there.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt, decryptOrPassthrough } from '@/lib/crypto';

const ORIG_ENC = process.env.ENCRYPTION_KEY;
const ORIG_CLERK = process.env.CLERK_SECRET_KEY;

beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-do-not-ship';
});
afterAll(() => {
  if (ORIG_ENC === undefined) delete process.env.ENCRYPTION_KEY;
  else process.env.ENCRYPTION_KEY = ORIG_ENC;
  if (ORIG_CLERK === undefined) delete process.env.CLERK_SECRET_KEY;
  else process.env.CLERK_SECRET_KEY = ORIG_CLERK;
});

describe('encrypt / decrypt round-trip', () => {
  it('recovers the original plaintext, including unicode and empty', () => {
    for (const s of ['hello', '', 'token_abc123', 'café ☕ 你好', 'a'.repeat(2000)]) {
      expect(decrypt(encrypt(s))).toBe(s);
    }
  });

  it('emits hex and uses a fresh IV each call (same input -> different cipher)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).toMatch(/^[0-9a-f]+$/);
    expect(a).not.toBe(b); // random IV
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });
});

describe('GCM integrity', () => {
  it('throws when the ciphertext is tampered', () => {
    const enc = encrypt('sensitive');
    // Flip the final hex nibble — keeps it valid hex + same length, breaks the tag.
    const last = enc.slice(-1);
    const flipped = enc.slice(0, -1) + (last === '0' ? '1' : '0');
    expect(() => decrypt(flipped)).toThrow();
  });
});

describe('key derivation fails closed', () => {
  it('refuses to encrypt when no key env var is set (never keys off "")', () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.CLERK_SECRET_KEY;
    try {
      expect(() => encrypt('x')).toThrow(/ENCRYPTION_KEY/);
    } finally {
      process.env.ENCRYPTION_KEY = 'unit-test-encryption-key-do-not-ship';
    }
  });
});

describe('decryptOrPassthrough (soft migration)', () => {
  it('decrypts real ciphertext', () => {
    expect(decryptOrPassthrough(encrypt('legacy-then-encrypted'))).toBe('legacy-then-encrypted');
  });

  it('returns legacy plaintext unchanged instead of throwing', () => {
    expect(decryptOrPassthrough('plain-legacy-token')).toBe('plain-legacy-token');
    expect(decryptOrPassthrough('not hex at all !!')).toBe('not hex at all !!');
  });
});
