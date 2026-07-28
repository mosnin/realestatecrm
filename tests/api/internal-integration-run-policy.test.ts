import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { executeMock, ownsMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
  ownsMock: vi.fn(async () => true),
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: vi.fn(() => true),
  executeToolForEntity: executeMock,
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 })),
}));
vi.mock('@/lib/space', () => ({ userOwnsSpace: ownsMock }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { signRunPolicy } from '@/lib/agent/run-policy';
import { POST } from '@/app/api/internal/integrations/execute/route';

const POLICY_SECRET = 'test-run-policy-secret-with-at-least-32-bytes';

function request(slug: string, policy?: string) {
  const headers: Record<string, string> = {
    Authorization: 'Bearer internal-test',
    'Content-Type': 'application/json',
  };
  if (policy) headers['x-chippy-run-policy'] = policy;
  return new NextRequest('https://example.invalid/api/internal/integrations/execute', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      spaceId: 'space-1',
      userId: 'user-1',
      slug,
      arguments: {},
    }),
  });
}

function grant(overrides: Record<string, unknown> = {}) {
  return signRunPolicy({
    runId: '6c60314e-1f04-4aa3-bf68-e6253fdfa25f',
    spaceId: 'space-1',
    subject: 'user-1',
    mode: 'unattended',
    capabilities: ['integration:read'],
    depth: 0,
    nonce: 'nonce-with-enough-entropy-123',
    ...overrides,
  });
}

beforeEach(() => {
  vi.stubEnv('AGENT_INTERNAL_SECRET', 'internal-test');
  vi.stubEnv('AGENT_RUN_POLICY_SECRET', POLICY_SECRET);
  vi.stubEnv('AGENT_RUN_POLICY_MODE', 'shadow');
  executeMock.mockReset().mockResolvedValue({ successful: true, data: { ok: true } });
  ownsMock.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe('internal integration run-policy boundary', () => {
  it('allows an explicitly granted read action', async () => {
    const res = await POST(request('GMAIL_FETCH_EMAILS', grant()));
    expect(res.status).toBe(200);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it('denies an unattended write even if the token contains write capability', async () => {
    const res = await POST(
      request(
        'GMAIL_SEND_EMAIL',
        grant({ capabilities: ['integration:read', 'integration:write'] }),
      ),
    );
    expect(res.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('denies a malformed signed header even during shadow rollout', async () => {
    const res = await POST(request('GMAIL_FETCH_EMAILS', 'not-a-valid-grant'));
    expect(res.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('preserves unsigned legacy callers only in shadow mode', async () => {
    const shadow = await POST(request('GMAIL_FETCH_EMAILS'));
    expect(shadow.status).toBe(200);
    vi.stubEnv('AGENT_RUN_POLICY_MODE', 'enforce');
    executeMock.mockClear();
    const enforced = await POST(request('GMAIL_FETCH_EMAILS'));
    expect(enforced.status).toBe(403);
    expect(executeMock).not.toHaveBeenCalled();
  });
});
