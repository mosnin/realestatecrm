/**
 * Post-login /auth/redirect. A failed User lookup must NOT be treated as
 * "no account" (that sent existing realtors into /setup). A missing
 * accountType column must still land them on their workspace.
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { React?: typeof React }).React = React;

const { authMock, currentUserMock, fromMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ userId: 'clerk_1' })),
  currentUserMock: vi.fn(async () => null),
  fromMock: vi.fn(),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));

import AuthRedirectPage from '@/app/auth/redirect/page';

function thenable(result: { data: unknown; error: unknown }) {
  const row = {
    select: vi.fn(() => row),
    eq: vi.fn(() => row),
    in: vi.fn(() => row),
    gt: vi.fn(() => row),
    order: vi.fn(() => row),
    limit: vi.fn(() => row),
    maybeSingle: vi.fn(async () => result),
  };
  return row;
}

async function renderRedirect(intent?: string) {
  return AuthRedirectPage({
    searchParams: Promise.resolve(intent ? { intent } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: 'clerk_1' });
});

describe('AuthRedirectPage', () => {
  it('sends an existing realtor to their workspace', async () => {
    fromMock
      .mockReturnValueOnce(thenable({ data: { id: 'user-1', accountType: 'realtor' }, error: null }))
      .mockReturnValueOnce(thenable({ data: null, error: null })) // no broker membership
      .mockReturnValueOnce(thenable({ data: { slug: 'acme' }, error: null }));

    await expect(renderRedirect('realtor')).rejects.toThrow('redirect:/s/acme');
  });

  it('still routes to the workspace when accountType is missing from the schema', async () => {
    fromMock
      .mockReturnValueOnce(
        thenable({
          data: null,
          error: { code: 'PGRST204', message: "Could not find the 'accountType' column of 'User'" },
        }),
      )
      .mockReturnValueOnce(thenable({ data: { id: 'user-1' }, error: null }))
      .mockReturnValueOnce(thenable({ data: null, error: null }))
      .mockReturnValueOnce(thenable({ data: { slug: 'acme' }, error: null }));

    await expect(renderRedirect()).rejects.toThrow('redirect:/s/acme');
    expect(redirectMock).not.toHaveBeenCalledWith('/setup');
  });

  it('does not send an existing user to setup when the User lookup errors', async () => {
    fromMock
      .mockReturnValueOnce(thenable({ data: null, error: { code: '57014', message: 'statement timeout' } }))
      .mockReturnValueOnce(thenable({ data: null, error: { code: '57014', message: 'statement timeout' } }));

    const ui = (await renderRedirect()) as React.ReactElement;
    const html = JSON.stringify(ui);
    expect(html).toContain('couldn&apos;t load your workspace');
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
