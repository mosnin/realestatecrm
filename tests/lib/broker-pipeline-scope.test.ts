import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('app/broker/pipeline/page.tsx', 'utf8');

describe('broker pipeline brokerage scope', () => {
  it('includes workspaces owned by every brokerage role', () => {
    expect(pageSource).toContain('const members = allMembers;');
    expect(pageSource).not.toContain("allMembers.filter((m) => m.role === 'realtor_member')");
  });

  it('retains the legacy owner-space fallback used by deals and forecast', () => {
    expect(pageSource).toContain('if (memberSpaceIds.length === 0)');
    expect(pageSource).toContain(".eq('ownerId', brokerage.ownerId)");
    expect(pageSource).toContain(
      'const spaceIds = [...new Set([...memberSpaceIds, ...ownerSpaceIds])];',
    );
  });
});
