/**
 * Studio is paused unless NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED === 'true'.
 * The realtor and agent-internal generate/edit routes must 404 before auth,
 * spend checks, or fal.ai so a forgotten pause gate cannot burn credits.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireAuth, runStudioGeneration, runStudioEdit } = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => ({ userId: 'u_1' })),
  runStudioGeneration: vi.fn(async () => ({ ok: true })),
  runStudioEdit: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth,
  requireActiveSubscription: vi.fn(async () => null),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => ({ id: 'sp_1', slug: 'jane' })),
}));

vi.mock('@/lib/studio/generate', () => ({
  runStudioGeneration,
  StudioGenerationError: class StudioGenerationError extends Error {},
}));

vi.mock('@/lib/studio/edit', () => ({
  runStudioEdit,
}));

vi.mock('@/lib/studio/fal', () => ({
  falConfigured: vi.fn(() => true),
}));

vi.mock('@/lib/studio/spend', () => ({
  checkStudioSpendBudget: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { POST as realtorGenerate } from '@/app/api/studio/generate/route';
import { POST as realtorEdit } from '@/app/api/studio/edit/route';
import { POST as internalGenerate } from '@/app/api/internal/studio/generate/route';

function post(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'a listing photo' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  delete process.env.NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED;
  delete process.env.AGENT_INTERNAL_SECRET;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Studio paused API gates', () => {
  it('404s realtor generate before auth or fal', async () => {
    const res = await realtorGenerate(post('/api/studio/generate'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Studio is paused.' });
    expect(requireAuth).not.toHaveBeenCalled();
    expect(runStudioGeneration).not.toHaveBeenCalled();
  });

  it('404s realtor edit before auth or fal', async () => {
    const res = await realtorEdit(post('/api/studio/edit'));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Studio is paused.' });
    expect(requireAuth).not.toHaveBeenCalled();
    expect(runStudioEdit).not.toHaveBeenCalled();
  });

  it('404s the agent-internal generate path even with a bearer secret', async () => {
    vi.stubEnv('AGENT_INTERNAL_SECRET', 'internal-secret');
    const req = new NextRequest('http://localhost/api/internal/studio/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer internal-secret',
      },
      body: JSON.stringify({ spaceId: 'sp_1', prompt: 'a listing photo' }),
    });

    const res = await internalGenerate(req);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Studio is paused.' });
    expect(runStudioGeneration).not.toHaveBeenCalled();
  });
});
