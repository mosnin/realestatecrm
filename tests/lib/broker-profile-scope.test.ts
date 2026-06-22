import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/profile/route.ts'), 'utf8');

describe('broker profile update scoping', () => {
  it('updates the caller membership by id, brokerage, and resolved user id', () => {
    const updateIndex = route.indexOf(".from('BrokerageMembership')\n    .update(updates)");
    const idScopeIndex = route.indexOf(".eq('id', ctx.membership.id)", updateIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", idScopeIndex);
    const userScopeIndex = route.indexOf(".eq('userId', ctx.dbUserId)", brokerageScopeIndex);
    const selectIndex = route.indexOf(".select('id')", userScopeIndex);
    const conflictIndex = route.indexOf('Profile membership changed. Refresh and try again.', selectIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(updateIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(userScopeIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(selectIndex).toBeGreaterThan(userScopeIndex);
    expect(conflictIndex).toBeGreaterThan(selectIndex);
  });
});
