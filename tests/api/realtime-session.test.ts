import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { requireSpaceOwnerMock, rateLimitMock, userOwnsSpaceMock } = vi.hoisted(() => ({
  requireSpaceOwnerMock: vi.fn(),
  rateLimitMock: vi.fn(async () => ({ allowed: true })),
  userOwnsSpaceMock: vi.fn(async () => true),
}));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: requireSpaceOwnerMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('@/lib/space', () => ({ userOwnsSpace: userOwnsSpaceMock }));

import { POST } from '@/app/api/ai/realtime-session/route';

const ORIGINAL_ENV = { ...process.env };

function offerRequest() {
  return new Request('https://example.com/api/ai/realtime-session?slug=pw-properties', {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REALTIME_VOICE_GATEWAY_ENABLED = '1';
  process.env.OPENAI_API_KEY = 'server-secret-test-key';
  process.env.INNGEST_EVENT_KEY = 'durable-dispatch-test-key';
  process.env.INNGEST_SIGNING_KEY = 'durable-signing-test-key';
  requireSpaceOwnerMock.mockResolvedValue({
    userId: 'clerk-1',
    space: { id: 'space-1', slug: 'pw-properties', name: 'P&W Properties' },
  });
  userOwnsSpaceMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe('POST /api/ai/realtime-session', () => {
  it('is undiscoverable while the feature flag is off', async () => {
    process.env.REALTIME_VOICE_GATEWAY_ENABLED = '0';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(offerRequest());
    expect(response.status).toBe(404);
    expect(requireSpaceOwnerMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies SDP through the unified server gateway without returning a credential', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      const session = JSON.parse(String(form.get('session'))) as {
        model?: string;
        tools?: Array<{ name?: string }>;
      };
      expect(session.model).toBe('gpt-realtime-2.1');
      expect(session.tools?.map((tool) => tool.name)).toEqual(['start_work_session']);
      expect(form.get('sdp')).toContain('v=0');
      expect((init.headers as Record<string, string>).Authorization).toBe(
        'Bearer server-secret-test-key',
      );
      expect((init.headers as Record<string, string>)['OpenAI-Safety-Identifier']).toMatch(
        /^[0-9a-f]{64}$/,
      );
      return new Response('v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\n', {
        status: 200,
        headers: { Location: '/v1/realtime/calls/call_123' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(offerRequest());
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/sdp');
    expect(response.headers.get('X-Chippi-Realtime-Call-Id')).toBe('call_123');
    expect(body).toContain('v=0');
    expect(body).not.toContain('server-secret-test-key');
    expect(body).not.toContain('client_secret');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls',
      expect.any(Object),
    );
  });

  it('propagates tenant authorization before contacting the provider', async () => {
    requireSpaceOwnerMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(offerRequest());
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects broker-admin access to a managed member space before contacting the provider', async () => {
    userOwnsSpaceMock.mockResolvedValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(offerRequest());

    expect(response.status).toBe(403);
    expect(userOwnsSpaceMock).toHaveBeenCalledWith('space-1', 'clerk-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when personal-space ownership cannot be verified', async () => {
    userOwnsSpaceMock.mockRejectedValue(new Error('database unavailable'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(offerRequest());

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
