import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

/**
 * Canonical realtor information architecture. A route may declare the Today
 * canvas in its server page or in the directly-rendered client view that owns
 * the working surface; both are intentional and captured here explicitly.
 */
const SURFACE_MATRIX = [
  ['Today', 'app/s/[slug]/chippi/brief/page.tsx'],
  ['Automations', 'app/s/[slug]/automations/page.tsx'],
  ['Automation configuration', 'app/s/[slug]/automations/settings/page.tsx'],
  ['People', 'app/s/[slug]/contacts/page.tsx'],
  ['Smart sync', 'app/s/[slug]/sync/sync-view.tsx'],
  ['Deals', 'components/deals/deals-page-client.tsx'],
  ['Deals loading', 'app/s/[slug]/deals/loading.tsx'],
  ['Deals error', 'app/s/[slug]/deals/error.tsx'],
  ['New deal', 'app/s/[slug]/deals/new/page.tsx'],
  ['Deal detail', 'app/s/[slug]/deals/[id]/page.tsx'],
  ['Calendar', 'app/s/[slug]/calendar/calendar-view.tsx'],
  ['Mailbox', 'app/s/[slug]/communication/communication-view.tsx'],
  ['Unified inbox', 'app/s/[slug]/inbox/page.tsx'],
  ['Follow-ups', 'app/s/[slug]/follow-ups/follow-ups-reveal.tsx'],
  ['Properties', 'app/s/[slug]/properties/page.tsx'],
  ['Properties loading', 'app/s/[slug]/properties/loading.tsx'],
  ['New property', 'app/s/[slug]/properties/new/page.tsx'],
  ['Property detail', 'app/s/[slug]/properties/[id]/page.tsx'],
  ['Commissions', 'app/s/[slug]/properties/commissions/page.tsx'],
  ['CMA', 'app/s/[slug]/cma/cma-view.tsx'],
  ['Studio', 'app/s/[slug]/studio/page.tsx'],
  ['Studio create', 'app/s/[slug]/studio/create/page.tsx'],
  ['Studio edit', 'app/s/[slug]/studio/edit/page.tsx'],
  ['Studio compose', 'app/s/[slug]/studio/compose/page.tsx'],
  ['Studio schedule', 'app/s/[slug]/studio/schedule/page.tsx'],
  ['Studio library', 'app/s/[slug]/studio/library/page.tsx'],
  ['Studio brand', 'app/s/[slug]/studio/brand/page.tsx'],
  ['Files', 'app/s/[slug]/files/page.tsx'],
  ['Documents', 'app/s/[slug]/documents/page.tsx'],
  ['Profile', 'app/s/[slug]/profile-page/page.tsx'],
  ['Intake', 'app/s/[slug]/intake/page.tsx'],
  ['Intake editor', 'app/s/[slug]/intake/customize/page.tsx'],
  ['Settings', 'app/s/[slug]/settings/page.tsx'],
] as const;

const TODAY_OPT_IN =
  /data-realtor-page="today"|<RealtorPage\b|<SupportingPage\b|layout="dashboard"|chippi-dashboard-canvas/;

describe('realtor dashboard route matrix', () => {
  it.each(SURFACE_MATRIX)('%s participates in the Today canvas', (_label, file) => {
    expect(read(file)).toMatch(TODAY_OPT_IN);
  });

  it('keeps Chippi root as the dedicated chat surface', () => {
    const chat = read('app/s/[slug]/chippi/page.tsx');
    expect(chat).toContain('<ChippiWorkspace');
    expect(chat).not.toContain('data-realtor-page="today"');
  });

  it('keeps the canonical loading and error states in the same canvas', () => {
    for (const file of ['app/s/[slug]/loading.tsx', 'app/s/[slug]/error.tsx']) {
      expect(read(file)).toContain('data-realtor-page="today"');
      expect(read(file)).toContain('chippi-dashboard-canvas');
    }
  });

  it('preserves canonical compatibility redirects', () => {
    const redirects = [
      ['app/s/[slug]/page.tsx', '/chippi/brief'],
      ['app/s/[slug]/chippi/today/page.tsx', '/chippi/brief'],
      ['app/s/[slug]/chippi/full-day/page.tsx', '/chippi/today'],
      ['app/s/[slug]/chippi/drafts/page.tsx', '/chippi/inbox'],
      ['app/s/[slug]/chippi/approvals/page.tsx', '/chippi/inbox'],
      ['app/s/[slug]/chippi/history/page.tsx', '/chippi/activity'],
      ['app/s/[slug]/chippi/memory/page.tsx', '/settings?tab=memory'],
      ['app/s/[slug]/workflows/page.tsx', '/automations'],
      ['app/s/[slug]/routines/page.tsx', '/automations'],
      ['app/s/[slug]/tours/page.tsx', '/calendar'],
      ['app/s/[slug]/email/page.tsx', '/communication?tab=email'],
      ['app/s/[slug]/whatsapp/page.tsx', '/communication?tab=messages'],
      ['app/s/[slug]/commissions/page.tsx', '/properties/commissions'],
      ['app/s/[slug]/integrations/page.tsx', '/settings?tab=connections'],
    ] as const;

    for (const [file, target] of redirects) {
      expect(read(file), file).toContain(target);
    }
  });
});
