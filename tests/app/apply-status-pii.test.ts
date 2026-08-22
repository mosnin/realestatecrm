/**
 * Behavioral tests for the public application status page
 * (`app/apply/[slug]/status/page.tsx`).
 *
 * A confirmation-email `?ref=` is enough to confirm that an application
 * exists. It must never serialize form PII (income, employment, answers)
 * into RSC props — those fields are portal-token gated, matching the
 * portal APIs. A matching `?token=` restores the payload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import React, { type ReactElement } from 'react';

(globalThis as { React?: typeof React }).React = React;

const {
  getSpaceFromSlugMock,
  statusClientMock,
  notFoundMock,
  db,
  PII_APPLICATION_DATA,
  FORM_SNAPSHOT,
  CONTACT,
} = vi.hoisted(() => {
  const PII_APPLICATION_DATA = {
    annualIncome: 185_000,
    employer: 'Northside Credit Union',
    ssnLast4: '7788',
  };
  const FORM_SNAPSHOT = {
    fields: [{ id: 'annualIncome', label: 'Annual income' }],
  };
  const CONTACT = {
    id: 'contact-1',
    name: 'Jane Applicant',
    email: 'jane@example.com',
    applicationStatus: 'received',
    applicationStatusNote: 'We have your application.',
    applicationData: PII_APPLICATION_DATA,
    formConfigSnapshot: FORM_SNAPSHOT,
    applicationRef: 'REF-1',
    statusPortalToken: 'portal-token-abc',
    scoringStatus: 'scored',
    createdAt: '2026-08-01T12:00:00.000Z',
  };
  return {
    getSpaceFromSlugMock: vi.fn(),
    statusClientMock: vi.fn(() => null),
    notFoundMock: vi.fn(() => {
      throw new Error('notFound');
    }),
    db: { contact: CONTACT as typeof CONTACT | null },
    PII_APPLICATION_DATA,
    FORM_SNAPSHOT,
    CONTACT,
  };
});

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}));

vi.mock('@/lib/space', () => ({
  getSpaceFromSlug: getSpaceFromSlugMock,
}));

vi.mock('@/lib/api-auth', () => ({
  hasCurrentSubscription: vi.fn(() => true),
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(async (value: string) => value),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/components/intake-chat/intake-chat-shell', () => ({
  IntakeChatShell: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/app/apply/[slug]/status/application-status-client', () => ({
  ApplicationStatusClient: statusClientMock,
}));

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string) {
    const filters: Array<{ column: string; value: unknown }> = [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = vi.fn(self);
    chain.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      return chain;
    });
    chain.in = vi.fn(self);
    chain.order = vi.fn(self);
    chain.update = vi.fn(self);
    chain.maybeSingle = vi.fn(async () => {
      if (table === 'SpaceSetting') {
        return { data: { businessName: 'Acme Realty', logoUrl: null, realtorPhotoUrl: null } };
      }
      if (table === 'User') {
        return { data: { name: 'Pat Realtor', avatar: 'https://cdn.example/avatar.jpg' } };
      }
      if (table === 'ProfilePage') {
        return {
          data: {
            coverPhotoUrl: 'https://cdn.example/cover.jpg',
            profilePhotoUrl: 'https://cdn.example/photo.jpg',
          },
        };
      }
      if (table === 'Contact') {
        if (!db.contact) return { data: null };
        const tokenFilter = filters.find((filter) => filter.column === 'statusPortalToken');
        if (tokenFilter && tokenFilter.value !== db.contact.statusPortalToken) {
          return { data: null };
        }
        return { data: db.contact };
      }
      return { data: null };
    });
    chain.then = (
      resolve: (value: { data: unknown }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => {
      const data =
        table === 'ApplicationStatusUpdate'
          ? [{ id: 'hist-1', fromStatus: null, toStatus: 'received', note: null, createdAt: CONTACT.createdAt }]
          : table === 'ApplicationMessage'
            ? [{ id: 'msg-1', senderType: 'realtor', content: 'Welcome', readAt: CONTACT.createdAt, createdAt: CONTACT.createdAt }]
            : table === 'Tour'
              ? []
              : [];
      return Promise.resolve({ data }).then(resolve, reject);
    };
    return chain;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => makeChain(table)),
    },
  };
});

import ApplicationStatusPage from '@/app/apply/[slug]/status/page';

async function renderPage(search: { ref?: string; token?: string }) {
  return (await ApplicationStatusPage({
    params: Promise.resolve({ slug: 'acme' }),
    searchParams: Promise.resolve(search),
  })) as ReactElement;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findStatusClient(node: any): any {
  if (!node || typeof node !== 'object') return null;
  if (node.type === statusClientMock) return node;
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findStatusClient(child);
      if (found) return found;
    }
    return null;
  }
  return findStatusClient(children);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.contact = { ...CONTACT, applicationData: { ...PII_APPLICATION_DATA }, formConfigSnapshot: FORM_SNAPSHOT };
  getSpaceFromSlugMock.mockResolvedValue({
    id: 'space-1',
    slug: 'acme',
    name: 'Acme Realty',
    ownerId: 'owner-1',
    stripeSubscriptionStatus: 'active',
    stripePeriodEnd: '2099-01-01T00:00:00.000Z',
  });
});

describe('apply status page — ref-only PII gate', () => {
  it('strips form PII from RSC props when the visitor only has the confirmation ref', async () => {
    const el = await renderPage({ ref: 'REF-1' });
    const view = findStatusClient(el);
    expect(view).toBeTruthy();

    const props = view.props as {
      contact: { applicationData: unknown; formConfigSnapshot: unknown; name: string };
      portalMode: boolean;
      token: string | null;
      statusHistory: unknown[];
      messages: unknown[];
    };
    expect(props.contact.name).toBe('Jane Applicant');
    expect(props.contact.applicationData).toBeNull();
    expect(props.contact.formConfigSnapshot).toBeNull();
    expect(props.portalMode).toBe(false);
    expect(props.token).toBeNull();
    expect(props.statusHistory).toEqual([]);
    expect(props.messages).toEqual([]);
  });

  it('restores form PII and portal fetches when the status portal token matches', async () => {
    const el = await renderPage({ ref: 'REF-1', token: 'portal-token-abc' });
    const view = findStatusClient(el);
    expect(view).toBeTruthy();

    const props = view.props as {
      contact: { applicationData: unknown; formConfigSnapshot: unknown };
      portalMode: boolean;
      token: string | null;
      statusHistory: unknown[];
      messages: unknown[];
    };
    expect(props.portalMode).toBe(true);
    expect(props.token).toBe('portal-token-abc');
    expect(props.contact.applicationData).toEqual(PII_APPLICATION_DATA);
    expect(props.contact.formConfigSnapshot).toEqual(FORM_SNAPSHOT);
    expect(props.statusHistory).toHaveLength(1);
    expect(props.messages).toHaveLength(1);
  });

  it('does not render the status client with PII when the portal token is wrong', async () => {
    const el = await renderPage({ ref: 'REF-1', token: 'wrong-token' });
    expect(findStatusClient(el)).toBeNull();
    expect(statusClientMock).not.toHaveBeenCalled();

    const html = JSON.stringify(el);
    expect(html).not.toContain('Northside Credit Union');
    expect(html).not.toContain('ssnLast4');
    expect(html).not.toContain('7788');
    expect(html).toContain('"hasToken":true');
    expect(html).toContain('Acme Realty');
  });
});
