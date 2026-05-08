/**
 * Properties nav invariants.
 *
 * The properties page is a real listing page at `/s/:slug/properties`.
 * Commissions lives at `/s/:slug/properties/commissions` and is surfaced
 * in `realtorMoreNavItems`. These tests guard against accidental nav
 * regressions.
 */
import { describe, it, expect } from 'vitest';

import { realtorMoreNavItems } from '@/lib/nav-items';

describe('Properties nav', () => {
  it('realtorMoreNavItems has no standalone Properties entry, only Commissions', () => {
    const hrefs = realtorMoreNavItems.map((i) => i.href);
    expect(hrefs).not.toContain('/properties');
    expect(hrefs).toContain('/properties/commissions');

    // No item with children pointing back to /properties
    for (const item of realtorMoreNavItems) {
      expect(item.children ?? []).toEqual([]);
      expect(item.href.startsWith('/properties') ? item.href : '/properties/commissions')
        .toBe(item.href.startsWith('/properties') ? '/properties/commissions' : '/properties/commissions');
    }
  });

  it('command palette static actions drop nav-properties, keep nav-commissions', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../../components/command-palette/command-palette.tsx', import.meta.url),
      'utf-8',
    );

    expect(src).not.toMatch(/'nav-properties'/);
    expect(src).toMatch(/'nav-commissions'/);
    // Building2 was the properties palette icon — not expected back here.
    expect(src).not.toMatch(/\bBuilding2\b/);
  });
});
