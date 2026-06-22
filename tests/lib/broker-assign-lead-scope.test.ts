import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'lib/broker-assign-lead.ts'), 'utf8');

describe('broker lead assignment write scoping', () => {
  it('updates the source lead through the same brokerage/space binding used to resolve it', () => {
    expect(source).toContain("let updateScope: { column: 'spaceId' | 'brokerageId'; value: string }");
    expect(source).toContain("column: 'spaceId'");
    expect(source).toContain("updateScope = { column: 'brokerageId', value: brokerage.id }");
    expect(source).toContain(".eq(updateScope.column, updateScope.value)");
    expect(source.indexOf("updateScope = { column: 'brokerageId', value: brokerage.id }")).toBeLessThan(
      source.indexOf(".eq(updateScope.column, updateScope.value)"),
    );
  });
});
