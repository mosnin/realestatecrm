/**
 * Input validators for the client-portal auth routes (login / register / verify).
 * They are the first gate on untrusted request bodies: normalizeEmail canonicalizes
 * + format-checks an email, validPassword enforces the 8-200 length policy, and
 * validCode pins the 6-digit verification code shape. Pin the accept/reject sets
 * — a loose validator here widens the auth attack surface.
 */

import { describe, it, expect } from 'vitest';
import { normalizeEmail, validPassword, validCode } from '@/app/api/clients/auth/_shared';

describe('normalizeEmail', () => {
  it('trims + lowercases a valid email', () => {
    expect(normalizeEmail('  John.Doe@Example.COM ')).toBe('john.doe@example.com');
  });

  it('rejects non-strings, empties, over-long, and malformed', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(123)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull(); // no TLD
    expect(normalizeEmail(`${'a'.repeat(250)}@b.com`)).toBeNull(); // > 254
  });
});

describe('validPassword', () => {
  it('accepts 8-200 char strings and rejects everything else', () => {
    expect(validPassword('a'.repeat(8))).toBe(true);
    expect(validPassword('a'.repeat(200))).toBe(true);
    expect(validPassword('short')).toBe(false); // < 8
    expect(validPassword('a'.repeat(201))).toBe(false); // > 200
    expect(validPassword(12345678)).toBe(false); // non-string
    expect(validPassword(null)).toBe(false);
  });
});

describe('validCode', () => {
  it('accepts exactly 6 digits (trimmed) and rejects anything else', () => {
    expect(validCode('123456')).toBe(true);
    expect(validCode('  654321 ')).toBe(true); // trimmed
    expect(validCode('12345')).toBe(false); // 5 digits
    expect(validCode('1234567')).toBe(false); // 7 digits
    expect(validCode('12a456')).toBe(false); // non-digit
    expect(validCode(123456)).toBe(false); // non-string
  });
});
