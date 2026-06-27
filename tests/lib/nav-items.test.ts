/**
 * nav-items.ts is the sidebar's source of truth. A few structural invariants
 * are easy to break by hand-editing the arrays and would cause real bugs: a
 * duplicate href makes two rows highlight as "active" at once; a mobile tab
 * pointing at a route the sidebar doesn't expose drifts the two navs; and the
 * sidebar HIDES the "More" / secondary sections by checking `.length`, so
 * their documented emptiness is load-bearing. Pin them.
 */

import { describe, it, expect } from 'vitest';
import {
  realtorNavItems,
  realtorMoreNavItems,
  secondaryNavItems,
  mobileNavItems,
} from '@/lib/nav-items';

const allHrefs = realtorNavItems.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])]);

describe('nav-items structure', () => {
  it('every nav href is an absolute app path with a real label + icon', () => {
    for (const item of realtorNavItems) {
      expect(item.href.startsWith('/')).toBe(true);
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(item.icon).toBeTruthy();
      for (const child of item.children ?? []) {
        expect(child.href.startsWith('/')).toBe(true);
        expect(child.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('has no duplicate href across the whole tree (no double-active rows)', () => {
    expect(new Set(allHrefs).size).toBe(allHrefs.length);
  });

  it('every mobile tab points at a real top-level sidebar route', () => {
    const topLevel = new Set(realtorNavItems.map((i) => i.href));
    for (const m of mobileNavItems) {
      expect(topLevel.has(m.href)).toBe(true);
    }
  });

  it('keeps the More + secondary sections empty (sidebar hides them by length)', () => {
    expect(realtorMoreNavItems).toHaveLength(0);
    expect(secondaryNavItems).toHaveLength(0);
  });
});
