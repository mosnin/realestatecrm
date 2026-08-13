import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BriefDashboard,
  TODAY_DASHBOARD_SOURCE,
  buildBriefDashboardViewModel,
  buildGroundedWorkExamples,
  daysSince,
} from '@/components/chippi/brief-dashboard';
import { ChippiPageShell } from '@/components/chippi/chippi-page-shell';
import type { BriefDashboard as DashboardData } from '@/lib/briefing/dashboard';

// The repository's Vitest transform uses the classic JSX runtime while Next
// uses the automatic runtime. Provide React for existing shared JSX modules
// (AnimatedNumber, Button) during this server-rendered behavior check.
vi.stubGlobal('React', React);

function dashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ownerName: 'Preston',
    brief: {
      headline: 'Two moves will unblock your morning.',
      subheadline: 'Start with the Henderson reply.',
      cards: [
        {
          kind: 'reply',
          source: 'gmail',
          subject: { id: 'contact-1', name: 'Hendersons', href: '/contacts/contact-1' },
          evidence: 'They replied overnight and are waiting on the next showing window.',
          draftedAction: null,
        },
      ],
      tip: null,
      momentum: 'One deal moved forward yesterday.',
      tomorrow: null,
      emptyState: null,
      sourcesUsed: ['gmail'],
    },
    needsYou: { newLeads: 3, followUpsDue: 5, pendingDrafts: 2, clientsWaiting: 1 },
    pipeline: { active: 7, closingThisWeek: 2, atRisk: 1, openValue: 865_000 },
    overnight: { total: 4, buckets: [{ label: 'drafts ready', count: 2 }, { label: 'tasks done', count: 2 }] },
    hotLeads: [{ id: 'lead-1', name: 'Maya Chen', leadScore: 91, lastContactedAt: null }],
    tours: [{ id: 'tour-1', startsAt: '2026-08-13T15:00:00.000Z', guestName: 'Maya Chen', propertyAddress: '12 Cedar Lane', href: '/contacts/lead-1' }],
    reputation: { requested: 4, clicked: 2 },
    reactivations: [],
    topReferrers: [],
    ...overrides,
  };
}

