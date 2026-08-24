import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('root social metadata', () => {
  it('resolves generated image URLs against the production origin', () => {
    const source = readFileSync('app/layout.tsx', 'utf8');

    expect(source).toContain("metadataBase: new URL('https://www.usechippi.com')");
  });

  it('localizes Clerk authentication from the resolved market language', () => {
    const source = readFileSync('app/layout.tsx', 'utf8');

    expect(source).toContain("from '@clerk/localizations/es-ES'");
    expect(source).toContain("from '@clerk/localizations/ru-RU'");
    expect(source).toContain("requestedLang === 'es'");
    expect(source).toContain("requestedLang === 'ru'");
    expect(source).toContain('<ClerkProvider localization={clerkLocalization}>');
  });
});
