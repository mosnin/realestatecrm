import { describe, it, expect } from 'vitest';
import {
  publicApplicationSchema,
  normalizePhone,
  applicationFingerprintKey,
  buildApplicationData,
} from '@/lib/public-application';

const validMinimal = {
  slug: 'test-space',
  legalName: 'Jane Doe',
  phone: '555-123-4567',
};

describe('publicApplicationSchema', () => {
  it('accepts minimal valid input (slug + legalName + phone)', () => {
    const result = publicApplicationSchema.safeParse(validMinimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.legalName).toBe('Jane Doe');
      expect(result.data.phone).toBe('555-123-4567');
      expect(result.data.slug).toBe('test-space');
    }
  });

  it('rejects missing legalName', () => {
    const result = publicApplicationSchema.safeParse({ slug: 'test-space', phone: '555-123-4567' });
    expect(result.success).toBe(false);
  });

  it('rejects missing phone', () => {
    const result = publicApplicationSchema.safeParse({ slug: 'test-space', legalName: 'Jane Doe' });
    expect(result.success).toBe(false);
  });

  it('rejects slug shorter than 3 characters after normalization', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, slug: 'ab' });
    expect(result.success).toBe(false);
  });

  it('normalizes slug to lowercase and strips invalid chars', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, slug: 'My Space!!' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe('myspace');
    }
  });

  it('accepts valid email', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, email: 'jane@example.com' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('jane@example.com');
    }
  });

  it('rejects invalid email', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('transforms empty email to undefined', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, email: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBeUndefined();
    }
  });

  it('parses numeric string fields to numbers', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, monthlyRent: '2500' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.monthlyRent).toBe(2500);
    }
  });

  it('transforms boolean string fields', () => {
    const result = publicApplicationSchema.safeParse({ ...validMinimal, latePayments: 'true', smoking: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latePayments).toBe(true);
      expect(result.data.smoking).toBe(false);
    }
  });
});

describe('normalizePhone', () => {
  it('strips non-digit characters', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
  });

  it('returns digits unchanged', () => {
    expect(normalizePhone('5551234567')).toBe('5551234567');
  });
});

describe('applicationFingerprintKey', () => {
  it('produces consistent key from same inputs', () => {
    const input = { slug: 'test', legalName: 'Jane Doe', phone: '555-1234', email: 'Jane@Example.com' };
    const key1 = applicationFingerprintKey(input);
    const key2 = applicationFingerprintKey(input);
    expect(key1).toBe(key2);
  });

  it('normalizes name to lowercase and phone to digits', () => {
    const key = applicationFingerprintKey({ slug: 'test', legalName: ' Jane DOE ', phone: '(555) 1234', email: null });
    expect(key).toBe('test:jane doe:5551234:');
  });
});

describe('buildApplicationData', () => {
  it('includes submittedAt timestamp', () => {
    const parsed = publicApplicationSchema.parse(validMinimal);
    const data = buildApplicationData(parsed);
    expect(data.submittedAt).toBeDefined();
    expect(typeof data.submittedAt).toBe('string');
  });

  it('passes through all provided fields', () => {
    const input = { ...validMinimal, propertyAddress: '123 Main St', monthlyRent: '3000' };
    const parsed = publicApplicationSchema.parse(input);
    const data = buildApplicationData(parsed);
    expect(data.propertyAddress).toBe('123 Main St');
    expect(data.monthlyRent).toBe(3000);
    expect(data.legalName).toBe('Jane Doe');
  });
});
