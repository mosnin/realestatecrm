import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const route = readFileSync(path.join(process.cwd(), 'app/api/broker/form-config/route.ts'), 'utf8');

describe('broker form config update scoping', () => {
  it('selects updated brokerage rows and returns a conflict when no row is updated', () => {
    const putIndex = route.indexOf(".update({ [column]: formConfig })");
    const putScopeIndex = route.indexOf(".eq('id', ctx.brokerage.id)", putIndex);
    const putSelectIndex = route.indexOf(".select('id')", putScopeIndex);
    const putConflictIndex = route.indexOf('Brokerage form config changed. Refresh and try again.', putSelectIndex);

    const deleteIndex = route.indexOf('.update(updates)', putConflictIndex);
    const deleteScopeIndex = route.indexOf(".eq('id', ctx.brokerage.id)", deleteIndex);
    const deleteSelectIndex = route.indexOf(".select('id')", deleteScopeIndex);
    const deleteConflictIndex = route.indexOf('Brokerage form config changed. Refresh and try again.', deleteSelectIndex);

    expect(putScopeIndex).toBeGreaterThan(putIndex);
    expect(putSelectIndex).toBeGreaterThan(putScopeIndex);
    expect(putConflictIndex).toBeGreaterThan(putSelectIndex);
    expect(deleteScopeIndex).toBeGreaterThan(deleteIndex);
    expect(deleteSelectIndex).toBeGreaterThan(deleteScopeIndex);
    expect(deleteConflictIndex).toBeGreaterThan(deleteSelectIndex);
  });

  it('rejects invalid reset lead types before building update payloads', () => {
    const deleteHandlerIndex = route.indexOf('export async function DELETE');
    const leadTypeIndex = route.indexOf('const leadType = body.leadType', deleteHandlerIndex);
    const validationIndex = route.indexOf('leadType !== \'rental\' && leadType !== \'buyer\'', leadTypeIndex);
    const updatesIndex = route.indexOf('const updates: Record<string, unknown> = {};', validationIndex);

    expect(validationIndex).toBeGreaterThan(leadTypeIndex);
    expect(updatesIndex).toBeGreaterThan(validationIndex);
  });
});
