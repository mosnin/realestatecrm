import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/routing-rules/[id]/route.ts'), 'utf8');

describe('broker routing rule race scoping', () => {
  it('updates routing rules by id, brokerage, and previously loaded updatedAt', () => {
    const updateIndex = route.indexOf(".from('DealRoutingRule')\n    .update(patch)");
    const idScopeIndex = route.indexOf(".eq('id', ruleId)", updateIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", idScopeIndex);
    const updatedAtScopeIndex = route.indexOf(".eq('updatedAt', existing.updatedAt)", brokerageScopeIndex);
    const conflictIndex = route.indexOf('Rule changed. Refresh and try again.', updatedAtScopeIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(updateIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(updatedAtScopeIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(conflictIndex).toBeGreaterThan(updatedAtScopeIndex);
  });

  it('loads the routing rule updatedAt and deletes by id, brokerage, and loaded updatedAt', () => {
    const loadIndex = route.indexOf(`.from('DealRoutingRule')\n    .select('id, updatedAt')`);
    const loadIdScopeIndex = route.indexOf(".eq('id', ruleId)", loadIndex);
    const loadBrokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", loadIdScopeIndex);
    const deleteIndex = route.indexOf(`.from('DealRoutingRule')\n    .delete()`, loadBrokerageScopeIndex);
    const deleteIdScopeIndex = route.indexOf(".eq('id', ruleId)", deleteIndex);
    const deleteBrokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", deleteIdScopeIndex);
    const updatedAtScopeIndex = route.indexOf(".eq('updatedAt', existing.updatedAt)", deleteBrokerageScopeIndex);
    const conflictIndex = route.indexOf('Rule changed. Refresh and try again.', updatedAtScopeIndex);

    expect(loadIndex).toBeGreaterThan(-1);
    expect(loadIdScopeIndex).toBeGreaterThan(loadIndex);
    expect(loadBrokerageScopeIndex).toBeGreaterThan(loadIdScopeIndex);
    expect(deleteIndex).toBeGreaterThan(loadBrokerageScopeIndex);
    expect(deleteIdScopeIndex).toBeGreaterThan(deleteIndex);
    expect(deleteBrokerageScopeIndex).toBeGreaterThan(deleteIdScopeIndex);
    expect(updatedAtScopeIndex).toBeGreaterThan(deleteBrokerageScopeIndex);
    expect(conflictIndex).toBeGreaterThan(updatedAtScopeIndex);
  });
});
