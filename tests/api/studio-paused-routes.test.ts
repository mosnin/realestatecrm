/**
 * Studio pause must 404 every realtor and agent-internal Studio route before
 * auth, storage, fal, or spend. Prevents accidental image spend and data
 * exposure while Studio is intentionally off.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const calls = vi.hoisted(() => ({
  requireAuth: vi.fn(async () => ({ userId: 'clerk_1' })),
  getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })),
  falConfigured: vi.fn(() => true),
  runStudioGeneration: vi.fn(),
  runStudioEdit: vi.fn(),
  checkStudioSpendBudget: vi.fn(),
  supabaseFrom: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: (...args: unknown[]) => calls.requireAuth(...args),
  requireActiveSubscription: vi.fn(async () => null),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: (...args: unknown[]) => calls.getSpaceForUser(...args),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => calls.supabaseFrom(...args) },
}));

vi.mock('@/lib/tenant-db', () => ({
  tenantTable: vi.fn(() => {
    throw new Error('tenantTable should not run while Studio is paused');
  }),
}));

vi.mock('@/lib/storage', () => ({
  getSignedDownloadUrl: vi.fn(),
  uploadObject: vi.fn(),
  deleteObject: vi.fn(),
  buildKey: (...parts: string[]) => parts.join('/'),
}));

vi.mock('@/lib/storage/limits', () => ({
  validateUpload: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/studio/fal', () => ({
  falConfigured: (...args: unknown[]) => calls.falConfigured(...args),
}));

vi.mock('@/lib/studio/generate', () => ({
  runStudioGeneration: (...args: unknown[]) => calls.runStudioGeneration(...args),
  StudioGenerationError: class StudioGenerationError extends Error {},
}));

vi.mock('@/lib/studio/edit', () => ({
  runStudioEdit: (...args: unknown[]) => calls.runStudioEdit(...args),
}));

vi.mock('@/lib/studio/spend', () => ({
  checkStudioSpendBudget: (...args: unknown[]) => calls.checkStudioSpendBudget(...args),
}));

vi.mock('@/lib/studio/models', () => ({
  STUDIO_EDIT_TOOLS: [],
}));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: vi.fn(),
}));

vi.mock('@/lib/integrations/catalog', () => ({
  findIntegration: vi.fn(),
}));

vi.mock('@/lib/inngest/client', () => ({
  inngest: { send: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { GET as libraryGET } from '@/app/api/studio/library/route';
import { GET as brandGET, PUT as brandPUT } from '@/app/api/studio/brand/route';
import { GET as scheduleGET, POST as schedulePOST } from '@/app/api/studio/schedule/route';
import { GET as recentJobGET } from '@/app/api/studio/recent-job/route';
import { POST as generatePOST } from '@/app/api/studio/generate/route';
import { POST as editPOST } from '@/app/api/studio/edit/route';
import { POST as internalGeneratePOST } from '@/app/api/internal/studio/generate/route';
import { POST as internalEditPOST } from '@/app/api/internal/studio/edit/route';

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED', 'false');
  vi.stubEnv('AGENT_INTERNAL_SECRET', 'internal-secret');
});

async function expectPaused(res: Response) {
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Studio is paused.' });
  expect(calls.requireAuth).not.toHaveBeenCalled();
  expect(calls.getSpaceForUser).not.toHaveBeenCalled();
  expect(calls.falConfigured).not.toHaveBeenCalled();
  expect(calls.runStudioGeneration).not.toHaveBeenCalled();
  expect(calls.runStudioEdit).not.toHaveBeenCalled();
  expect(calls.checkStudioSpendBudget).not.toHaveBeenCalled();
  expect(calls.supabaseFrom).not.toHaveBeenCalled();
}

describe('Studio API pause gate', () => {
  it('404s GET library before auth or StudioGeneration reads', async () => {
    await expectPaused(await libraryGET(new Request('http://localhost/api/studio/library')));
  });

  it('404s GET brand before auth', async () => {
    await expectPaused(await brandGET());
  });

  it('404s PUT brand before auth or writes', async () => {
    await expectPaused(
      await brandPUT(
        new NextRequest('http://localhost/api/studio/brand', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ colors: ['#111'], voice: 'warm' }),
        }),
      ),
    );
  });

  it('404s GET schedule before auth or integration lookups', async () => {
    await expectPaused(await scheduleGET());
  });

  it('404s POST schedule before auth or upload', async () => {
    await expectPaused(
      await schedulePOST(
        new NextRequest('http://localhost/api/studio/schedule', {
          method: 'POST',
          body: new FormData(),
        }),
      ),
    );
  });

  it('404s GET recent-job before auth', async () => {
    await expectPaused(await recentJobGET(new Request('http://localhost/api/studio/recent-job')));
  });

  it('404s POST generate before auth, fal, or spend', async () => {
    await expectPaused(
      await generatePOST(
        new NextRequest('http://localhost/api/studio/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'listing photo' }),
        }),
      ),
    );
  });

  it('404s POST edit before auth or upload', async () => {
    await expectPaused(
      await editPOST(
        new NextRequest('http://localhost/api/studio/edit', {
          method: 'POST',
          body: new FormData(),
        }),
      ),
    );
  });

  it('404s internal generate even with a valid agent secret', async () => {
    await expectPaused(
      await internalGeneratePOST(
        new NextRequest('http://localhost/api/internal/studio/generate', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer internal-secret',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ spaceId: 'space_1', prompt: 'listing photo' }),
        }),
      ),
    );
  });

  it('404s internal edit even with a valid agent secret', async () => {
    await expectPaused(
      await internalEditPOST(
        new NextRequest('http://localhost/api/internal/studio/edit', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer internal-secret',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ spaceId: 'space_1', fileId: 'file_1', prompt: 'brighter' }),
        }),
      ),
    );
  });
});
