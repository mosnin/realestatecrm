/**
 * Properties cut — invariants for the Phase audit-7-to-8 surgery.
 *
 * The standalone `/properties` list page has been deleted. Three guards live
 * here so the cut can't be silently undone:
 *
 *   1. Visiting `/s/:slug/properties` permanent-redirects (308) to
 *      `/s/:slug/properties/commissions`. External bookmarks survive; the
 *      surface is gone.
 *   2. `realtorMoreNavItems` no longer contains a "Properties" parent — only
 *      a single "Commissions" entry pointing at the revenue view.
 *   3. The command palette's static actions no longer contain `nav-properties`,
 *      and `nav-commissions` is the only properties-adjacent nav entry.
 *
 * Mocks `next/navigation` so we can capture the redirect target without
 * actually throwing the `NEXT_REDIRECT` exception that runs in real RSC.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  permanentRedirect: vi.fn((url: string) => {
    // Match Next's runtime behaviour: throw a sentinel so the page function
    // halts. We only care about the captured arg in the test.
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};308;`;
    throw err;
  }),
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import { permanentRedirect } from 'next/navigation';
import PropertiesIndexRedirect from '@/app/s/[slug]/properties/page';
import { realtorMoreNavItems } from '@/lib/nav-items';

describe('Properties cut', () => {
  it('redirects /s/:slug/properties → /s/:slug/properties/commissions (308)', async () => {
    const params = Promise.resolve({ slug: 'acme' });

    await expect(PropertiesIndexRedirect({ params })).rejects.toThrow(
      /NEXT_REDIRECT:\/s\/acme\/properties\/commissions/,
    );

    expect(permanentRedirect).toHaveBeenCalledWith('/s/acme/properties/commissions');
  });

  it('uses permanentRedirect (308), not the temporary redirect helper', async () => {
    const nav = await import('next/navigation');
    const params = Promise.resolve({ slug: 'foo' });
    await expect(PropertiesIndexRedirect({ params })).rejects.toThrow();

    // 308 = permanent. We chose permanentRedirect specifically so external
    // bookmarks rewrite themselves; if someone downgrades to redirect(), this
    // catches it.
    expect(nav.permanentRedirect).toHaveBeenCalled();
  });

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
    // The palette is a client component; we read its source instead of
    // rendering it (vitest is node-env, no DOM). Source inspection is the
    // smallest invariant guard: if someone re-adds the entry, this fails.
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../../components/command-palette/command-palette.tsx', import.meta.url),
      'utf-8',
    );

    expect(src).not.toMatch(/'nav-properties'/);
    expect(src).toMatch(/'nav-commissions'/);
    // The Building2 icon was only used by nav-properties — its import should
    // be gone too. Any future re-introduction of a properties palette entry
    // should pick a money icon (Wallet, BarChart2), not Building2.
    expect(src).not.toMatch(/\bBuilding2\b/);
  });
});
