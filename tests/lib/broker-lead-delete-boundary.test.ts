import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/leads/[id]/route.ts'), 'utf8');

describe('broker lead delete boundary', () => {
  it('refuses to delete assigned leads before destructive cleanup', () => {
    expect(route).toContain("contactTags.includes('assigned')");
    expect(route).toContain('Unassign this lead before deleting it.');
    expect(route).toContain('{ status: 409 }');
    expect(route.indexOf("contactTags.includes('assigned')")).toBeLessThan(route.indexOf(".from('DealContact')"));
    expect(route.indexOf("contactTags.includes('assigned')")).toBeLessThan(route.indexOf(".from('Contact')\n      .delete()"));
  });
});
