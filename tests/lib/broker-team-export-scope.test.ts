import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/export/route.ts'), 'utf8');

describe('broker team export scoping', () => {
  it('scopes contact stats by brokerage and derives deals through scoped contacts', () => {
    const contactIndex = route.indexOf(".from('Contact')");
    const contactScopeIndex = route.indexOf(".eq('brokerageId', brokerage.id)", contactIndex);
    const dealContactIndex = route.indexOf(".from('DealContact')", contactScopeIndex);
    const dealIndex = route.indexOf(".from('Deal')", dealContactIndex);
    const dealIdScopeIndex = route.indexOf(".in('id', scopedDealIds)", dealIndex);
    const dealSpaceScopeIndex = route.indexOf(".in('spaceId', spaceIds)", dealIdScopeIndex);

    expect(contactIndex).toBeGreaterThan(-1);
    expect(contactScopeIndex).toBeGreaterThan(contactIndex);
    expect(dealContactIndex).toBeGreaterThan(contactScopeIndex);
    expect(dealIndex).toBeGreaterThan(dealContactIndex);
    expect(dealIdScopeIndex).toBeGreaterThan(dealIndex);
    expect(dealSpaceScopeIndex).toBeGreaterThan(dealIdScopeIndex);
  });
});
