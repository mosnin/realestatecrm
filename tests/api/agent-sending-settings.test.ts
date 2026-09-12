import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { upsert, read } = vi.hoisted(() => ({ upsert: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({
  requireAuth: async () => ({ userId: 'clerk-1' }),
}));
vi.mock('@/lib/space', () => ({
  getSpaceForUser: async () => ({ id: 'space-1' }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/tenant-db', () => ({
  tenantTable: () => ({ select: () => ({ maybeSingle: read }), upsert }),
}));
vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
import { GET, PATCH } from '@/app/api/agent/settings/route';
beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue({ data: null, error: null });
  upsert.mockReturnValue({
    select: () => ({
      single: async () => ({
        data: { autonomyLevel: 'autonomous' },
        error: null,
      }),
    }),
  });
});
describe('Saved sending policy', () => {
  it('saves an explicit sequence policy scoped to the caller workspace', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/agent/settings', {
        method: 'PATCH',
        body: JSON.stringify({ autonomyLevel: 'autonomous' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        autonomyLevel: 'autonomous',
      }),
      { onConflict: 'spaceId' },
    );
  });
  it.each([
    { enabled: 'true' },
    { autonomyLevel: ['autonomous'] },
    { dailyTokenBudget: 1.5 },
    { autonomyLevel: 'send_everything' },
  ])('rejects malformed settings %j', async (body) => {
    expect(
      (
        await PATCH(
          new NextRequest('http://localhost/api/agent/settings', {
            method: 'PATCH',
            body: JSON.stringify(body),
          }),
        )
      ).status,
    ).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
  it('distinguishes a missing row from a failed read', async () => {
    expect(
      await (await GET(new NextRequest('http://localhost'))).json(),
    ).toMatchObject({ enabled: false, autonomyLevel: 'draft_required' });
    read.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });
    expect((await GET(new NextRequest('http://localhost'))).status).toBe(503);
  });
});
