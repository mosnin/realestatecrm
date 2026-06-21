import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

const brokerCsvExports = [
  'app/api/broker/export/route.ts',
  'app/api/broker/leads/export/route.ts',
  'app/api/broker/commissions/export/route.ts',
];

describe('broker CSV exports are safe for PII downloads', () => {
  it.each(brokerCsvExports)('%s sends private no-store CSV download headers', (file) => {
    const body = source(file);
    expect(body).toContain("'Content-Type': 'text/csv; charset=utf-8'");
    expect(body).toContain("'Cache-Control': 'private, no-store, max-age=0'");
    expect(body).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(body).toContain('Content-Disposition');
  });

  it('hardens commission CSV fields against spreadsheet formula injection', () => {
    const body = source('app/api/broker/commissions/export/route.ts');
    expect(body).toContain('/^[=+\\-@\\t\\r]/.test(str)');
    expect(body).toContain('str = `\\t${str}`');
  });
});
