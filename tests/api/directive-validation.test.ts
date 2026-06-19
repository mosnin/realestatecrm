/**
 * Route-level guard test for POST /api/agent/directive.
 *
 * Salvaged from PR #277: this route now runs the shared request-validation
 * layer (lib/validation.ts) at its entry point. These tests pin the contract
 * the guard adds WITHOUT changing behavior for valid input:
 *   - an oversized body is rejected with 413 (caught before business logic),
 *   - malformed / empty JSON yields a calm lowercase 400,
 *   - a valid directive still passes through and persists (200).
 *
 * Mock strategy mirrors the other route tests:
 *   - @/lib/api-auth → requireAuth() returns { userId }
 *   - @/lib/space    → getSpaceForUser() returns a fake space
 *   - @/lib/supabase → chainable mock whose upsert succeeds
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { BODY_LIMITS } from '@/lib/validation';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}));

import { POST } from '@/app/api/agent/directive/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpace = vi.mocked(getSpaceForUser);

function makeReq(raw: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/agent/directive', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  });
}

describe('POST /api/agent/directive — salvaged input-validation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    // Cast — the test only needs the `id` field the route reads.
    mockGetSpace.mockResolvedValue({ id: 'space_1' } as Awaited<ReturnType<typeof getSpaceForUser>>);
  });

  it('rejects an oversized body with 413 (honest Content-Length)', async () => {
    const res = await POST(
      makeReq('{}', { 'content-length': String(BODY_LIMITS.smallJson + 1) }),
    );
    expect(res.status).toBe(413);
  });

  it('rejects an oversized body with 413 even when the header lies', async () => {
    const huge = JSON.stringify({ directive: 'a'.repeat(BODY_LIMITS.smallJson + 100) });
    const res = await POST(makeReq(huge));
    expect(res.status).toBe(413);
  });

  it('rejects malformed JSON with a calm lowercase 400', async () => {
    const res = await POST(makeReq('{not json'));
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { error: string };
    expect(payload.error).toBe('invalid json body');
  });

  it('rejects an empty body with 400', async () => {
    const res = await POST(makeReq('   '));
    expect(res.status).toBe(400);
  });

  it('still accepts a valid directive (guard is additive)', async () => {
    const res = await POST(makeReq(JSON.stringify({ directive: 'follow up with new leads daily' })));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { saved: boolean; directive: string };
    expect(payload.saved).toBe(true);
    expect(payload.directive).toBe('follow up with new leads daily');
  });
});
