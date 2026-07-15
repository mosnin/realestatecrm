/**
 * Behavioral tests for POST /api/ai/warmup — the Modal pre-boot ping fired
 * when the chat surface mounts. The contract: signed-in only, fire-and-forget
 * (204 immediately, never awaits Modal), silent no-op without Modal env, and
 * rate-limited so tab-hopping can't hammer boots.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let signedInUser: string | null = 'user_1';
let rateAllowed = true;

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: signedInUser })),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: rateAllowed })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/ai/warmup/route';

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

beforeEach(() => {
  signedInUser = 'user_1';
  rateAllowed = true;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.env.MODAL_CHAT_URL = 'https://modal.test/chat';
  process.env.AGENT_INTERNAL_SECRET = 's3cret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MODAL_CHAT_URL;
  delete process.env.AGENT_INTERNAL_SECRET;
});

describe('POST /api/ai/warmup', () => {
  it('401s an unauthenticated caller and never pings Modal', async () => {
    signedInUser = null;
    const res = await POST();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires a warmup ping to MODAL_CHAT_URL with the secret and returns 204 immediately', async () => {
    const res = await POST();
    expect(res.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://modal.test/chat');
    expect(JSON.parse(init.body as string)).toEqual({ secret: 's3cret', warmup: true });
  });

  it('no-ops with 204 when Modal is not configured', async () => {
    delete process.env.MODAL_CHAT_URL;
    const res = await POST();
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops with 204 when the per-user rate limit is exhausted', async () => {
    rateAllowed = false;
    const res = await POST();
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still 204s when the Modal ping rejects (fire-and-forget)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('boot timeout'));
    const res = await POST();
    expect(res.status).toBe(204);
  });
});
