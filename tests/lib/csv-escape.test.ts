/**
 * CSV cell escaping — security-critical (exported contact/lead fields are
 * attacker-controlled, so a value like "=cmd|..." must never become a live
 * spreadsheet formula). Pins formula-injection neutralization + RFC-4180 quoting.
 */

import { describe, it, expect } from 'vitest';
import { escapeCsvCell } from '@/lib/csv';

describe('escapeCsvCell — formula injection', () => {
  it('neutralizes cells starting with a formula trigger', () => {
    expect(escapeCsvCell('=1+1')).toBe(`"'=1+1"`);
    expect(escapeCsvCell('+1')).toBe(`"'+1"`);
    expect(escapeCsvCell('-1')).toBe(`"'-1"`);
    expect(escapeCsvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
    expect(escapeCsvCell('\tcmd')).toBe(`"'\tcmd"`);
  });

  it('neutralizes a real injection payload (single quotes pass through; only " is doubled)', () => {
    expect(escapeCsvCell('=cmd|\' /C calc\'!A0')).toBe(`"'=cmd|' /C calc'!A0"`);
    // A payload that embeds a double-quote gets it doubled per RFC 4180.
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
  });

  it('does not flag values that merely contain a formula char later', () => {
    expect(escapeCsvCell('a=b')).toBe('a=b');
    expect(escapeCsvCell('3 - 1')).toBe('3 - 1');
  });
});

describe('escapeCsvCell — RFC 4180 quoting', () => {
  it('quotes commas, newlines, and quotes; doubles embedded quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('leaves a plain value untouched', () => {
    expect(escapeCsvCell('Jane Doe')).toBe('Jane Doe');
  });

  it('renders null / undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('coerces non-strings', () => {
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(true)).toBe('true');
  });
});
