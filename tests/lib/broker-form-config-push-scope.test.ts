import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/form-config/push/route.ts'), 'utf8');

describe('broker form config push write scoping', () => {
  it('does not overwrite a member customization created during push', () => {
    const updateIndex = route.indexOf(".from('SpaceSetting')\n            .update({ ...configUpdate");
    const spaceScopeIndex = route.indexOf(".eq('spaceId', space.id)", updateIndex);
    const customGuardIndex = route.indexOf(".neq('formConfigSource', 'custom')", updateIndex);
    const selectIndex = route.indexOf(".select('id')", updateIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(spaceScopeIndex).toBeGreaterThan(updateIndex);
    expect(customGuardIndex).toBeGreaterThan(spaceScopeIndex);
    expect(selectIndex).toBeGreaterThan(customGuardIndex);
    expect(route).toContain('skipped (customized during push)');
  });
});
