import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('root social metadata', () => {
  it('resolves generated image URLs against the production origin', () => {
    const source = readFileSync('app/layout.tsx', 'utf8');

    expect(source).toContain("metadataBase: new URL('https://www.usechippi.com')");
  });
});
