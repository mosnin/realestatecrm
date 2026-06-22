import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/properties/route.ts'), 'utf8');

describe('broker property member-space scoping', () => {
  it('loads assignable member spaces from brokerage memberships instead of trusting Space.brokerageId', () => {
    const helperIndex = route.indexOf('async function loadMemberSpaces');
    const membershipIndex = route.indexOf(".from('BrokerageMembership')", helperIndex);
    const membershipScopeIndex = route.indexOf(".eq('brokerageId', brokerageId)", membershipIndex);
    const spaceIndex = route.indexOf(".from('Space')", membershipScopeIndex);
    const ownerScopeIndex = route.indexOf(".in('ownerId', allowedOwnerIds)", spaceIndex);

    expect(helperIndex).toBeGreaterThan(-1);
    expect(membershipIndex).toBeGreaterThan(helperIndex);
    expect(membershipScopeIndex).toBeGreaterThan(membershipIndex);
    expect(spaceIndex).toBeGreaterThan(membershipScopeIndex);
    expect(ownerScopeIndex).toBeGreaterThan(spaceIndex);
    expect(route).not.toContain('brokerageId.eq.${brokerageId}');
  });
});
