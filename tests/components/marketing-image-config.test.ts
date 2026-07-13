import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('marketing social-image route config', () => {
  it('keeps Twitter metadata literals aligned with the Open Graph image', () => {
    const twitter = readFileSync('app/(marketing)/twitter-image.tsx', 'utf8');
    const openGraph = readFileSync('app/(marketing)/opengraph-image.tsx', 'utf8');

    for (const literal of [
      "export const runtime = 'edge'",
      "export const alt = 'Chippi · Agentic OS for real estate'",
      'export const size = { width: 1200, height: 630 }',
      "export const contentType = 'image/png'",
    ]) {
      expect(twitter).toContain(literal);
      expect(openGraph).toContain(literal);
    }

    expect(twitter).not.toMatch(/export\s*\{[\s\S]*?runtime[\s\S]*?\}\s*from/);
  });
});
