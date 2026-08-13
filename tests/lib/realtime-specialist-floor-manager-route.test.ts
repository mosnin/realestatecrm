import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  ownsSpace: vi.fn(),
  flag: false,
}));
vi.mock('@/lib/api-auth', () => ({ requireSpaceOwner: mocks.auth }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('@/lib/realtime/voice-feature', () => ({ realtimeVoiceGatewayReady: () => true }));
vi.mock('@/lib/realtime/floor-manager-flag', () => ({ isRealtimeVoiceFloorManagerEnabled: () => mocks.flag }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/space', () => ({ userOwnsSpace: mocks.ownsSpace }));
vi.mock('@/lib/work-sessions/start', () => ({ startWorkSession: vi.fn() }));
vi.mock('@/lib/workspace-runs/conversation-continuation', () => ({ continueWorkspaceForConversation: vi.fn() }));

import { POST } from '@/app/api/ai/realtime-delegate/route';

let conversation: Record<string, unknown> | null;
let run: Record<string, unknown> | null;
let receipt: Record<string, unknown> | null;
let members: Array<Record<string, unknown>>;
let errorTable: string | null;
let resultAvailable: boolean;

function installDb() {
  mocks.from.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    let headCount = false;
    chain.select = vi.fn((_columns?: string, options?: { head?: boolean }) => {
      headCount = options?.head === true;
      return chain;
    });
    chain.eq = vi.fn(() => chain);
    chain.not = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({
      data: table === 'Conversation'
        ? conversation
        : table === 'SwarmRun'
          ? run
          : table === 'RealtimeSwarmControlReceipt'
            ? receipt
            : null,
      error: errorTable === table ? { message: 'database unavailable' } : null,
    }));
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: table === 'SwarmMember' ? members : null,
      error: errorTable === table ? { message: 'database unavailable' } : null,
      count: table === 'SwarmRun' && headCount && resultAvailable ? 1 : 0,
    }).then(resolve);
    return chain;
  });
}

function request(action: 'get_specialist_status' | 'cancel_specialist_task', extra: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/ai/realtime-delegate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action,
      slug: 'test',
      conversationId: 'conversation-1',
      callId: 'call-1',
      ...extra,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.flag = true;
  mocks.auth.mockResolvedValue({ userId: 'user-1', space: { id: 'space-1', slug: 'test', name: 'Test' } });
  mocks.ownsSpace.mockResolvedValue(true);
  mocks.rate.mockResolvedValue({ allowed: true });
  conversation = { id: 'conversation-1', spaceId: 'space-1', title: 'Seller review' };
  run = { id: 'run-1', goal: 'Prepare a pricing recommendation', status: 'running', result: null, errorMessage: null };
  receipt = null;
  members = [{ status: 'running' }, { status: 'completed' }, { status: 'queued' }];
  errorTable = null;
  resultAvailable = false;
  mocks.rpc.mockResolvedValue({
    data: [{ run_id: 'run-1', outcome: 'cancelled', status: 'cancelled', reused: false }],
    error: null,
  });
  installDb();
});

describe('Realtime specialist floor-manager route', () => {
  it('is undiscoverable while the independent flag is off', async () => {
    mocks.flag = false;
    const response = await POST(request('get_specialist_status'));
    expect(response.status).toBe(404);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects model/browser supplied ids because controls accept an exact empty tool payload', async () => {
    const response = await POST(request('cancel_specialist_task', { runId: 'model-run' }));
    expect(response.status).toBe(400);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires the exact authenticated tenant conversation', async () => {
    conversation = null;
    const response = await POST(request('get_specialist_status'));
    expect(response.status).toBe(404);
    expect(mocks.from).toHaveBeenCalledWith('Conversation');
    expect(mocks.from).not.toHaveBeenCalledWith('SwarmRun');
  });

  it('returns bounded active status and member counts without private fields', async () => {
    const response = await POST(request('get_specialist_status'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      found: true,
      status: 'running',
      active: true,
      terminal: false,
      failed: false,
      resultAvailable: false,
      members: { total: 3, queued: 1, running: 1, completed: 1, failed: 0 },
    });
    expect(Object.keys(body).sort()).toEqual([
      'action', 'active', 'failed', 'found', 'members', 'ok',
      'resultAvailable', 'runId', 'status', 'terminal',
    ].sort());
    expect(JSON.stringify(body)).not.toMatch(/goal|resultSummary|errorSummary|systemPrompt|cost/);
  });

  it.each([
    ['completed', true, false],
    ['failed', false, true],
  ])('returns content-free terminal %s status facts', async (status, hasResult, failed) => {
    run = { ...run, status, result: 'private specialist content', errorMessage: 'private provider error' };
    resultAvailable = hasResult;
    const response = await POST(request('get_specialist_status'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      found: true,
      status,
      active: false,
      terminal: true,
      failed,
      resultAvailable: hasResult,
    });
    expect(JSON.stringify(body)).not.toContain('private specialist content');
    expect(JSON.stringify(body)).not.toContain('private provider error');
    expect(JSON.stringify(body)).not.toMatch(/goal|resultSummary|errorSummary/);
  });

  it('returns a bounded missing shape when the conversation has no linked run', async () => {
    run = null;
    const response = await POST(request('get_specialist_status'));
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: 'get_specialist_status',
      found: false,
      status: 'none',
      active: false,
      terminal: false,
      failed: false,
      members: { total: 0, queued: 0, running: 0, completed: 0, failed: 0 },
      resultAvailable: false,
    });
  });

  it.each([
    ['cancelled', 'cancelled', false, true],
    ['already_terminal', 'completed', false, true],
    ['no_run', null, false, false],
    ['cancelled', 'cancelled', true, true],
  ])('maps atomic %s cancellation semantics', async (outcome, status, reused, found) => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ run_id: found ? 'run-1' : null, outcome, status, reused }],
      error: null,
    });
    const response = await POST(request('cancel_specialist_task'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      action: 'cancel_specialist_task',
      found,
      runId: found ? 'run-1' : null,
      outcome,
      status: status ?? 'none',
      reused,
    });
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_conversation_swarm_run', {
      p_space_id: 'space-1',
      p_conversation_id: 'conversation-1',
      p_call_id: 'call-1',
    });
  });

  it('rate limits a new control before specialist reads or cancellation', async () => {
    mocks.rate.mockResolvedValueOnce({ allowed: false });
    const response = await POST(request('cancel_specialist_task'));
    expect(response.status).toBe(429);
    expect(mocks.from).not.toHaveBeenCalledWith('SwarmRun');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('lets a provider retry reach its durable receipt after the quota is exhausted', async () => {
    receipt = { id: 'receipt-1' };
    mocks.rate.mockResolvedValue({ allowed: false });
    mocks.rpc.mockResolvedValueOnce({
      data: [{
        run_id: 'run-1',
        outcome: 'cancelled',
        status: 'cancelled',
        reused: true,
      }],
      error: null,
    });
    const response = await POST(request('cancel_specialist_task'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: 'cancelled', reused: true });
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each(['Conversation', 'RealtimeSwarmControlReceipt', 'SwarmRun', 'SwarmMember'])('reports %s read failures honestly', async (table) => {
    errorTable = table;
    const action = table === 'RealtimeSwarmControlReceipt'
      ? 'cancel_specialist_task'
      : 'get_specialist_status';
    const response = await POST(request(action));
    expect(response.status).toBe(500);
  });

  it('reports atomic cancellation failure without pretending the task stopped', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc unavailable' } });
    const response = await POST(request('cancel_specialist_task'));
    expect(response.status).toBe(500);
  });
});
