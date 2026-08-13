import { readFileSync } from 'node:fs';
import React, { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { React?: typeof React }).React = React;

const {
  authMock,
  getSpaceFromSlugMock,
  getSpaceForUserMock,
  fromMock,
  contactTableMock,
  performanceStripMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ userId: 'user-1' })),
  getSpaceFromSlugMock: vi.fn(async () => ({ id: 'space-1', slug: 'home' })),
  getSpaceForUserMock: vi.fn(async () => ({ id: 'space-1' })),
  fromMock: vi.fn(),
  contactTableMock: vi.fn(() => null),
  performanceStripMock: vi.fn(() => null),
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));
vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: getSpaceFromSlugMock,
  getSpaceForUser: getSpaceForUserMock,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: fromMock } }));
vi.mock('@/components/contacts/contact-table', () => ({
  ContactTable: contactTableMock,
}));
vi.mock('@/components/contacts/performance-strip', () => ({
  PerformanceStrip: performanceStripMock,
}));
vi.mock('@/components/experience/contacts-quick-capture', () => ({
  ContactsQuickCapture: vi.fn(() => null),
}));

import ContactsPage from '@/app/s/[slug]/contacts/page';

const dealRows = [
  {
    id: 'deal-1',
    status: 'active',
    stageId: 'stage-1',
    createdAt: '2026-08-01T00:00:00.000Z',
    closedAt: null,
    stageChangedAt: '2026-08-10T00:00:00.000Z',
  },
];
const stageRows = [{ id: 'stage-1', name: 'Tour' }];

function installPerformanceQueries() {
  fromMock.mockImplementation((table: string) => {
    if (table === 'Deal') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: dealRows })),
        })),
      };
    }
    if (table === 'DealStage') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(async () => ({ data: stageRows })),
          })),
        })),
      };
    }
    throw new Error(`unexpected table:${table}`);
  });
}

function findElement(node: any, type: unknown): any {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  const children = React.Children.toArray(node.props?.children);
  for (const child of children) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

async function renderPage(openCreate = false): Promise<ReactElement> {
  return (await ContactsPage({
    params: Promise.resolve({ slug: 'home' }),
    searchParams: Promise.resolve(openCreate ? { new: 'contact' } : {}),
  })) as ReactElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: 'user-1' });
  getSpaceFromSlugMock.mockResolvedValue({ id: 'space-1', slug: 'home' });
  getSpaceForUserMock.mockResolvedValue({ id: 'space-1' });
  installPerformanceQueries();
});

describe('contacts premium overview', () => {
  it('keeps the authenticated workspace boundary and passes only real query rows into the summary', async () => {
    const page = await renderPage(true);
    const table = findElement(page, contactTableMock);

    expect(table).toBeTruthy();
    expect(table.props.slug).toBe('home');
    expect(table.props.openCreateForm).toBe(true);
    expect(table.props.summary.type).toBe(performanceStripMock);
    expect(table.props.summary.props.deals).toEqual(dealRows);
    expect(table.props.summary.props.stages).toEqual(stageRows);
    expect(table.props.summary.props.unavailable).toBe(false);
    expect(getSpaceForUserMock).toHaveBeenCalledWith('user-1');
    expect(fromMock).toHaveBeenCalledWith('Deal');
    expect(fromMock).toHaveBeenCalledWith('DealStage');
  });

  it('fails closed when the requested workspace is not the signed-in user workspace', async () => {
    getSpaceForUserMock.mockResolvedValue({ id: 'space-other' });

    await expect(renderPage()).rejects.toThrow('notFound');
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('marks pipeline metrics unavailable instead of presenting query errors as zero data', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'Deal') {
        return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: { message: 'offline' } })) })) };
      }
      if (table === 'DealStage') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(async () => ({ data: null, error: null })) })) })) };
      }
      throw new Error(`unexpected table:${table}`);
    });

    const page = await renderPage();
    const table = findElement(page, contactTableMock);
    expect(table.props.summary.props.unavailable).toBe(true);
  });

  it('locks the visual surface to warm paper summaries and one light-selected hairline list', () => {
    const page = readFileSync('app/s/[slug]/contacts/page.tsx', 'utf8');
    const table = readFileSync('components/contacts/contact-table.tsx', 'utf8');
    const summary = readFileSync('components/contacts/performance-strip.tsx', 'utf8');
    const loading = readFileSync('app/s/[slug]/contacts/loading.tsx', 'utf8');

    expect(page).toContain('chippi-dashboard-canvas');
    expect(page).toContain('data-contacts-overview="premium"');
    expect(summary).toContain('DASHBOARD_SURFACE');
    expect(summary).toContain('data-contact-summary="pipeline-performance"');
    expect(loading).toContain('chippi-dashboard-panel');

    expect(table).toContain('aria-label="Contact directory"');
    expect(table).toContain('divide-y divide-border/60');
    expect(table).toContain('bg-dashboard-paper-muted ring-1 ring-inset ring-border/60');
    expect(table).not.toContain("view === 'card'");
    expect(table).not.toContain('function ContactCard');
    expect(table).not.toContain('LayoutGrid');
    expect(table).not.toContain('bg-foreground text-background border-foreground');
    expect(table).toContain('aria-label={`Actions for ${contact.name}`}');
    expect(table).toContain('limit: String(pageSize)');
    expect(table).toContain('offset: String(offset)');
    expect(table).toContain('requestId !== contactsRequestRef.current');
  });

  it('retains the real contacts workflows behind the calmer presentation', () => {
    const table = readFileSync('components/contacts/contact-table.tsx', 'utf8');

    for (const contract of [
      'const pageSize = 500',
      'offset: String(offset)',
      "fetch('/api/contacts/bulk'",
      '<CsvImportModal',
      '<ApplicationCompare',
      '<DuplicatesPanel',
      'handleExportSelected',
      'handleBulkArchive',
      'handleBulkDelete',
      'onOpenChange={handleAddOpenChange}',
      'router.replace(`/s/${slug}/contacts`, { scroll: false })',
      'href={`/s/${slug}/contacts/${contact.id}`}',
    ]) {
      expect(table, contract).toContain(contract);
    }
  });
});
