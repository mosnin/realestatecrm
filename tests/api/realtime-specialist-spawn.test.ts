import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  assertSpaceEnabled: vi.fn(),
  createAndEnqueueSwarmRun: vi.fn(),
  ownsSpace: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: mocks.auth }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/agent/kill-switch', () => ({ assertSpaceEnabled: mocks.assertSpaceEnabled }));
vi.mock('@/lib/swarm-launch', () => ({
  createAndEnqueueSwarmRun: mocks.createAndEnqueueSwarmRun,
}));
vi.mock('@/lib/space', () => ({ userOwnsSpace: mocks.ownsSpace }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/work-sessions/start', () => ({ startWorkSession: vi.fn() }));
vi.mock('@/lib/workspace-runs/conversation-continuation', () => ({
  continueWorkspaceForConversation: vi.fn(),
}));
vi.mock('@/lib/realtime/floor-manager-flag', () => ({
  isRealtimeVoiceFloorManagerEnabled: () => false,
}));

import { POST } from '@/app/api/ai/realtime-delegate/route';
import { stableVoiceId } from '@/lib/realtime/voice-delegation';

let conversation: Record<string, unknown> | null;
let existingRun: Record<string, unknown> | null;
const writes: Array<{ table: string; kind: string; value: Record<string, unknown> }> = [];

function installDb() {
  mocks.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data: table === 'Conversation' ? conversation : table === 'SwarmRun' ? existingRun : null,
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
      resolve: (value: { data: null; error: null; count: number }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null, count: 0 }).then(resolve, reject);
    return chain;
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return new Request('https://example.test/api/ai/realtime-delegate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'spawn_specialist_team',
      slug: 'test',
      conversationId: 'conversation-1',
      callId: 'call-1',
      goal: 'Analyze the full seller pipeline and return the three highest-leverage fixes.',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  writes.length = 0;
  process.env.REALTIME_VOICE_GATEWAY_ENABLED = '1';
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.WORKER_URL = 'https://worker.example.workers.dev';
  process.env.WORKER_SECRET = 'worker-secret';
  conversation = {
    id: 'conversation-1',
    spaceId: 'space-1',
    title: 'Seller pipeline',
    mode: 'work',
    executionMode: 'review',
  };
  existingRun = null;
  mocks.auth.mockResolvedValue({
    userId: 'user-1',
    space: { id: 'space-1', slug: 'test', name: 'Test' },
  });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.ownsSpace.mockResolvedValue(true);
  mocks.assertSpaceEnabled.mockResolvedValue(undefined);
  mocks.createAndEnqueueSwarmRun.mockResolvedValue({
    state: 'queued',
    runId: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
    launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
    spaceId: 'space-1',
    reused: false,
  });
  installDb();
});

describe('Realtime voice specialist spawn', () => {
  it('accepts only a goal and rejects model-supplied authority fields', async () => {
    const response = await POST(request({ executionMode: 'autonomous' }));

    expect(response.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });

  it('requires the authenticated conversation to already be Work', async () => {
    conversation = { ...conversation, mode: 'chat', executionMode: 'autonomous' };

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });

  it('rejects broker-admin access to a managed member space at the personal-owner boundary', async () => {
    mocks.ownsSpace.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it('uses server-derived identity and persisted Review policy, then persists a live specialist card', async () => {
    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      ok: true,
      accepted: true,
      conversationId: 'conversation-1',
      conversationCreated: false,
      executionMode: 'review',
      status: 'queued',
      delivery: 'queued',
      reused: false,
    });
    expect(mocks.createAndEnqueueSwarmRun).toHaveBeenCalledWith({
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal: 'Analyze the full seller pipeline and return the three highest-leverage fixes.',
      customAgentIds: [],
      idempotencyIdentity: {
        runId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        launchToken: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    });
    expect(JSON.stringify(mocks.createAndEnqueueSwarmRun.mock.calls[0]?.[0])).not.toContain(
      'executionMode',
    );
    expect(
      JSON.stringify(writes.find((write) => write.table === 'Message' && write.value.role === 'assistant')),
    ).toContain('subagent_task');
  });

  it('returns an accepted deterministic retry before quota without launching again', async () => {
    const goal = 'Analyze the full seller pipeline and return the three highest-leverage fixes.';
    existingRun = {
      id: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal,
      customAgentIds: [],
      launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
      status: 'running',
      modalAcceptedAt: '2026-08-13T12:00:00.000Z',
    };
    mocks.rate.mockResolvedValue({ allowed: false });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      delivery: 'already_accepted',
      status: 'running',
      reused: true,
      executionMode: 'review',
    });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });

  it('reports an already-completed retry without claiming a new launch', async () => {
    const goal = 'Analyze the full seller pipeline and return the three highest-leverage fixes.';
    existingRun = {
      id: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal,
      customAgentIds: [],
      launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
      status: 'completed',
      modalAcceptedAt: '2026-08-13T12:00:00.000Z',
    };

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      accepted: true,
      requestSaved: true,
      newlyQueued: false,
      delivery: 'already_completed',
      status: 'completed',
      reused: true,
    });
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
    const assistantWrite = writes.find(
      (write) => write.table === 'Message' && write.value.role === 'assistant',
    );
    expect(assistantWrite?.value.content).toContain('already completed');
    expect(assistantWrite?.value.content).toContain('did not start another team');
  });

  it('reports delivery-unknown as saved but not accepted by a worker', async () => {
    mocks.createAndEnqueueSwarmRun.mockResolvedValue({
      state: 'delivery_unknown',
      runId: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
      launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
      spaceId: 'space-1',
      reused: false,
    });

    const response = await POST(request());
    const data = await response.json();

    expect(response.status).toBe(202);
    expect(data).toMatchObject({
      ok: true,
      accepted: false,
      requestSaved: true,
      recoveryArmed: true,
      newlyQueued: false,
      delivery: 'unconfirmed_recovery_armed',
      status: 'queued',
    });
    const assistantWrite = writes.find(
      (write) => write.table === 'Message' && write.value.role === 'assistant',
    );
    expect(assistantWrite?.value.content).toContain('delivery is not confirmed');
    expect(assistantWrite?.value.content).not.toContain('durably queued');
  });

  it('refuses a deterministic call-id replay with a different payload', async () => {
    existingRun = {
      id: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal: 'A different background goal',
      customAgentIds: [],
      launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
      status: 'queued',
      modalAcceptedAt: null,
    };

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });

  it.each(['failed', 'cancelled'])('rejects a deterministic replay of a %s run', async (status) => {
    const goal = 'Analyze the full seller pipeline and return the three highest-leverage fixes.';
    existingRun = {
      id: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
      spaceId: 'space-1',
      conversationId: 'conversation-1',
      goal,
      customAgentIds: [],
      launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
      status,
      modalAcceptedAt: null,
    };

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining(status),
    });
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });

  it.each(['failed', 'cancelled'])(
    'rejects a %s race returned by the durable launch claim',
    async (status) => {
      mocks.createAndEnqueueSwarmRun.mockResolvedValue({
        state: 'already_exists',
        runId: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-run'),
        launchToken: stableVoiceId('space-1', 'conversation-1', 'call-1', 'specialist-launch'),
        spaceId: 'space-1',
        status,
        reused: true,
      });

      const response = await POST(request());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining(status),
      });
      expect(writes.filter((write) => write.table === 'Message')).toHaveLength(0);
    },
  );

  it('creates an unattached voice conversation as immutable Work and returns its binding', async () => {
    const response = await POST(request({ conversationId: null }));
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({
      ok: true,
      accepted: true,
      conversationCreated: true,
      executionMode: 'review',
    });
    const conversationInsert = writes.find(
      (write) => write.table === 'Conversation' && write.kind === 'insert',
    );
    expect(conversationInsert?.value).toMatchObject({
      mode: 'work',
      executionMode: 'review',
    });
    expect(data.conversationId).toBe(conversationInsert?.value.id);
  });

  it('enforces the voice quota before a new billable launch', async () => {
    mocks.rate.mockResolvedValue({ allowed: false });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.assertSpaceEnabled).not.toHaveBeenCalled();
    expect(mocks.createAndEnqueueSwarmRun).not.toHaveBeenCalled();
  });
});
