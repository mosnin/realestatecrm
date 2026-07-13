import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { listIssues } from '@/lib/sentry-api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Sentry issue availability', () => {
  it('returns null on an authorization failure instead of a false empty list', async () => {
    process.env.SENTRY_AUTH_TOKEN = 'test-token';
    process.env.SENTRY_ORG = 'test-org';
    process.env.SENTRY_PROJECT = 'test-project';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));

    await expect(listIssues()).resolves.toBeNull();
  });
});
