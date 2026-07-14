/**
 * POST /api/internal/notify — the Python agent runtime's push-notification
 * door. Behavioral tests: auth fail-closed (missing secret 500, bad bearer
 * 401), body validation + length caps, the sendPushToSpace fan-out, the
 * durable in-app record (createAppNotification), the rate limit, and the
 * never-throw contract when push dispatch itself blows up.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { sendPushToSpaceMock, checkRateLimitMock, createAppNotificationMock } = vi.hoisted(() => ({
  sendPushToSpaceMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  createAppNotificationMock: vi.fn(),
}));

vi.mock('@/lib/push', () => ({ sendPushToSpace: sendPushToSpaceMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/notifications', () => ({ createAppNotification: createAppNotificationMock }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST } from '@/app/api/internal/notify/route';

const SECRET = 'agent-secret-test';

function post(body: unknown, auth?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== undefined) headers.Authorization = auth;
  const req = new Request('http://localhost/api/internal/notify', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return POST(req as unknown as Parameters<typeof POST>[0]);
}

const VALID = {
  spaceId: 'space-1',
  title: 'Chippi finished a background task',
  body: 'Research the Henderson listing — completed',
};

let savedSecret: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  savedSecret = process.env.AGENT_INTERNAL_SECRET;
  process.env.AGENT_INTERNAL_SECRET = SECRET;
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  sendPushToSpaceMock.mockResolvedValue(2);
  createAppNotificationMock.mockResolvedValue(true);
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.AGENT_INTERNAL_SECRET;
  else process.env.AGENT_INTERNAL_SECRET = savedSecret;
});

describe('POST /api/internal/notify', () => {
  it('fails closed with 500 when AGENT_INTERNAL_SECRET is not configured', async () => {
    delete process.env.AGENT_INTERNAL_SECRET;
    const res = await post(VALID, `Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header with 401 and never pushes', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(401);
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it('rejects a wrong bearer with 401', async () => {
    const res = await post(VALID, 'Bearer nope');
    expect(res.status).toBe(401);
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it('rejects an unparseable body with 400', async () => {
    const res = await post('not-json{', `Bearer ${SECRET}`);
    expect(res.status).toBe(400);
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it.each([
    ['spaceId', { ...VALID, spaceId: undefined }],
    ['title', { ...VALID, title: '   ' }],
    ['body', { ...VALID, body: 42 }],
  ])('rejects a missing/invalid %s with 400', async (_field, body) => {
    const res = await post(body, `Bearer ${SECRET}`);
    expect(res.status).toBe(400);
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it('pushes to the space and returns { ok: true, sent }', async () => {
    const res = await post({ ...VALID, url: '/tasks' }, `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, sent: 2 });
    expect(sendPushToSpaceMock).toHaveBeenCalledTimes(1);
    expect(sendPushToSpaceMock).toHaveBeenCalledWith('space-1', {
      title: VALID.title,
      body: VALID.body,
      url: '/tasks',
    });
  });

  it('omits url when not provided', async () => {
    await post(VALID, `Bearer ${SECRET}`);
    expect(sendPushToSpaceMock).toHaveBeenCalledWith('space-1', {
      title: VALID.title,
      body: VALID.body,
      url: undefined,
    });
  });

  it('caps title/body/url lengths instead of rejecting', async () => {
    await post(
      {
        spaceId: 'space-1',
        title: 'T'.repeat(1000),
        body: 'B'.repeat(5000),
        url: `/x?${'q'.repeat(5000)}`,
      },
      `Bearer ${SECRET}`,
    );
    const [, payload] = sendPushToSpaceMock.mock.calls[0] as [
      string,
      { title: string; body: string; url?: string },
    ];
    expect(payload.title).toHaveLength(200);
    expect(payload.body).toHaveLength(500);
    expect(payload.url).toHaveLength(500);
  });

  it('returns 429 when the per-space rate limit trips, without pushing', async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false });
    const res = await post(VALID, `Bearer ${SECRET}`);
    expect(res.status).toBe(429);
    expect(sendPushToSpaceMock).not.toHaveBeenCalled();
  });

  it('still returns 200 ok when push dispatch throws (never-throw contract)', async () => {
    sendPushToSpaceMock.mockRejectedValueOnce(new Error('vapid exploded'));
    const res = await post(VALID, `Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, sent: 0 });
  });

  describe('durable in-app record', () => {
    it('writes an agent_run record with the same title/body/url as the push', async () => {
      const res = await post({ ...VALID, url: '/tasks' }, `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(createAppNotificationMock).toHaveBeenCalledTimes(1);
      expect(createAppNotificationMock).toHaveBeenCalledWith({
        spaceId: 'space-1',
        type: 'agent_run',
        title: VALID.title,
        body: VALID.body,
        href: '/tasks',
      });
    });

    it('records href: null when no url is provided', async () => {
      await post(VALID, `Bearer ${SECRET}`);
      expect(createAppNotificationMock).toHaveBeenCalledWith(
        expect.objectContaining({ href: null }),
      );
    });

    it('writes the record with the capped title/body', async () => {
      await post(
        { spaceId: 'space-1', title: 'T'.repeat(1000), body: 'B'.repeat(5000) },
        `Bearer ${SECRET}`,
      );
      const [record] = createAppNotificationMock.mock.calls[0] as [
        { title: string; body: string },
      ];
      expect(record.title).toHaveLength(200);
      expect(record.body).toHaveLength(500);
    });

    it('writes no record on auth failure, bad body, or rate limit', async () => {
      await post(VALID); // no auth
      await post(VALID, 'Bearer nope'); // wrong bearer
      await post({ ...VALID, spaceId: undefined }, `Bearer ${SECRET}`); // invalid body
      checkRateLimitMock.mockResolvedValue({ allowed: false });
      const res = await post(VALID, `Bearer ${SECRET}`); // rate-limited
      expect(res.status).toBe(429);
      expect(createAppNotificationMock).not.toHaveBeenCalled();
    });

    it('still pushes and returns 200 when the record write throws (belt)', async () => {
      createAppNotificationMock.mockRejectedValueOnce(new Error('db down'));
      const res = await post(VALID, `Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true, sent: 2 });
      expect(sendPushToSpaceMock).toHaveBeenCalledTimes(1);
    });
  });
});
