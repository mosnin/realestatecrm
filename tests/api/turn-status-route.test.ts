/**
 * GET /api/ai/turn-status — the reopen half of turn survival.
 *
 * Behavioral tests: tenant scoping (a caller can only read presence for a
 * conversation their space owns), the Redis-unavailable degrade
 * (known:false, so clients don't poll a fake signal), and the presence
 * payload passthrough. Data layer mocked; the gate logic is real.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';

const authState: { userId: string | null } = { userId: 'u_1' };
vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(async () =>
    authState.userId
      ? { userId: authState.userId }
      : NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
  ),
}));

const spaceState: { space: { id: string } | null } = { space: { id: 'space_1' } };
vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(async () => spaceState.space),
}));

// The conversation lookup: only conv_mine belongs to space_1.
const maybeSingle = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    })),
  },
}));

vi.mock('@/lib/agent/broker-context', () => ({
  resolveBrokerContext: vi.fn(async () => null),
}));

const presence = vi.fn();
vi.mock('@/lib/chat/turn-presence', () => ({
  getTurnPresence: (...a: unknown[]) => presence(...(a as [])),
}));

import { GET } from '@/app/api/ai/turn-status/route';
import type { NextRequest } from 'next/server';

function req(conversationId?: string) {
  const url = new URL('http://t/api/ai/turn-status');
  if (conversationId) url.searchParams.set('conversationId', conversationId);
  return { nextUrl: url } as unknown as NextRequest;
}

beforeEach(() => {
  authState.userId = 'u_1';
  spaceState.space = { id: 'space_1' };
  maybeSingle.mockReset();
  presence.mockReset();
});

describe('GET /api/ai/turn-status', () => {
  it('returns in-flight presence for an owned conversation', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'conv_mine', title: 'Chat' } });
    presence.mockResolvedValue({ inFlight: true, startedAt: 123 });
    const res = await GET(req('conv_mine'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inFlight: true, startedAt: 123, known: true });
  });

  it('reports known:false when presence is unknowable (no Redis) — clients must not poll', async () => {
    maybeSingle.mockResolvedValue({ data: { id: 'conv_mine', title: 'Chat' } });
    presence.mockResolvedValue(null);
    const res = await GET(req('conv_mine'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inFlight: false, known: false });
  });

  it("404s a conversation outside the caller's space — no cross-tenant presence probing", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const res = await GET(req('conv_other_tenant'));
    expect(res.status).toBe(404);
    expect(presence).not.toHaveBeenCalled();
  });

  it('400s without a conversationId', async () => {
    const res = await GET(req());
    expect(res.status).toBe(400);
  });

  it('propagates auth failures untouched', async () => {
    authState.userId = null;
    const res = await GET(req('conv_mine'));
    expect(res.status).toBe(401);
    expect(presence).not.toHaveBeenCalled();
  });
});
