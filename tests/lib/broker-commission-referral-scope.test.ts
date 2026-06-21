import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/commissions/ledger/[id]/route.ts'), 'utf8');

describe('broker commission referral scope', () => {
  it('validates referral users through brokerage membership, not global user lookup', () => {
    const referralBranchIndex = route.indexOf('if (referralUserIdVal !== undefined && referralUserIdVal !== null)');
    const membershipIndex = route.indexOf(".from('BrokerageMembership')", referralBranchIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", membershipIndex);
    const userScopeIndex = route.indexOf(".eq('userId', referralUserIdVal)", brokerageScopeIndex);
    const missingIndex = route.indexOf('Referral user not found in brokerage', userScopeIndex);
    const globalUserLookupIndex = route.indexOf(".from('User')", referralBranchIndex);
    const rateChangedIndex = route.indexOf('const rateChanged', referralBranchIndex);

    expect(referralBranchIndex).toBeGreaterThan(-1);
    expect(membershipIndex).toBeGreaterThan(referralBranchIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(membershipIndex);
    expect(userScopeIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(missingIndex).toBeGreaterThan(userScopeIndex);
    expect(globalUserLookupIndex === -1 || globalUserLookupIndex > rateChangedIndex).toBe(true);
  });
});
