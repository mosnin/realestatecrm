import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/api-auth', () => ({ requireAuth: vi.fn(async () => ({ userId: 'u_1' })) }));
vi.mock('@/lib/space', () => ({ getSpaceForUser: vi.fn(async () => ({ id: 'space_1' })) }));

describe('GET /api/agent/trigger/healthcheck', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      AGENT_TRIGGER_OPS_ENABLED: 'true',
      AGENT_TRIGGER_OPS_SECRET: 'shh',
      KV_REST_API_URL: 'https://kv.example.com',
      KV_REST_API_TOKEN: 'kv-token',
    };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns 503 when health is warn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: [
        JSON.stringify({ status: 'deduped' }),
        JSON.stringify({ status: 'deduped' }),
        JSON.stringify({ status: 'deduped' }),
      ],
    }), { status: 200 })) as unknown as typeof fetch);

    const { GET } = await import('@/app/api/agent/trigger/healthcheck/route');
    const req = new Request('http://localhost/api/agent/trigger/healthcheck', {
      headers: { 'x-agent-ops-secret': 'shh' },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.health).toBe('warn');
  });
});
