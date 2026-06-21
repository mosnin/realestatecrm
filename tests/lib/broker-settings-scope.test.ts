import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/settings/route.ts'), 'utf8');

describe('broker settings update scoping', () => {
  it('updates the resolved brokerage and detects missing update rows', () => {
    const updateIndex = route.indexOf(".from('Brokerage')\n    .update(updates)");
    const brokerageScopeIndex = route.indexOf(".eq('id', ctx.brokerage.id)", updateIndex);
    const selectIndex = route.indexOf(".select('id')", brokerageScopeIndex);
    const maybeSingleIndex = route.indexOf(".maybeSingle<{ id: string }>()", selectIndex);
    const conflictIndex = route.indexOf('Brokerage settings changed. Refresh and try again.', maybeSingleIndex);

    expect(updateIndex).toBeGreaterThan(-1);
    expect(brokerageScopeIndex).toBeGreaterThan(updateIndex);
    expect(selectIndex).toBeGreaterThan(brokerageScopeIndex);
    expect(maybeSingleIndex).toBeGreaterThan(selectIndex);
    expect(conflictIndex).toBeGreaterThan(maybeSingleIndex);
  });
});
