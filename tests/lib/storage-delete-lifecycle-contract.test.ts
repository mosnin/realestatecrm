import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('storage delete lifecycle', () => {
  it('keeps unawaited Wasabi cleanup alive after the response', () => {
    const source = readFileSync('lib/storage/index.ts', 'utf8');

    expect(source).toContain("import { after } from 'next/server';");
    expect(source).toContain('const task = performDeleteObject(key);');
    expect(source).toContain('after(() => task);');
  });
});
