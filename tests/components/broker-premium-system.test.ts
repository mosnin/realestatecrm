import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const canonicalBrokerPages = [
  'activity',
  'agent-activity',
  'analytics',
  'billing',
  'brief',
  'commissions',
  'deals',
  'floor',
  'forecast',
  'import-export',
  'integrations',
  'invitations',
  'leaderboard',
  'leads',
  'members',
  'messages',
  'my-leads',
  'people',
  'pipeline',
  'profitability',
  'properties',
  'realtors',
  'realtors/[userId]',
  'reviews',
  'reviews/[id]',
  'routines',
  'settings',
  'settings/auto-assignment',
  'settings/form-builder',
  'settings/mcp',
  'settings/profile',
  'settings/routing-rules',
  'templates',
  'usage',
] as const;

const brokerStateFiles = [
  'deals/error.tsx',
  'deals/loading.tsx',
  'forecast/error.tsx',
  'forecast/loading.tsx',
  'integrations/error.tsx',
  'integrations/loading.tsx',
  'members/loading.tsx',
  'people/error.tsx',
  'people/loading.tsx',
  'properties/error.tsx',
  'properties/loading.tsx',
  'realtors/error.tsx',
  'realtors/loading.tsx',
  'usage/error.tsx',
  'usage/loading.tsx',
] as const;

describe('broker premium dashboard contract', () => {
  it('puts every canonical brokerage page inside the premium page system', () => {
    for (const route of canonicalBrokerPages) {
      expect(read(`app/broker/${route}/page.tsx`), route).toContain(
        'data-broker-premium-page',
      );
    }
  });

  it('shares the warm dashboard canvas and composes the canonical panel primitives', () => {
    const layout = read('app/broker/layout.tsx');
    const premium = read('components/broker/premium.ts');

    expect(layout).toContain('data-broker-premium-shell="true"');
    expect(layout).toContain('chippi-dashboard-canvas');
    expect(premium).toContain('DASHBOARD_SURFACE');
    expect(premium).toContain('DASHBOARD_INSET');
    expect(premium).toContain('DASHBOARD_ROW');
    expect(premium).toContain('bg-[var(--dashboard-paper)]');
    expect(premium).toContain('bg-[var(--dashboard-paper-muted)]');
    expect(premium).not.toContain('gradient');
  });

  it('uses the accepted Today atmosphere for both brokerage roles', () => {
    for (const file of ['app/broker/brief/page.tsx', 'app/broker/member-dashboard.tsx']) {
      const source = read(file);
      expect(source).toContain('BROKER_HERO');
      expect(source).toContain('AsciiField');
      expect(source).toContain('data-chippi-atmosphere="ascii-field"');
      expect(source).not.toMatch(/(?:from|to)-(?:red|amber|yellow|green|blue|purple)-/);
    }
    expect(read('app/broker/brief/page.tsx')).toContain('href="/broker/chippi"');
  });

  it('keeps loading and error boundaries in the same premium system', () => {
    for (const file of brokerStateFiles) {
      expect(read(`app/broker/${file}`), file).toContain('data-broker-premium-state');
    }
  });

  it('sends broker Chippi deep links to the canonical chat route', () => {
    const ownedSources = [
      'app/broker/deals/broker-kanban-board.tsx',
      'app/broker/forecast/page.tsx',
      'app/broker/people/broker-people-table.tsx',
      'app/broker/realtors/realtors-client.tsx',
      'app/broker/realtors/[userId]/page.tsx',
    ].map(read);

    for (const source of ownedSources) {
      expect(source).not.toMatch(/\/broker\?(?:prompt|prefill|conversationId)=/);
      expect(source).toContain('/broker/chippi?prompt=');
    }
  });
});
