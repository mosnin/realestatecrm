import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSpaceOwner: vi.fn(),
  readJsonWithLimit: vi.fn(),
  continuation: vi.fn(),
  ownsSpace: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: mocks.requireSpaceOwner }));
vi.mock('@/lib/validation', () => ({ BODY_LIMITS: { smallJson: 1 }, readJsonWithLimit: mocks.readJsonWithLimit }));
vi.mock('@/lib/workspace-runs/conversation-continuation', () => ({ continueWorkspaceForConversation: mocks.continuation }));
vi.mock('@/lib/realtime/voice-feature', () => ({ realtimeVoiceGatewayReady: () => true }));
vi.mock('@/lib/ai-tools/chippi-voice', () => ({ fallbackHeuristic: () => 'Voice work' }));
vi.mock('@/lib/realtime/voice-delegation', () => ({
  stableVoiceId: () => '00000000-0000-5000-8000-000000000000',
  resolveVoiceWorkExecutionMode: (value: unknown) => value === 'autonomous' ? 'autonomous' : 'review',
}));
vi.mock('@/lib/work-sessions/start', () => ({ startWorkSession: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/space', () => ({ userOwnsSpace: mocks.ownsSpace }));

import { POST } from '@/app/api/ai/realtime-delegate/route';

describe('Realtime Workspace continuation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSpaceOwner.mockResolvedValue({ userId: 'user-1', space: { id: 'space-1', slug: 'test', name: 'Test', ownerId: 'user-1' } });
    mocks.ownsSpace.mockResolvedValue(true);
    mocks.readJsonWithLimit.mockResolvedValue({ ok: true, data: {
      action: 'continue_workspace_run', slug: 'test', conversationId: 'conversation-1', callId: 'call-1', instruction: 'Prepare the seller review',
    } });
    const query = {
      select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: { id: 'conversation-1', spaceId: 'space-1', title: 'Seller review' }, error: null });
    mocks.from.mockReturnValue(query);
  });

  it('executes the continuation branch and returns the stable database conflict', async () => {
    mocks.continuation.mockResolvedValue({
      ok: false,
      code: 'conflict',
      error: 'This continuation key was already used for a different request.',
    });

    const response = await POST(new Request('http://localhost/api/ai/realtime-delegate', { method: 'POST' }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'This continuation key was already used for a different request.' });
    expect(mocks.continuation).toHaveBeenCalledWith({
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      instruction: 'Prepare the seller review',
      idempotencySeed: 'voice:call-1',
    });
  });

  it.each([
    { id: 'foreign', spaceId: 'space-2', title: 'Other space' },
    { id: 'reserved', spaceId: 'space-1', title: '[BROKER_CHIPPI] Private broker work' },
  ])('denies a cross-tenant or reserved conversation before continuation: $id', async (conversation) => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({ data: conversation, error: null });
    mocks.from.mockReturnValue(query);
    const response = await POST(new Request('http://localhost/api/ai/realtime-delegate', { method: 'POST' }));
    expect(response.status).toBe(404);
    expect(mocks.continuation).not.toHaveBeenCalled();
  });

  it('returns an accepted reused task and persists two tenant-scoped transcript messages', async () => {
    mocks.continuation.mockResolvedValue({ ok: true, runId: 'run-1', taskId: 'task-1', status: 'queued', reused: true });
    const conversation = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() };
    conversation.select.mockReturnValue(conversation); conversation.eq.mockReturnValue(conversation);
    conversation.maybeSingle.mockResolvedValue({ data: { id: 'conversation-1', spaceId: 'space-1', title: 'Seller review' }, error: null });
    conversation.update.mockReturnValue(conversation);
    const message = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    mocks.from.mockImplementation((table: string) => table === 'Message' ? message : conversation);
    const first = await POST(new Request('http://localhost/api/ai/realtime-delegate', { method: 'POST' }));
    const second = await POST(new Request('http://localhost/api/ai/realtime-delegate', { method: 'POST' }));
    expect(first.status).toBe(200); expect(second.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ ok: true, reused: true, conversationRecorded: true });
    expect(message.upsert).toHaveBeenCalledTimes(4);
    for (const [row, options] of message.upsert.mock.calls) {
      expect(row.spaceId).toBe('space-1'); expect(row.conversationId).toBe('conversation-1');
      expect(options).toMatchObject({ onConflict: 'id', ignoreDuplicates: true });
    }
  });

  it('keeps the accepted response truthful when transcript persistence fails', async () => {
    mocks.continuation.mockResolvedValue({ ok: true, runId: 'run-1', taskId: 'task-1', status: 'queued', reused: false });
    const conversation = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() };
    conversation.select.mockReturnValue(conversation); conversation.eq.mockReturnValue(conversation);
    conversation.maybeSingle.mockResolvedValue({ data: { id: 'conversation-1', spaceId: 'space-1', title: 'Seller review' }, error: null });
    conversation.update.mockReturnValue(conversation);
    mocks.from.mockImplementation((table: string) => table === 'Message'
      ? { upsert: vi.fn().mockResolvedValue({ error: new Error('write failed') }) }
      : conversation);
    const response = await POST(new Request('http://localhost/api/ai/realtime-delegate', { method: 'POST' }));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, conversationRecorded: false, workspaceRunId: 'run-1' });
  });
});
