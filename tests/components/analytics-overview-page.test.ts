/**
 * Behavioral tests for the analytics overview page's speed-to-lead wiring
 * (app/s/[slug]/analytics/page.tsx). The overview has no API route — the
 * server page IS the data path — so we execute the page component with
 * mocked collaborators and assert on the props handed to OverviewView.
 *
 * Contract under test:
 *   - The page fetches speed-to-lead for the AUTHENTICATED space's id over
 *     the rolling 30-day window and attaches it to OverviewData.
 *   - A speed-to-lead failure degrades to speedToLead:null (card hides;
 *     never a fabricated stat) while the rest of the overview still renders.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { type ReactElement } from 'react';

// vitest's esbuild uses the classic JSX transform, so the page module's JSX
// resolves the bare identifier `React` at call time — provide it globally.
(globalThis as { React?: typeof React }).React = React;

const { authMock, getSpaceFromSlugMock, fetchRawMock, speedMock, overviewViewMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(async () => ({ userId: 'user_1' })),
    getSpaceFromSlugMock: vi.fn(async () => ({ id: 'space-1', slug: 'acme', name: 'Acme' })),
    fetchRawMock: vi.fn(async () => ({ contacts: [], deals: [], stages: [], tours: [] })),
    speedMock: vi.fn(),
    overviewViewMock: vi.fn(() => null),
  }));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirect');
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));
vi.mock('@/lib/space', () => ({ getSpaceFromSlug: getSpaceFromSlugMock }));
vi.mock('@/lib/analytics-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/analytics-data')>();
  return { ...actual, fetchRawAnalyticsData: fetchRawMock };
});
vi.mock('@/lib/analytics/speed-to-lead-data', () => ({
  getSpaceSpeedToLead: speedMock,
}));
// The view itself is a client component full of chart libs — the page test
// only cares about the data handed to it.
vi.mock('@/components/analytics/overview-view', () => ({ OverviewView: overviewViewMock }));

import AnalyticsOverviewPage from '@/app/s/[slug]/analytics/page';
import { SPEED_TO_LEAD_WINDOW_DAYS } from '@/lib/analytics/speed-to-lead';

const RESULT = {
  leadCount: 12,
  touchedCount: 10,
  medianMinutes: 14,
  p90Minutes: 250,
  chippiFirstCount: 8,
};

async function renderPage(): Promise<ReactElement> {
  return (await AnalyticsOverviewPage({
    params: Promise.resolve({ slug: 'acme' }),
  })) as ReactElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: 'user_1' });
  getSpaceFromSlugMock.mockResolvedValue({ id: 'space-1', slug: 'acme', name: 'Acme' });
  fetchRawMock.mockResolvedValue({ contacts: [], deals: [], stages: [], tours: [] });
});

describe('analytics overview page — speed-to-lead wiring', () => {
  it('fetches speed-to-lead for the resolved space over the 30-day window and passes it to the view', async () => {
    speedMock.mockResolvedValue(RESULT);

    const el = await renderPage();

    expect(el.type).toBe(overviewViewMock);
    const data = (el.props as { data: Record<string, unknown> }).data;
    expect(data.speedToLead).toEqual(RESULT);
    // The rest of the overview payload is still assembled.
    expect(data.totalContacts).toBe(0);

    expect(speedMock).toHaveBeenCalledTimes(1);
    const [spaceId, window] = speedMock.mock.calls[0] as [string, { from: Date; to: Date }];
    expect(spaceId).toBe('space-1');
    expect(window.to.getTime() - window.from.getTime()).toBe(
      SPEED_TO_LEAD_WINDOW_DAYS * 86_400_000,
    );
  });

  it('degrades to speedToLead:null when the fetch fails — the overview still renders', async () => {
    speedMock.mockRejectedValue(new Error('db down'));

    const el = await renderPage();

    expect(el.type).toBe(overviewViewMock);
    const data = (el.props as { data: Record<string, unknown> }).data;
    expect(data.speedToLead).toBeNull();
    expect(data.totalContacts).toBe(0);
  });
});
