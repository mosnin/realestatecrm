import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('vector search lifecycle', () => {
  it('keeps unawaited contact and deal index updates alive after the response', () => {
    const source = readFileSync('lib/vectorize.ts', 'utf8');

    expect(source).toContain("import { after } from 'next/server';");
    expect(source).toContain('after(() => task);');
    expect(source).toContain('keepAlive(persistContactVector(contact))');
    expect(source).toContain('keepAlive(persistDealVector(deal))');
    expect(source).toContain('keepAlive(deleteVector(');
  });
});
