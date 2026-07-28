import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requireSpaceOwnerMock, rateLimitMock, startWorkSessionMock } = vi.hoisted(() => ({
  requireSpaceOwnerMock: vi.fn(),
  rateLimitMock: vi.fn(async () => ({ allowed: true })),
  startWorkSessionMock: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: requireSpaceOwnerMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('@/lib/work-sessions/start', () => ({ startWorkSession: startWorkSessionMock }));

let existingSession: Record<string, unknown> | null = null;
let conversation: Record<string, unknown> | null = null;
let activeCount = 0;
const writes: Array<{ table: string; kind: string; value: Record<string, unknown> }> = [];

vi.mock('@/lib/supabase', () => {
  function chainFor(table: string) {
    let head = false;
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((_fields?: unknown, options?: { head?: boolean }) => {
      head = options?.head === true;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data:
        table === 'WorkSession'
          ? existingSession
          : table === 'Conversation'
            ? conversation
            : null,
      error: null,
    }));
    chain.insert = vi.fn((value: Record<string, unknown>) => {
      writes.push({ table, kind: 'insert', value });
      return Promise.resolve({ error: null });
    });
    chain.upsert = vi.fn((value: Record<string, unknown>) => {
      writes.push({ table, kind: 'upsert', value });
      return Promise.resolve({ error: null });
    });
    chain.update = vi.fn((value: Record<string, unknown>) => {
      writes.push({ table, kind: 'update', value });
      return chain;
    });
    chain.then = (
      resolve: (value: { data?: unknown; error: null; count?: number }) => unknown,
      reject?: (error: unknown) => unknown,
    ) =>
      Promise.resolve(head ? { count: activeCount, error: null } : { data: null, error: null }).then(
        resolve,
        reject,
      );
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => chainFor(table)) } };
});

import { POST } from '@/app/api/ai/realtime-delegate/route';

const ORIGINAL_ENV = { ...process.env };
const goal = 'Prepare a complete Henderson listing appointment brief.';

function request(overrides: Record<string, unknown> = {}) {
  return new Request('https://example.com/api/ai/realtime-delegate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slug: 'pw-properties',
      conversationId: 'conversation-1',
      callId: 'call-1',
      goal,
      autonomy: 'plan_first',
      allowQuestions: true,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  existingSession = null;
  activeCount = 0;
  conversation = {
    id: 'conversation-1',
    spaceId: 'space-1',
    title: 'Listing appointment',
  };
  process.env.REALTIME_VOICE_GATEWAY_ENABLED = '1';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.INNGEST_EVENT_KEY = 'test-key';
  requireSpaceOwnerMock.mockResolvedValue({
    userId: 'clerk-1',
    space: { id: 'space-1', slug: 'pw-properties', name: 'P&W Properties' },
  });
  startWorkSessionMock.mockResolvedValue({
    created: true,
    session: {
      id: 'session-1',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal,
      autonomy: 'plan_first',
      allowQuestions: true,
      status: 'planning',
      plan: [],
      findings: [],
    },
  });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('POST /api/ai/realtime-delegate', () => {
  it('fails closed when durable voice readiness is missing', async () => {
    delete process.env.INNGEST_EVENT_KEY;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(requireSpaceOwnerMock).not.toHaveBeenCalled();
    expect(startWorkSessionMock).not.toHaveBeenCalled();
  });

  it('rejects a conversation outside the authorized realtor space', async () => {
    conversation = null;
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(startWorkSessionMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('starts one tenant-scoped session and persists the voice turn plus live card', async () => {
    const response = await POST(request());
    const data = (await response.json()) as {
      ok?: boolean;
      conversationId?: string;
      session?: { id?: string };
    };
    expect(response.status).toBe(201);
    expect(data.ok).toBe(true);
    expect(data.conversationId).toBe('conversation-1');
    expect(startWorkSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        conversationId: 'conversation-1',
        goal,
        autonomy: 'plan_first',
      }),
    );
    const messageWrites = writes.filter((write) => write.table === 'Message' && write.kind === 'upsert');
    expect(messageWrites).toHaveLength(2);
    for (const write of messageWrites) {
      expect(write.value.spaceId).toBe('space-1');
      expect(write.value.conversationId).toBe('conversation-1');
    }
    expect(
      JSON.stringify(messageWrites.find((write) => write.value.role === 'assistant')?.value),
    ).toContain('"type":"work_session"');
  });

  it('returns the accepted result on a provider retry without spending another quota slot', async () => {
    existingSession = {
      id: 'existing',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal,
      autonomy: 'plan_first',
      status: 'planning',
    };
    startWorkSessionMock.mockResolvedValue({
      created: false,
      session: existingSession,
    });

    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(startWorkSessionMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a call-id replay with a different goal', async () => {
    existingSession = {
      id: 'existing',
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal: 'A different goal',
      status: 'planning',
    };
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(startWorkSessionMock).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });
});
