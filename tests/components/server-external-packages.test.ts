import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('server dependency bundling', () => {
  it('externalizes server-only dynamic loaders from the Next.js bundle', () => {
    const config = readFileSync('next.config.ts', 'utf8');

    expect(config).toContain(
      "serverExternalPackages: ['isomorphic-dompurify', 'jsdom', 'heic-convert', 'ably']",
    );
  });
});
