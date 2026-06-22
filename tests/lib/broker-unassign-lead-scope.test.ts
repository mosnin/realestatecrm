import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.join(process.cwd(), 'app/api/broker/unassign-lead/route.ts'), 'utf8');

describe('broker lead unassignment write scoping', () => {
  it('updates the source lead through the same brokerage/space binding used to resolve it', () => {
    expect(source).toContain("let updateScope: { column: 'spaceId' | 'brokerageId'; value: string }");
    expect(source).toContain("updateScope = { column: 'brokerageId', value: brokerage.id }");
    expect(source).toContain(".eq(updateScope.column, updateScope.value)");
    expect(source.indexOf("updateScope = { column: 'brokerageId', value: brokerage.id }")).toBeLessThan(
      source.indexOf(".eq(updateScope.column, updateScope.value)"),
    );
  });

  it('normalizes tags before checking assigned state', () => {
    expect(source).toContain('Array.isArray(brokerContact.tags)');
    expect(source).toContain('filter((tag: unknown): tag is string');
    expect(source.indexOf('Array.isArray(brokerContact.tags)')).toBeLessThan(source.indexOf("existingTags.includes('assigned')"));
  });
});