describe('BriefDashboard Today view model', () => {
  it('compares local calendar days instead of elapsed 24-hour windows', () => {
    expect(daysSince('2026-08-12T20:00:00-04:00', new Date('2026-08-13T08:00:00-04:00'))).toBe(1);
    expect(daysSince('2026-03-07T23:30:00-05:00', new Date('2026-03-09T00:30:00-04:00'))).toBe(2);
  });
  it('uses real open pipeline value as the focal metric and keeps four live outcome links', () => {
    const view = buildBriefDashboardViewModel('oak', dashboard());

    expect(view.focal).toEqual({ value: '$865K', label: 'open pipeline', href: '/s/oak/deals' });
    expect(view.metrics).toEqual([
      { label: 'New leads', value: 3, sub: 'not yet contacted', href: '/s/oak/leads' },
      { label: 'Follow-ups due', value: 5, sub: 'today or overdue', href: '/s/oak/follow-ups' },
      { label: 'Clients waiting', value: 1, sub: 'unread replies', href: '/s/oak/inbox' },
      { label: 'Active deals', value: 7, sub: '2 closing this week', href: '/s/oak/deals' },
    ]);
    expect(view.primaryStatus).toBe('Two moves will unblock your morning.');
    expect(view.rankedMoves).toHaveLength(1);
  });

  it('falls back to ranked work, then truthful empty status without inventing a statistic', () => {
    const noPipeline = buildBriefDashboardViewModel(
      'oak',
      dashboard({ pipeline: null }),
    );
    expect(noPipeline.focal).toEqual({ value: '1', label: 'ranked move', href: '#needs-you' });

    const empty = buildBriefDashboardViewModel(
      'oak',
      dashboard({
        brief: {
          headline: '',
          subheadline: null,
          cards: [],
          tip: null,
          momentum: null,
          tomorrow: null,
          emptyState: null,
          sourcesUsed: [],
        },
        needsYou: { newLeads: 0, followUpsDue: 0, pendingDrafts: 0, clientsWaiting: 0 },
        pipeline: null,
        overnight: null,
        hotLeads: [],
        tours: [],
        reputation: null,
      }),
    );
    expect(empty.focal).toEqual({ value: '0', label: 'items needing you', href: '#needs-you' });
    expect(empty.primaryStatus).toBe('Nothing urgent is waiting right now.');
  });

  it('keeps optional drafts out of the primary metrics while surfacing review work honestly', () => {
    const onlyDrafts = buildBriefDashboardViewModel(
      'oak',
      dashboard({
        brief: {
          headline: 'Quiet morning.',
          subheadline: null,
          cards: [],
          tip: null,
          momentum: null,
          tomorrow: null,
          emptyState: null,
          sourcesUsed: [],
        },
        needsYou: { newLeads: 0, followUpsDue: 0, pendingDrafts: 8, clientsWaiting: 0 },
        pipeline: null,
        overnight: null,
      }),
    );

    expect(onlyDrafts.waitingTotal).toBe(8);
    expect(onlyDrafts.focal).toEqual({ value: '8', label: 'items needing you', href: '#needs-you' });
    expect(onlyDrafts.primaryStatus).toBe('8 items are waiting on you.');
    expect(onlyDrafts.metrics.some((metric) => metric.label.includes('Draft'))).toBe(false);
  });

  it('rotates only examples grounded in current CRM counts', () => {
    const examples = buildGroundedWorkExamples(dashboard());

    expect(examples).toContain('Work through my 5 due follow-ups and move each one forward');
    expect(examples).toContain('Prioritize my 3 new leads and contact each with a personalized first touch');
    expect(examples).toContain('Review my 7 active deals and flag the highest-leverage next moves');
    expect(examples).toContain("Prepare me for 1 tour on today's calendar");
    expect(examples.every((example) => !example.includes('Series A'))).toBe(true);

  });

  it('renders the pinned source hierarchy responsively with one atmosphere and four live metrics', () => {
    const html = renderToStaticMarkup(
      createElement(BriefDashboard, { slug: 'oak', data: dashboard() }),
    );

    const atmospheres = html.match(/data-chippi-atmosphere="ascii-field"/g) ?? [];
    const metrics = html.match(/data-outcome-metric=/g) ?? [];

    expect(TODAY_DASHBOARD_SOURCE).toEqual({
      repository: 'mosnin/Sicarii',
      commit: 'b235cdbd590ae3652e2603a2187b838a8a204b8f',
      file: 'src/components/dashboard/dashboard-overview.tsx',
    });
    expect(html).toContain(
      'data-design-source="mosnin/Sicarii@b235cdbd590ae3652e2603a2187b838a8a204b8f:src/components/dashboard/dashboard-overview.tsx"',
    );
    expect(html).toContain('CHIPPI // TODAY');
    expect(html).toContain('data-work-entry="today"');
    expect(html).toContain('grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4');
    expect(html).toContain('lg:grid-cols-[minmax(0,1.75fr)_minmax(18rem,0.8fr)]');
    expect(atmospheres).toHaveLength(1);
    expect(metrics).toHaveLength(4);
    expect(html).toContain('href="/s/oak/leads"');
    expect(html).toContain('href="/s/oak/follow-ups"');
    expect(html).toContain('href="/s/oak/inbox"');
    expect(html).toContain('href="/s/oak/deals"');
    expect(html).toContain('href="/s/oak/chippi/activity"');
    expect(html).toContain('2 drafts ready for review');
    expect(html).toContain('href="/s/oak/calendar"');
    expect(html).toContain('href="/s/oak/contacts/contact-1"');
    expect(html).not.toContain('Series A');
    expect(html).not.toContain('fintech');
  });

  it('uses the wide editorial dashboard canvas while preserving the reading-shell default', () => {
    const dashboardShell = renderToStaticMarkup(
      // React 19's createElement overload requires required children in props.
      // eslint-disable-next-line react/no-children-prop
      createElement(ChippiPageShell, { layout: 'dashboard', children: 'Today' }),
    );
    const readingShell = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop
      createElement(ChippiPageShell, { greeting: 'Memory.', children: 'Saved context' }),
    );

    expect(dashboardShell).toContain('max-w-[1500px]');
    expect(dashboardShell).not.toContain('max-w-5xl');
    expect(readingShell).toContain('max-w-5xl');
    expect(readingShell).not.toContain('max-w-[1500px]');
  });

  it('replaces the all-zero wall with grounded orientation actions', () => {
    const emptyData = dashboard({
      brief: {
        headline: '', subheadline: null, cards: [], tip: null, momentum: null,
        tomorrow: null, emptyState: { invitation: 'Bring your real estate work into one place.' },
        sourcesUsed: [],
      },
      needsYou: { newLeads: 0, followUpsDue: 0, pendingDrafts: 0, clientsWaiting: 0 },
      pipeline: null,
      overnight: null,
      hotLeads: [],
      tours: [],
      reputation: null,
      reactivations: [],
      topReferrers: [],
    });
    const html = renderToStaticMarkup(createElement(BriefDashboard, { slug: 'oak', data: emptyData }));

    expect(html).toContain('Your workspace is ready.');
    expect(html).toContain('Add your first contact');
    expect(html).toContain('Connect your inbox');
    expect(html).not.toContain('data-outcome-metric=');
    expect(html).not.toContain('data-verified-activity');
  });
});
