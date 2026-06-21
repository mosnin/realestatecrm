import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/properties/[id]/assign/route.ts'), 'utf8');

describe('broker property assignment scoping', () => {
  it('reads properties by both id and brokerage id before assignment', () => {
    const readIndex = route.indexOf(".from('Property')");
    const idScopeIndex = route.indexOf(".eq('id', id)", readIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", readIndex);
    const maybeSingleIndex = route.indexOf('.maybeSingle()', readIndex);

    expect(readIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(readIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(brokerageScopeIndex).toBeLessThan(maybeSingleIndex);
  });

  it('updates properties by both id and brokerage id', () => {
    const updateIndex = route.indexOf(".update({ assignedSpaceId: target");
    const idScopeIndex = route.indexOf(".eq('id', id)", updateIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", updateIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(updateIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(brokerageScopeIndex).toBeLessThan(route.indexOf('.select()', updateIndex));
  });

  it('validates assigned target spaces through brokerage membership', () => {
    expect(route).toContain(".from('BrokerageMembership')");
    expect(route).toContain(`.eq('brokerageId', ctx.brokerage.id)
        .eq('userId', s.ownerId)`);
    expect(route).toContain('let inBrokerage = s.ownerId === ctx.brokerage.ownerId');
    expect(route).not.toContain('s.brokerageId === ctx.brokerage.id || s.ownerId === ctx.brokerage.ownerId');
  });
});
