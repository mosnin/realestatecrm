import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/settings/route.ts'), 'utf8');

describe('broker settings last assigned user scoping', () => {
  it('proves lastAssignedUserId belongs to the brokerage before resolving user details', () => {
    const cursorIndex = route.indexOf('if (lastAssignedUserId) {');
    const membershipIndex = route.indexOf(".from('BrokerageMembership')", cursorIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', brokerageId)", membershipIndex);
    const userScopeIndex = route.indexOf(".eq('userId', lastAssignedUserId)", brokerageScopeIndex);
    const roleScopeIndex = route.indexOf(".eq('role', 'realtor_member')", userScopeIndex);
    const memberGuardIndex = route.indexOf('if (memberRow) {', roleScopeIndex);
    const userLookupIndex = route.indexOf(".from('User')", memberGuardIndex);

    expect(cursorIndex).toBeGreaterThan(-1);
    expect(membershipIndex).toBeGreaterThan(cursorIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(membershipIndex);
    expect(userScopeIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(roleScopeIndex).toBeGreaterThan(userScopeIndex);
    expect(memberGuardIndex).toBeGreaterThan(roleScopeIndex);
    expect(userLookupIndex).toBeGreaterThan(memberGuardIndex);
  });
});
