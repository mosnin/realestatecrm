import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'app/api/broker/join/route.ts'), 'utf8');

describe('broker join workspace scoping', () => {
  it('only adopts an unlinked space and keeps the update race-safe', () => {
    expect(source).toContain(".select('id, brokerageId')");
    expect(source).toContain(".eq('ownerId', user.id)");
    expect(source).toContain(".update({ brokerageId: brokerage.id })\n      .eq('id', space.id)\n      .is('brokerageId', null)");
  });
});
