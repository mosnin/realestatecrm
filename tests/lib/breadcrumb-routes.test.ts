/**
 * getBreadcrumbLabel resolves a pathname to a header label by matching the
 * route table from most-specific (longest path) to least. The precedence is
 * the whole point and the easy thing to break by reordering the table, so pin
 * the cases that depend on it: exact-vs-prefix, sibling routes where one path
 * is a prefix of another's label-distinct sibling, base stripping, and the
 * Dashboard fallback.
 */

import { describe, it, expect } from 'vitest';
import { getBreadcrumbLabel } from '@/lib/breadcrumb-routes';

describe('getBreadcrumbLabel', () => {
  it('matches an exact route only on an exact pathname', () => {
    expect(getBreadcrumbLabel('/contacts')).toBe('Contacts');
    expect(getBreadcrumbLabel('/leads')).toBe('Leads');
  });

  it('matches a prefix route on a sub-path', () => {
    expect(getBreadcrumbLabel('/contacts/abc-123')).toBe('Contacts');
    expect(getBreadcrumbLabel('/leads/new')).toBe('Leads');
    expect(getBreadcrumbLabel('/deals/42')).toBe('Pipeline');
  });

  it('prefers the longer, more-specific route (settings/brokerage over settings)', () => {
    expect(getBreadcrumbLabel('/settings/brokerage')).toBe('Brokerage');
    expect(getBreadcrumbLabel('/settings/notifications')).toBe('Settings');
  });

  it('does not let a shorter sibling shadow a longer broker route', () => {
    // '/broker/activity' must not swallow '/broker/agent-activity'.
    expect(getBreadcrumbLabel('/broker/agent-activity')).toBe('Agent activity');
    expect(getBreadcrumbLabel('/broker/activity')).toBe('Activity');
    expect(getBreadcrumbLabel('/broker/settings/routing-rules')).toBe('Routing rules');
    expect(getBreadcrumbLabel('/broker/settings')).toBe('Settings');
  });

  it('resolves the broker root to Chippi (exact)', () => {
    expect(getBreadcrumbLabel('/broker')).toBe('Chippi');
  });

  it('strips a base path before matching', () => {
    expect(getBreadcrumbLabel('/app/broker/people', '/app')).toBe('People');
    expect(getBreadcrumbLabel('/app/deals/7', '/app')).toBe('Pipeline');
  });

  it('falls back to Dashboard for an unknown route', () => {
    expect(getBreadcrumbLabel('/totally-unknown')).toBe('Dashboard');
    expect(getBreadcrumbLabel('/')).toBe('Dashboard');
  });
});
