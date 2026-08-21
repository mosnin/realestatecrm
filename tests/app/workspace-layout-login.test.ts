/**
 * Workspace layout after login. A recoverable user/space miss must render
 * the "couldn't load your workspace" screen (not a generic crash, not /setup).
 * A healthy lookup must continue past the gate.
 */

import React, { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { React?: typeof React }).React = React;

const {
  authMock,
  loadDashboardUserMock,
  getSpaceFromSlugMock,
  redirectMock,
  notFoundMock,
  isAccountCompedMock,
  subscriptionState,
} = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ userId: 'clerk_1' })),
  loadDashboardUserMock: vi.fn(),
  getSpaceFromSlugMock: vi.fn(),
  redirectMock: vi.fn((href: string) => {
    const err = new Error(`redirect:${href}`) as Error & { digest?: string };
    err.digest = 'NEXT_REDIRECT';
    throw err;
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('notFound');
  }),
  isAccountCompedMock: vi.fn(async () => true),
  subscriptionState: {
    data: {
      stripeSubscriptionStatus: 'active' as string,
      stripePeriodEnd: '2099-01-01T00:00:00.000Z' as string | null,
      stripeSubscriptionId: 'sub' as string | null,
      trialUsedAt: null as string | null,
    },
    error: null as { message: string } | null,
  },
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: authMock }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => '' })),
}));
vi.mock('@/lib/space', () => ({
  loadDashboardUser: loadDashboardUserMock,
  getSpaceFromSlug: getSpaceFromSlugMock,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: subscriptionState.data,
            error: subscriptionState.error,
          })),
          is: vi.fn(() => ({
            contains: vi.fn(async () => ({ count: 0, error: null })),
            not: vi.fn(() => ({
              lte: vi.fn(async () => ({ count: 0, error: null })),
            })),
          })),
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: subscriptionState.data,
              error: subscriptionState.error,
            })),
          })),
          in: vi.fn(async () => ({ count: 0, error: null })),
        })),
      })),
    })),
  },
}));
vi.mock('@/lib/billing/comp', () => ({ isAccountComped: isAccountCompedMock }));
vi.mock('@/lib/onboarding', () => ({ ensureOnboardingBackfill: vi.fn(async () => false) }));
vi.mock('@/lib/permissions', () => ({ getBrokerContext: vi.fn() }));
vi.mock('@/lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-auth')>();
  return {
    ...actual,
    canAccessWorkspace: actual.canAccessWorkspace,
    hasCurrentSubscription: actual.hasCurrentSubscription,
  };
});
vi.mock('@/lib/greetings', () => ({ pickGreeting: () => 'Welcome back.' }));
vi.mock('@/lib/realtime/voice-feature', () => ({ realtimeVoiceGatewayReady: () => false }));
vi.mock('@/components/dashboard/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/dashboard/sidebar-collapse', () => ({
  SidebarCollapseProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/dashboard/mobile-nav', () => ({ MobileNav: () => null }));
vi.mock('@/components/dashboard/header', () => ({ Header: () => null }));
vi.mock('@/components/dashboard/live-notifications', () => ({ LiveNotifications: () => null }));
vi.mock('@/components/platform-banner', () => ({ PlatformBanner: () => null }));
vi.mock('@/components/command-palette/command-palette', () => ({ CommandPalette: () => null }));
vi.mock('@/components/chippi/chippi-bar', () => ({ ChippiBar: () => null }));
vi.mock('@/components/island/chippi-island', () => ({ ChippiIsland: () => null }));
vi.mock('@/components/chippi/embed-detector', () => ({ EmbedDetector: () => null }));
vi.mock('@/components/dashboard/layout-shell', () => ({
  LayoutShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/dashboard/chippi-splash', () => ({ ChippiSplash: () => null }));
vi.mock('@/components/chippi/persistent-chippi-voice', () => ({ PersistentChippiVoice: () => null }));
vi.mock('@/components/dashboard/account-switch', () => ({ AccountSwitchSwipe: () => null }));
vi.mock('@/components/affiliate/referral-tracker', () => ({ ReferralTracker: () => null }));
vi.mock('@/components/affiliate/fpr-script', () => ({ FprScript: () => null }));

import DashboardLayout from '@/app/s/[slug]/layout';

async function renderLayout() {
  return DashboardLayout({
    children: React.createElement('div', { 'data-ok': '1' }),
    params: Promise.resolve({ slug: 'acme' }),
  });
}

function treeHas(node: unknown, needle: string): boolean {
  return JSON.stringify(node).includes(needle);
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  isAccountCompedMock.mockResolvedValue(true);
  subscriptionState.data = {
    stripeSubscriptionStatus: 'active',
    stripePeriodEnd: '2099-01-01T00:00:00.000Z',
    stripeSubscriptionId: 'sub',
    trialUsedAt: null,
  };
  subscriptionState.error = null;
});

describe('DashboardLayout login gate', () => {
  it('renders the workspace error when the user lookup throws', async () => {
    loadDashboardUserMock.mockRejectedValue(new Error('db down'));
    const ui = (await renderLayout()) as ReactElement;
    expect(treeHas(ui, "couldn't load your workspace")).toBe(true);
    expect(treeHas(ui, '/s/acme')).toBe(true);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('renders the workspace error when the space lookup throws', async () => {
    loadDashboardUserMock.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      onboard: true,
      isPlatformAdmin: false,
      space: { id: 'space-1' },
    });
    getSpaceFromSlugMock.mockRejectedValue(new Error('space query failed'));
    const ui = (await renderLayout()) as ReactElement;
    expect(treeHas(ui, "couldn't load your workspace")).toBe(true);
  });

  it('sends a signed-in user with no row to setup, not the error screen', async () => {
    loadDashboardUserMock.mockResolvedValue(null);
    await expect(renderLayout()).rejects.toThrow('redirect:/setup');
  });

  it('renders children when the user owns the space', async () => {
    loadDashboardUserMock.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      onboard: true,
      isPlatformAdmin: true,
      space: { id: 'space-1' },
    });
    getSpaceFromSlugMock.mockResolvedValue({
      id: 'space-1',
      slug: 'acme',
      name: 'Acme',
      ownerId: 'user-1',
    });
    const ui = (await renderLayout()) as ReactElement;
    expect(treeHas(ui, "couldn't load your workspace")).toBe(false);
    expect(treeHas(ui, '"data-ok":"1"')).toBe(true);
  });

  it('lets a never-subscribed Free space into Today (CRM is not paywalled)', async () => {
    isAccountCompedMock.mockResolvedValue(false);
    subscriptionState.data = {
      stripeSubscriptionStatus: 'inactive',
      stripePeriodEnd: null,
      stripeSubscriptionId: null,
      trialUsedAt: null,
    };
    loadDashboardUserMock.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      onboard: true,
      isPlatformAdmin: false,
      space: { id: 'space-1' },
    });
    getSpaceFromSlugMock.mockResolvedValue({
      id: 'space-1',
      slug: 'acme',
      name: 'Acme',
      ownerId: 'user-1',
    });
    const ui = (await renderLayout()) as ReactElement;
    expect(treeHas(ui, '"data-ok":"1"')).toBe(true);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('sends a lapsed paid relationship to billing-required', async () => {
    isAccountCompedMock.mockResolvedValue(false);
    subscriptionState.data = {
      stripeSubscriptionStatus: 'canceled',
      stripePeriodEnd: '2026-01-01T00:00:00.000Z',
      stripeSubscriptionId: 'sub_old',
      trialUsedAt: '2026-01-01T00:00:00.000Z',
    };
    loadDashboardUserMock.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      onboard: true,
      isPlatformAdmin: false,
      space: { id: 'space-1' },
    });
    getSpaceFromSlugMock.mockResolvedValue({
      id: 'space-1',
      slug: 'acme',
      name: 'Acme',
      ownerId: 'user-1',
    });
    await expect(renderLayout()).rejects.toThrow('redirect:/billing-required?slug=acme&reason=canceled');
  });
});
