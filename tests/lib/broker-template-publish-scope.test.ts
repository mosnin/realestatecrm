import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/templates/[id]/publish/route.ts'), 'utf8');

describe('broker template publish write scoping', () => {
  it('updates agent MessageTemplate copies by id and target space id', () => {
    const updateIndex = route.indexOf(".from('MessageTemplate')\n            .update({");
    const idScopeIndex = route.indexOf(".eq('id', row.id)", updateIndex);
    const spaceScopeIndex = route.indexOf(".eq('spaceId', space.id)", updateIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(updateIndex);
    expect(spaceScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(spaceScopeIndex).toBeLessThan(route.indexOf('if (updateErr)', updateIndex));
  });

  it('stamps the published source template by the version that was pushed', () => {
    const stampIndex = route.indexOf('publishedVersion: tmpl.version');
    const idScopeIndex = route.indexOf(".eq('id', tmpl.id)", stampIndex);
    const brokerageScopeIndex = route.indexOf(".eq('brokerageId', ctx.brokerage.id)", idScopeIndex);
    const versionScopeIndex = route.indexOf(".eq('version', tmpl.version)", brokerageScopeIndex);
    const selectIndex = route.indexOf(".select('id')", versionScopeIndex);

    expect(stampIndex).toBeGreaterThan(-1);
    expect(idScopeIndex).toBeGreaterThan(stampIndex);
    expect(brokerageScopeIndex).toBeGreaterThan(idScopeIndex);
    expect(versionScopeIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(selectIndex).toBeGreaterThan(versionScopeIndex);
  });
});
