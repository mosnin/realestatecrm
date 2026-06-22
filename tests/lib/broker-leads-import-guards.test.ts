import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/leads/import/route.ts'), 'utf8');

describe('broker leads import commercial-readiness guards', () => {
  it('caps multipart uploads before parsing form data', () => {
    expect(route).toContain('MAX_MULTIPART_SIZE');
    expect(route.indexOf("req.headers.get('content-length')")).toBeGreaterThan(-1);
    expect(route.indexOf('declaredLength > MAX_MULTIPART_SIZE')).toBeGreaterThan(-1);
    expect(route.indexOf('declaredLength > MAX_MULTIPART_SIZE')).toBeLessThan(route.indexOf('await req.formData()'));
  });

  it('rejects oversized and non-CSV files server-side', () => {
    expect(route).toContain('file.size > MAX_FILE_SIZE');
    expect(route).toContain('{ status: 413 }');
    expect(route).toContain("fileName.endsWith('.csv')");
    expect(route).toContain('CSV_MIME_TYPES.has(fileType)');
    expect(route).toContain('Only CSV files are supported.');
  });

  it('bounds imported CSV field lengths before insert', () => {
    expect(route).toContain('IMPORT_FIELD_LIMITS');
    expect(route).toContain('fieldLengths.find');
    expect(route).toContain('exceeds ${IMPORT_FIELD_LIMITS[field]} characters');
    expect(route.indexOf('fieldLengths.find')).toBeLessThan(route.indexOf('contactsToInsert.push'));
  });
});
