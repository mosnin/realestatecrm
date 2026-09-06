import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BriefDashboard,
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
    const previousEvening = new Date(2026, 7, 12, 20, 0, 0);
    const nextMorning = new Date(2026, 7, 13, 8, 0, 0);
    expect(daysSince(previousEvening.toISOString(), nextMorning)).toBe(1);

    const sameDayEarly = new Date(2026, 7, 13, 0, 30, 0);
    const sameDayLate = new Date(2026, 7, 13, 23, 30, 0);
    expect(daysSince(sameDayEarly.toISOString(), sameDayLate)).toBe(0);

    const saturdayNight = new Date(2026, 2, 7, 23, 30, 0);
    const mondayMorning = new Date(2026, 2, 9, 0, 30, 0);
    expect(daysSince(saturdayNight.toISOString(), mondayMorning)).toBe(2);
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

  it('renders real work, appointments and working destination links', () => {
    const html = renderToStaticMarkup(
      createElement(BriefDashboard, { slug: 'oak', data: dashboard() }),
    );

    expect(html).toContain('Needs you');
    expect(html).toContain('Work completed');
    expect(html).toContain('Upcoming tours');
    expect(html).toContain('data-work-entry="today"');
    expect(html.indexOf('Needs you')).toBeLessThan(html.indexOf('Work completed'));
    expect(html).toContain('href="/s/oak/leads"');
    expect(html).toContain('href="/s/oak/follow-ups"');
    expect(html).toContain('href="/s/oak/inbox"');
    expect(html).toContain('href="/s/oak/deals"');
    expect(html).toContain('href="/s/oak/chippi/activity"');
    expect(html).toContain('drafts awaiting your decision');
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

    expect(html).toContain('No completed actions recorded');
    expect(html).toContain('Set up work for Chippi');
    expect(html).toContain('Connect your inbox and calendar');
    expect(html).not.toContain('data-outcome-metric=');
    expect(html).toContain('data-verified-activity');
  });
});
