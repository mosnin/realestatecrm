import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('broker page-family redesign', () => {
  it('gives populated operations routes explicit orientation, outcomes, actions, and work geometry', () => {
    const routes = {
      leads: ['data-route-orientation="intake"', 'Needs routing', 'Open intake form', 'data-primary-work-geometry="split-routing-queue"'],
      deals: ['data-route-orientation="board"', 'Active value', 'Open pipeline report', 'data-primary-work-geometry="horizontal-kanban"'],
      pipeline: ['data-route-orientation="analysis"', 'Won this month', 'View revenue forecast', 'data-primary-work-geometry="funnel-analysis"'],
      floor: ['data-route-orientation="live-operations"', 'Untouched leads', 'Put Chippi to work', 'data-primary-work-geometry="live-floor-grid"'],
      realtors: ['data-route-orientation="coaching-roster"', 'Need coaching', 'Invite an agent', 'data-primary-work-geometry="coaching-directory"'],
      members: ['data-route-orientation="workspace-access"', 'Access summary', 'Add a team member', 'data-primary-work-geometry="access-directory"'],
      analytics: ['data-route-orientation="performance-report"', 'Lead to win', 'Turn performance into forecast', 'data-primary-work-geometry="performance-report"'],
      messages: ['data-route-orientation="communications"', 'team communication', 'start a new one', 'data-primary-work-geometry="split-inbox"'],
      invitations: ['data-route-orientation="onboarding"', 'Quick join', 'Send an email invite', 'data-primary-work-geometry="onboarding-studio"'],
      commissions: ['data-route-orientation="ledger"', 'Broker default', 'CommissionsClient', 'data-primary-work-geometry="commission-ledger"'],
      forecast: ['data-route-orientation="forecast"', 'Projected GCI', 'Deals that swing it', 'data-primary-work-geometry="forecast-story"'],
    } as const;

    for (const [route, evidence] of Object.entries(routes)) {
      const source = read(`app/broker/${route}/page.tsx`);
      for (const marker of evidence) expect(source, `${route}: ${marker}`).toContain(marker);
    }
  });

  it('uses materially different route geometries rather than one repeated wrapper', () => {
    const markers = [
      'split-routing-queue',
      'horizontal-kanban',
      'funnel-analysis',
      'live-floor-grid',
      'coaching-directory',
      'access-directory',
      'performance-report',
      'split-inbox',
      'onboarding-studio',
      'commission-ledger',
      'forecast-story',
    ];

    expect(new Set(markers).size).toBe(markers.length);
    expect(read('components/broker/premium.ts')).toContain('Route-family geometry');
    expect(read('app/broker/leads/broker-leads-client.tsx')).toContain('data-lead-lane="unassigned"');
    expect(read('app/broker/leads/broker-leads-client.tsx')).toContain('data-lead-lane="routed"');
  });

  it('turns broker settings into a navigable workbench without replacing leaf behavior', () => {
    const layout = read('app/broker/settings/layout.tsx');
    const nav = read('app/broker/settings/settings-section-nav.tsx');

    expect(layout).toContain('data-broker-family="settings-workbench"');
    expect(layout).toContain('data-primary-work-geometry="settings-index"');
    for (const route of ['auto-assignment', 'routing-rules', 'form-builder', 'mcp']) {
      expect(nav).toContain(`/broker/settings/${route}`);
    }
    expect(nav).toContain("aria-current={active ? 'page' : undefined}");
  });
});
