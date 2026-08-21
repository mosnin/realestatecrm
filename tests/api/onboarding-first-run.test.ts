/**
 * First-run onboarding: skip must not mark the user onboarded without a
 * workspace, and create_space must bootstrap real pipelines (not orphan
 * DealStage rows).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { authMock, ensureDefaultPipelinesMock, userUpdates } = vi.hoisted(() => ({
  authMock: vi.fn(async () => ({ userId: 'clerk_1' })),
  ensureDefaultPipelinesMock: vi.fn(async () => []),
  userUpdates: [] as Record<string, unknown>[],
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: authMock,
  currentUser: vi.fn(async () => ({
    emailAddresses: [{ emailAddress: 'ada@x.com' }],
    fullName: 'Ada',
    firstName: 'Ada',
    imageUrl: null,
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/onboarding', () => ({
  getOnboardingStatus: vi.fn(),
  ensureOnboardingBackfill: vi.fn(async () => false),
}));

vi.mock('@/lib/pipelines', () => ({
  ensureDefaultPipelines: (...args: unknown[]) => ensureDefaultPipelinesMock(...args),
}));

vi.mock('@/lib/billing/grants', () => ({
  grantFreeSignup: vi.fn(async () => undefined),
}));

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/telemetry', () => ({
  emit: vi.fn(),
}));

let spaceByOwner: { slug: string } | null = null;
let slugTaken = false;
let lastSpaceInsert: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.update = vi.fn((values: Record<string, unknown>) => {
        if (table === 'User') userUpdates.push(values);
        return chain;
      });
      chain.insert = vi.fn((values: Record<string, unknown>) => {
        if (table === 'Space') lastSpaceInsert = values;
        return chain;
      });
      chain.upsert = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => {
        if (table === 'User') {
          return {
            data: {
              id: 'user_1',
              clerkId: 'clerk_1',
              email: 'ada@x.com',
              name: 'Ada',
              avatar: 'https://img',
              onboard: false,
              onboardingStartedAt: '2026-01-01T00:00:00.000Z',
            },
            error: null,
          };
        }
        if (table === 'Space') {
          if (spaceByOwner) return { data: spaceByOwner, error: null };
          if (slugTaken) return { data: { id: 'other' }, error: null };
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });
      chain.single = vi.fn(async () => {
        if (table === 'Space' && lastSpaceInsert) {
          return { data: { ...lastSpaceInsert, slug: lastSpaceInsert.slug }, error: null };
        }
        return { data: lastSpaceInsert, error: null };
      });
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve);
      return chain;
    }),
  },
}));

import { POST } from '@/app/api/onboarding/route';

function req(body: unknown) {
  return new NextRequest('http://localhost/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  userUpdates.length = 0;
  spaceByOwner = null;
  slugTaken = false;
  lastSpaceInsert = null;
  authMock.mockResolvedValue({ userId: 'clerk_1' });
  ensureDefaultPipelinesMock.mockResolvedValue([]);
});

describe('POST /api/onboarding skip', () => {
  it('does not mark onboard=true when the user has no workspace', async () => {
    const res = await POST(req({ action: 'skip' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirect).toBe('/setup');
    expect(body.onboard).toBe(false);
    expect(userUpdates.some((u) => u.onboard === true)).toBe(false);
  });
});

describe('POST /api/onboarding create_space', () => {
  it('bootstraps default pipelines for the new space', async () => {
    const res = await POST(
      req({
        action: 'create_space',
        slug: 'ada-realty',
        businessName: 'Ada Realty',
        intakePageTitle: 'Apply',
        intakePageIntro: 'Hello',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.slug).toBe('ada-realty');
    expect(ensureDefaultPipelinesMock).toHaveBeenCalledTimes(1);
    expect(ensureDefaultPipelinesMock.mock.calls[0][0]).toEqual(lastSpaceInsert?.id);
    expect(lastSpaceInsert?.slug).toBe('ada-realty');
  });
});
