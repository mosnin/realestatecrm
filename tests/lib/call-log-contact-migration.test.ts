import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260713180000_call_log_contact_fk.sql'),
  'utf8',
);

describe('call log contact migration', () => {
  it('adds the relationship required by the call-history embed', () => {
    expect(migration).toContain('CONSTRAINT "CallLog_contactId_fkey"');
    expect(migration).toContain('FOREIGN KEY ("contactId")');
    expect(migration).toContain('REFERENCES "Contact"("id") ON DELETE SET NULL');
  });

  it('is safe after an out-of-band production repair', () => {
    expect(migration).toContain("NOT EXISTS (");
    expect(migration).toContain("conname = 'CallLog_contactId_fkey'");
  });
});
