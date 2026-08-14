import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const representativePages = [
  ['properties', 'app/s/[slug]/properties/page.tsx', 'inventory'],
  ['CMA', 'app/s/[slug]/cma/cma-view.tsx', 'inventory'],
  ['automations', 'app/s/[slug]/automations/page.tsx', 'operations'],
  ['Studio', 'app/s/[slug]/studio/page.tsx', 'studio'],
  ['files', 'app/s/[slug]/files/page.tsx', 'records'],
  ['documents', 'app/s/[slug]/documents/page.tsx', 'records'],
  ['intake', 'app/s/[slug]/intake/page.tsx', 'intake'],
  ['intake editor', 'app/s/[slug]/intake/customize/page.tsx', 'intake'],
  ['settings', 'app/s/[slug]/settings/page.tsx', 'control'],
  ['billing', 'app/s/[slug]/billing/page.tsx', 'control'],
  ['configure', 'app/s/[slug]/configure/page.tsx', 'control'],
  ['profile', 'app/s/[slug]/profile/page.tsx', 'control'],
  ['public profile editor', 'app/s/[slug]/profile-page/page.tsx', 'control'],
  ['specialists', 'app/s/[slug]/agents/page.tsx', 'coordination'],
  ['coordinated runs', 'app/s/[slug]/swarm/page.tsx', 'coordination'],
  ['affiliate', 'app/s/[slug]/affiliate/affiliate-view.tsx', 'service'],
  ['support', 'app/s/[slug]/support/support-view.tsx', 'service'],
] as const;

describe('supporting realtor page families', () => {
  it('keeps a route-specific orientation, next move, primary action, and work surface', () => {
    for (const [label, file, family] of representativePages) {
      const source = read(file);
      expect(source, label).toContain(`<SupportingPage family="${family}"`);
      expect(source, label).toContain(`<SupportingOrientation`);
      expect(source, label).toContain('nextAction=');
      expect(source, label).toContain('<SupportingWorkArea');
    }
  });

  it('uses grounded outcome bands on populated operational surfaces', () => {
    const files = [
      'app/s/[slug]/properties/page.tsx',
      'app/s/[slug]/automations/page.tsx',
      'app/s/[slug]/files/page.tsx',
      'app/s/[slug]/intake/page.tsx',
      'app/s/[slug]/settings/page.tsx',
      'app/s/[slug]/billing/page.tsx',
      'app/s/[slug]/agents/page.tsx',
      'app/s/[slug]/swarm/page.tsx',
      'app/s/[slug]/affiliate/affiliate-view.tsx',
      'app/s/[slug]/support/support-view.tsx',
    ];
    for (const file of files) {
      const source = read(file);
      expect(source, file).toContain('<SupportingMetricBand');
      expect(source, file).toContain('<SupportingMetric');
    }
  });

  it('gives Studio tools their own task language instead of repeating one page', () => {
    const expected = [
      ['create', 'Build the campaign image'],
      ['compose', 'Give the image a point of view'],
      ['library', 'Your reusable campaign archive'],
      ['schedule', 'Put the campaign on the calendar'],
      ['brand', 'Make every campaign recognizably yours'],
      ['edit', 'Refine the asset without starting over'],
    ] as const;
    for (const [route, title] of expected) {
      const source = read(`app/s/[slug]/studio/${route}/page.tsx`);
      expect(source, route).toContain('<SupportingPage family="studio"');
      expect(source, route).toContain(`title="${title}"`);
      expect(source, route).toContain('<SupportingWorkArea');
    }
  });

  it('makes analytics a signal-board family with an orientation per analysis', () => {
    expect(read('app/s/[slug]/analytics/layout.tsx')).toContain(
      '<SupportingPage family="intelligence"',
    );
    for (const route of ['clients', 'leads', 'pipeline', 'tours', 'form-traffic']) {
      const source = read(`app/s/[slug]/analytics/${route}/page.tsx`);
      expect(source, route).toContain('<SupportingOrientation');
      expect(source, route).toContain('family="intelligence"');
      expect(source, route).toContain('<SupportingWorkArea');
    }
    const overview = read('components/analytics/overview-view.tsx');
    expect(overview).toContain('<SupportingMetricBand');
    expect(overview).toContain('<SupportingWorkArea');
  });

  it('does not describe all automations as draft-only work', () => {
    const source = [
      read('app/s/[slug]/automations/page.tsx'),
      read('components/routines/routines-manager.tsx'),
    ].join('\n');
    expect(source).not.toContain('every run drafts');
    expect(source).toContain('permission mode');
  });

  it('keeps redirect-only supporting routes as redirects', () => {
    for (const file of [
      'app/s/[slug]/intake/analytics/page.tsx',
      'app/s/[slug]/intake/share/page.tsx',
      'app/s/[slug]/intake/tracking/page.tsx',
      'app/s/[slug]/settings/appearance/page.tsx',
      'app/s/[slug]/settings/content/page.tsx',
      'app/s/[slug]/settings/form-fields/page.tsx',
    ]) {
      expect(read(file), file).toContain('redirect(');
    }
  });
});
