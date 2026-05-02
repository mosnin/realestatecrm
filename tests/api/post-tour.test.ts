/**
 * Route-level test for POST /api/chippi/post-tour.
 *
 * Covers: auth-fail (401), no-space (403), empty transcript (400),
 * happy-path returns proposals (OpenAI mocked).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

const { proposeActionsMock, attachHumanSummariesMock } = vi.hoisted(() => ({
  proposeActionsMock: vi.fn(),
  attachHumanSummariesMock: vi.fn(),
}));
vi.mock('@/lib/chippi/post-tour', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/chippi/post-tour')>('@/lib/chippi/post-tour');
  return {
    ...actual,
    proposeActions: proposeActionsMock,
    attachHumanSummaries: attachHumanSummariesMock,
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

vi.mock('@/lib/ai-tools/openai-client', () => ({
  getOpenAIClient: () => ({ client: {} }),
  MissingOpenAIKeyError: class MissingOpenAIKeyError extends Error {},
}));

vi.mock('@/lib/ai-tools/registry', () => ({
  listTools: () => [],
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/chippi/post-tour/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/chippi/post-tour', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chippi/post-tour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireAuth.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    const res = await POST(makeReq({ transcript: 'hi' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user has no space', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    mockGetSpaceForUser.mockResolvedValue(null);
    const res = await POST(makeReq({ transcript: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when transcript is empty', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    mockGetSpaceForUser.mockResolvedValue({
      id: 'space_1',
      slug: 's',
      name: 'Test',
      ownerId: 'owner_1',
    } as never);
    const res = await POST(makeReq({ transcript: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns proposals on happy path', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    mockGetSpaceForUser.mockResolvedValue({
      id: 'space_1',
      slug: 's',
      name: 'Test',
      ownerId: 'owner_1',
    } as never);
    proposeActionsMock.mockResolvedValue([
      { tool: 'log_call', args: { personId: 'p1', summary: 'Tour' }, summary: 'Log call', mutates: true },
      { tool: 'set_followup', args: { personId: 'p1', when: '2026-05-08' }, summary: 'Set follow-up', mutates: true },
    ]);
    attachHumanSummariesMock.mockImplementation(async (_supabase, _spaceId, proposals) =>
      proposals.map((p: { args: Record<string, unknown> }) => ({ ...p, humanSummary: 'Sam Chen — done' })),
    );

    const res = await POST(makeReq({ transcript: 'Sam loved it. Follow up Friday.' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { proposals: Array<{ humanSummary?: string }> };
    expect(json.proposals).toHaveLength(2);
    expect(json.proposals[0].humanSummary).toBe('Sam Chen — done');
    expect(proposeActionsMock).toHaveBeenCalledOnce();
    expect(attachHumanSummariesMock).toHaveBeenCalledOnce();
    expect(attachHumanSummariesMock).toHaveBeenCalledWith(expect.anything(), 'space_1', expect.any(Array));
  });

  it('forwards a contextHint with personId/dealId to the orchestrator', async () => {
    // Surfaces the URL-driven pre-fill — when the realtor opens the recorder
    // from a contact or deal page, the page wires `?personId=` / `?dealId=`
    // into the recorder, and the recorder ships the hint in the request
    // body. The orchestrator uses it to bias proposals toward the right
    // subject; if this regresses the recorder silently stops pre-biasing.
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    mockGetSpaceForUser.mockResolvedValue({
      id: 'space_1',
      slug: 's',
      name: 'Test',
      ownerId: 'owner_1',
    } as never);
    proposeActionsMock.mockResolvedValue([]);
    attachHumanSummariesMock.mockImplementation(async (_s, _id, proposals) => proposals);

    await POST(
      makeReq({
        transcript: 'Quick recap.',
        contextHint: { personId: 'person-abc', dealId: 'deal-xyz' },
      }),
    );

    expect(proposeActionsMock).toHaveBeenCalledOnce();
    const arg = proposeActionsMock.mock.calls[0][1] as {
      contextHint?: { personId?: string; dealId?: string };
    };
    expect(arg.contextHint).toEqual({ personId: 'person-abc', dealId: 'deal-xyz' });
  });

  it('drops non-string contextHint fields defensively', async () => {
    // Anything other than a string id is dropped — keeps the orchestrator's
    // resolver from receiving structured junk through the wire.
    mockRequireAuth.mockResolvedValue({ userId: 'user_1' });
    mockGetSpaceForUser.mockResolvedValue({
      id: 'space_1',
      slug: 's',
      name: 'Test',
      ownerId: 'owner_1',
    } as never);
    proposeActionsMock.mockResolvedValue([]);
    attachHumanSummariesMock.mockImplementation(async (_s, _id, proposals) => proposals);

    await POST(
      makeReq({
        transcript: 'hi',
        contextHint: { personId: 42, dealId: { evil: true } },
      }),
    );

    const arg = proposeActionsMock.mock.calls[0][1] as {
      contextHint?: { personId?: string; dealId?: string };
    };
    expect(arg.contextHint).toEqual({});
  });
});
