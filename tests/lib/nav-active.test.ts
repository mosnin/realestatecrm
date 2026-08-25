/**
 * Sidebar active-state resolution.
 *
 * The regression this guards: every nav row used to decide its own active
 * state with a bare `pathname.startsWith(href)`, so a route reachable from
 * more than one row lit up ALL of them. On /broker/brief that meant three
 * simultaneous selections — the Chippi parent (its "Today" child cross-links
 * to /broker/brief), that child, and the top-level Today row that owns the
 * route.
 *
 * These tests run the real resolver against the real nav trees and assert the
 * rendered outcome: exactly one selected row per route.
 */

import { describe, expect, it } from 'vitest';
import { realtorNavItems } from '@/lib/nav-items';
import type { NavItem } from '@/lib/nav-items';
import {
  isNavChildActive,
  isNavItemActive,
  navItemOwnsMatch,
  resolveNavActive,
} from '@/lib/nav-active';
import { brokerAdminNavSections } from '@/components/dashboard/sidebar';

const brokerItems: NavItem[] = brokerAdminNavSections.flatMap((section) => section.items);

/**
 * Everything a viewer would see highlighted, rendered the way the sidebar
 * renders it: parents whose children are on screen (auto-expanded accordion)
 * hand the highlight to the winning child.
 */
function highlightedLabels(
  items: NavItem[],
  pathname: string,
  base: string,
  searchParams?: string,
): string[] {
  const match = resolveNavActive(items, pathname, base, searchParams);
  const labels: string[] = [];
  for (const item of items) {
    // The sidebar auto-expands the parent that owns the route.
    const expanded = !!item.children?.length && navItemOwnsMatch(item, match);
    if (isNavItemActive(item, match, { childrenVisible: expanded })) labels.push(item.label);
    if (!expanded) continue;
    for (const child of item.children ?? []) {
      if (isNavChildActive(item, child, match)) labels.push(`${item.label} › ${child.label}`);
    }
  }
  return labels;
}

describe('broker sidebar active state', () => {
  it('selects only the Today row on /broker/brief (was: Chippi + its child + Today)', () => {
    expect(highlightedLabels(brokerItems, '/broker/brief', '')).toEqual(['Today']);
  });

  it('selects only the Reviews row on /broker/reviews, not the Chippi Inbox cross-link', () => {
    expect(highlightedLabels(brokerItems, '/broker/reviews', '')).toEqual(['Reviews']);
  });

  it('selects the Chippi row itself on the chat home', () => {
    expect(highlightedLabels(brokerItems, '/broker/chippi', '')).toEqual(['Chippi']);
  });

  it('hands the highlight to the child on a settings sub-page', () => {
    expect(highlightedLabels(brokerItems, '/broker/settings/profile', '')).toEqual([
      'Settings › Profile',
    ]);
  });

  it('keeps the parent selected when its children are not on screen (rail / collapsed)', () => {
    const match = resolveNavActive(brokerItems, '/broker/settings/profile', '');
    const settings = brokerItems.find((item) => item.href === '/broker/settings')!;
    expect(isNavItemActive(settings, match, { childrenVisible: false })).toBe(true);
    expect(isNavItemActive(settings, match, { childrenVisible: true })).toBe(false);
  });

  it('never selects more than one row on any broker route', () => {
    const routes = [
      ...brokerItems.map((item) => item.href),
      ...brokerItems.flatMap((item) => (item.children ?? []).map((c) => c.href.split('?')[0])),
      '/broker/leads/abc123',
      '/broker/deals/deal_1/edit',
      '/broker/settings/routing-rules',
    ];
    for (const route of routes) {
      expect(highlightedLabels(brokerItems, route, '')).toHaveLength(1);
    }
  });
});

describe('realtor sidebar active state', () => {
  const base = '/s/acme';

  it('gives /chippi/brief to the promoted Today row, not the Chippi parent', () => {
    expect(highlightedLabels(realtorNavItems, `${base}/chippi/brief`, base)).toEqual(['Today']);
  });

  it('selects the Chippi child that owns a Chippi sub-route', () => {
    expect(highlightedLabels(realtorNavItems, `${base}/chippi/inbox`, base)).toEqual([
      'Chippi › Inbox',
    ]);
  });

  it('keeps a cross-linked child selectable when no other row owns its route', () => {
    expect(highlightedLabels(realtorNavItems, `${base}/sync`, base)).toEqual([
      'People › Smart sync',
    ]);
    expect(highlightedLabels(realtorNavItems, `${base}/cma`, base)).toEqual([
      'Properties › CMA',
    ]);
  });

  it('selects a query-scoped child only when its params are present', () => {
    expect(highlightedLabels(realtorNavItems, `${base}/automations`, base, 'new=1')).toEqual([
      'Automations › New workflow',
    ]);
    // Anchor children (#workflows / #routines) scroll within the hub page —
    // the pathname can't say which section is in view, so the row wins.
    expect(highlightedLabels(realtorNavItems, `${base}/automations`, base)).toEqual([
      'Automations',
    ]);
  });

  it('matches on segment boundaries, not raw string prefixes', () => {
    expect(highlightedLabels(realtorNavItems, `${base}/deals`, base)).toEqual(['Deals']);
    expect(highlightedLabels(realtorNavItems, `${base}/deals/123`, base)).toEqual(['Deals']);
    expect(highlightedLabels(realtorNavItems, `${base}/deals-archive`, base)).toEqual([]);
  });

  it('never selects more than one row on any realtor route', () => {
    const routes = [
      ...realtorNavItems.map((item) => item.href),
      ...realtorNavItems.flatMap((item) =>
        (item.children ?? []).map((c) => c.href.split('?')[0].split('#')[0]),
      ),
      '/contacts/contact_1',
      '/properties/prop_1',
      '/chippi/threads/t_1',
    ];
    for (const route of routes) {
      expect(highlightedLabels(realtorNavItems, `${base}${route}`, base)).toHaveLength(1);
    }
  });

  it('selects nothing for a route no row owns', () => {
    expect(highlightedLabels(realtorNavItems, `${base}/nowhere`, base)).toEqual([]);
  });
});
