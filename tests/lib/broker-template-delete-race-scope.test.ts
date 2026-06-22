import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/templates/[id]/route.ts'), 'utf8');

describe('broker template delete race scoping', () => {
  it('loads the template version and deletes by id, brokerage, and loaded version', () => {
    const loadIndex = route.indexOf(".from('BrokerageTemplate')\n    .select('id, version')");
    const loadIdScopeIndex = route.indexOf(".eq('id', templateId)", loadIndex);
    const loadBrokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", loadIdScopeIndex);
    const deleteIndex = route.indexOf(".from('BrokerageTemplate')\n    .delete()", loadBrokerageScopeIndex);
    const deleteIdScopeIndex = route.indexOf(".eq('id', templateId)", deleteIndex);
    const deleteBrokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", deleteIdScopeIndex);
    const versionScopeIndex = route.indexOf(".eq('version', existing.version)", deleteBrokerageScopeIndex);
    const conflictIndex = route.indexOf('Template changed. Refresh and try again.', versionScopeIndex);

    expect(loadIndex).toBeGreaterThan(-1);
    expect(loadIdScopeIndex).toBeGreaterThan(loadIndex);
    expect(loadBrokerageScopeIndex).toBeGreaterThan(loadIdScopeIndex);
    expect(deleteIndex).toBeGreaterThan(loadBrokerageScopeIndex);
    expect(deleteIdScopeIndex).toBeGreaterThan(deleteIndex);
    expect(deleteBrokerageScopeIndex).toBeGreaterThan(deleteIdScopeIndex);
    expect(versionScopeIndex).toBeGreaterThan(deleteBrokerageScopeIndex);
    expect(conflictIndex).toBeGreaterThan(versionScopeIndex);
  });
});
