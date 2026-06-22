import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/templates/[id]/route.ts'), 'utf8');

describe('broker template edit race scoping', () => {
  it('updates templates by id, brokerage, and previously loaded version', () => {
    const updateIndex = route.indexOf(".from('BrokerageTemplate')\n    .update(patch)");
    const idScopeIndex = route.indexOf(".eq('id', templateId)", updateIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", idScopeIndex);
    const versionScopeIndex = route.indexOf(".eq('version', existing.version)", brokerageScopeIndex);
    const conflictIndex = route.indexOf('Template changed. Refresh and try again.', versionScopeIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(updateIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(versionScopeIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(conflictIndex).toBeGreaterThan(versionScopeIndex);
  });
});
