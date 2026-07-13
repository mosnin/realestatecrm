import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Supabase Realtime authentication contract', () => {
  it('uses Clerk native integration instead of the removed JWT template flow', () => {
    const hook = readFileSync('hooks/use-supabase-realtime-auth.ts', 'utf8');

    expect(hook).toContain('const token = await getToken({ skipCache: true });');
    expect(hook).not.toContain("getToken({ template: 'supabase' })");
    expect(hook).not.toContain('project\'s JWT secret');
    expect(hook).toContain('50 * 1000');
    expect(hook).not.toContain('50 * 60 * 1000');
  });
});
