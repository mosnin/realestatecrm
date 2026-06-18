/**
 * Ably real-time backend: env-gating for the live activity feed.
 *
 *  1. lib/realtime/ably.ts must cleanly no-op (return, never throw, never
 *     construct an Ably client) when ABLY_API_KEY is missing.
 *  2. GET /api/ably/token must return 503 { error: 'realtime-unavailable' }
 *     when ABLY_API_KEY is missing — the client falls back to its DB feed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Spy on the Ably Rest constructor so we can assert it is NEVER built when the
// key is absent. (Hoisted so the vi.mock factory can reference it.)
const { RestCtor } = vi.hoisted(() => ({ RestCtor: vi.fn() }));
vi.mock('ably', () => ({ Rest: RestCtor }));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// server-only is a no-op import in tests but must be stubbed so the module loads.
vi.mock('server-only', () => ({}));

describe('lib/realtime/ably gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ABLY_API_KEY;
  });

  it('publishSpaceEvent no-ops without throwing and never builds a client when ABLY_API_KEY is unset', async () => {
    const { publishSpaceEvent } = await import('@/lib/realtime/ably');
    await expect(
      publishSpaceEvent('space-1', { eventType: 'GMAIL_NEW_GMAIL_MESSAGE' }),
    ).resolves.toBeUndefined();
    expect(RestCtor).not.toHaveBeenCalled();
  });

  it('createSpaceTokenRequest returns null (signals unavailable) when ABLY_API_KEY is unset', async () => {
    const { createSpaceTokenRequest } = await import('@/lib/realtime/ably');
    await expect(createSpaceTokenRequest('space-1', 'user-1')).resolves.toBeNull();
    expect(RestCtor).not.toHaveBeenCalled();
  });
});

describe('GET /api/ably/token gating', () => {
  // Authed user + resolvable space so the 503 is genuinely about the missing
  // key, not an auth/space short-circuit.
  vi.mock('@/lib/api-auth', () => ({
    requireAuth: vi.fn(async () => ({ userId: 'user-1' })),
  }));
  vi.mock('@/lib/space', () => ({
    getSpaceForUser: vi.fn(async () => ({ id: 'space-1' })),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ABLY_API_KEY;
  });

  it('returns 503 realtime-unavailable when ABLY_API_KEY is unset', async () => {
    const { GET } = await import('@/app/api/ably/token/route');
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'realtime-unavailable' });
  });
});
