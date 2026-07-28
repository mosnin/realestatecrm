import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
const { spaceOwnerMock } = vi.hoisted(() => ({
  spaceOwnerMock: vi.fn(async () => ({ data: { id: 'space-1', ownerId: 'user-1' }, error: null })),
}));

vi.mock('@/lib/supabase', () => {
  function chain() {
    const value: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'limit']) value[method] = vi.fn(() => value);
    value.maybeSingle = spaceOwnerMock;
    return value;
  }
  return { supabase: { from: vi.fn(() => chain()) } };
});
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 })),
}));
vi.mock('@/lib/messaging', () => ({
  ensureDmChannel: vi.fn(),
  postMessage: vi.fn(),
  rosterForBrokerage: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { signRunPolicy } from '@/lib/agent/run-policy';
import { POST } from '@/app/api/internal/messages/send/route';

const POLICY_SECRET = 'test-run-policy-secret-with-at-least-32-bytes';

function request(policy?: string) {
  const headers: Record<string, string> = {
    Authorization: 'Bearer internal-test',
    'Content-Type': 'application/json',
  };
  if (policy) headers['x-chippy-run-policy'] = policy;
  return new NextRequest('https://example.invalid/api/internal/messages/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      spaceId: 'space-1',
      recipient: 'Orlando',
      message: 'A proposed update',
    }),
  });
}

function grant(overrides: Record<string, unknown> = {}) {
  return signRunPolicy({
    runId: '6c60314e-1f04-4aa3-bf68-e6253fdfa25f',
    spaceId: 'space-1',
    subject: 'user-1',
    mode: 'unattended',
    capabilities: ['team_message:send'],
    depth: 0,
    nonce: 'nonce-with-enough-entropy-123',
    ...overrides,
  });
}

beforeEach(() => {
  vi.stubEnv('AGENT_INTERNAL_SECRET', 'internal-test');
  vi.stubEnv('AGENT_RUN_POLICY_SECRET', POLICY_SECRET);
  vi.stubEnv('AGENT_RUN_POLICY_MODE', 'shadow');
});

afterEach(() => vi.unstubAllEnvs());

describe('internal team-message run-policy boundary', () => {
  it('denies unattended delivery even with the send capability', async () => {
    const res = await POST(request(grant()));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'RUN_POLICY_DENIED' });
  });

  it('requires explicit proposal approval for voice-controlled delivery', async () => {
    const unapproved = await POST(request(grant({ mode: 'voice_control' })));
    expect(unapproved.status).toBe(403);

    const wrongScope = await POST(
      request(
        grant({
          mode: 'voice_control',
          spaceId: 'another-space',
          capabilities: ['team_message:send', 'proposal:decide'],
        }),
      ),
    );
    expect(wrongScope.status).toBe(403);
  });

  it('denies a grant issued for someone other than the resolved space owner', async () => {
    const res = await POST(
      request(
        grant({ mode: 'interactive', subject: 'user-2' }),
      ),
    );
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ code: 'RUN_POLICY_DENIED' });
  });

  it('rejects malformed signed headers in shadow mode and unsigned callers in enforce mode', async () => {
    const malformed = await POST(request('not-a-valid-grant'));
    expect(malformed.status).toBe(403);

    vi.stubEnv('AGENT_RUN_POLICY_MODE', 'enforce');
    const unsigned = await POST(request());
    expect(unsigned.status).toBe(403);
  });
});
