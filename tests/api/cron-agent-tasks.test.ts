/**
 * Route-level tests for `GET /api/cron/agent-tasks` — the AgentTask queue
 * consumer. Before this cron existed, enqueueTask'd rows sat 'queued' forever
 * (no consumer). The tick must: pick up queued rows EXCEPT the 'sla'
 * follow-up reminders (those stay open on purpose), gate on subscription +
 * kill switch, claim each row queued→running via the compare-and-swap state
 * machine, dispatch through the same headless run path routines use, and
 * record completed/failed honestly.
 *
 * Mock strategy mirrors tests/api/cron-routines.test.ts (queue-driven
 * supabase); the state machine, dispatcher, and kill switch are mocked so we
 * assert on the exact orchestration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Supabase mock ───────────────────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'update']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

// ── Collaborator mocks ──────────────────────────────────────────────────────
const { fireRoutineRunMock, transitionTaskMock, isSpaceDisabledMock } = vi.hoisted(() => ({
  fireRoutineRunMock: vi.fn(),
  transitionTaskMock: vi.fn(),
  isSpaceDisabledMock: vi.fn(),
}));
vi.mock('@/lib/routines', () => ({ fireRoutineRun: fireRoutineRunMock }));
vi.mock('@/lib/agent/task-state-machine', () => ({ transitionTask: transitionTaskMock }));
vi.mock('@/lib/agent/kill-switch', () => ({ isSpaceDisabled: isSpaceDisabledMock }));

import { GET } from '@/app/api/cron/agent-tasks/route';

// ── Helpers ─────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/agent-tasks', { method: 'GET', headers });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

interface TaskRow {
  id: string;
  spaceId: string;
  title: string;
  description: string | null;
  goalDescription: string | null;
}

function task(id: string, spaceId: string, over: Partial<TaskRow> = {}): TaskRow {
  return {
    id,
    spaceId,
    title: `Task ${id}`,
    description: null,
    goalDescription: `Goal for ${id}`,
    ...over,
  };
}

/** Queue the tick's reads: tasks, spaces, then users (only when owners exist). */
function queueTick(opts: {
  tasks: TaskRow[];
  spaces?: Array<{
    id: string;
    ownerId?: string | null;
    stripeSubscriptionStatus?: string;
    stripePeriodEnd?: string | null;
  }>;
  users?: Array<{ id: string; clerkId: string | null }>;
}) {
  const spaceIds = [...new Set(opts.tasks.map((t) => t.spaceId))];
  const spaces =
    opts.spaces ??
    spaceIds.map((id) => ({
      id,
      ownerId: null,
      stripeSubscriptionStatus: 'active',
      stripePeriodEnd: '2099-01-01T00:00:00.000Z',
    }));
  const queue: Terminal[] = [{ data: opts.tasks, error: null }];
  if (opts.tasks.length > 0) queue.push({ data: spaces, error: null });
  const hasOwners = spaces.some((s) => s.ownerId);
  if (hasOwners) queue.push({ data: opts.users ?? [], error: null });
  supabaseQueue = queue;
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;
  saved.CRON_SECRET = process.env.CRON_SECRET;
  saved.DISABLED = process.env.CRON_AGENT_TASKS_DISABLED;
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_AGENT_TASKS_DISABLED;
  transitionTaskMock.mockResolvedValue({ ok: true });
  fireRoutineRunMock.mockResolvedValue('ok');
  isSpaceDisabledMock.mockResolvedValue(false);
});

afterEach(() => {
  if (saved.CRON_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved.CRON_SECRET;
  if (saved.DISABLED === undefined) delete process.env.CRON_AGENT_TASKS_DISABLED;
  else process.env.CRON_AGENT_TASKS_DISABLED = saved.DISABLED;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/cron/agent-tasks', () => {
  it('rejects missing/wrong bearer with 401, nothing runs', async () => {
    expect((await invoke(undefined)).status).toBe(401);
    expect((await invoke('Bearer nope')).status).toBe(401);
    expect(supabaseCalls).toHaveLength(0);
    expect(fireRoutineRunMock).not.toHaveBeenCalled();
  });

  it('missing CRON_SECRET → 500 fail-closed', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
  });

  it('CRON_AGENT_TASKS_DISABLED short-circuits', async () => {
    process.env.CRON_AGENT_TASKS_DISABLED = '1';
    const res = await invoke('Bearer test-secret');
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('no queued tasks → zeroed summary, only the AgentTask read', async () => {
    queueTick({ tasks: [] });
    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ scanned: 0, ran: 0, completed: 0, failed: 0, skipped: 0 });
    expect(supabaseCalls.map((c) => c.table)).toEqual(['AgentTask']);
    expect(fireRoutineRunMock).not.toHaveBeenCalled();
  });

  it("the queue read takes only status='queued' rows and EXCLUDES 'sla' follow-ups", async () => {
    queueTick({ tasks: [] });
    await invoke('Bearer test-secret');
    const chain = supabaseCalls[0].chain;
    expect(chain).toContainEqual(['eq', ['status', 'queued']]);
    expect(chain).toContainEqual(['neq', ['triggerSource', 'sla']]);
  });

  it('runs a queued task: claims queued→running, fires the headless run, marks completed', async () => {
    queueTick({
      tasks: [task('t1', 's1')],
      spaces: [
        {
          id: 's1',
          ownerId: 'owner-1',
          stripeSubscriptionStatus: 'active',
          stripePeriodEnd: '2099-01-01T00:00:00.000Z',
        },
      ],
      users: [{ id: 'owner-1', clerkId: 'user_clerk_1' }],
    });

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ scanned: 1, ran: 1, completed: 1, failed: 0, skipped: 0 });

    // Claim, then terminal transition — in that order, correct metadata keys.
    expect(transitionTaskMock).toHaveBeenCalledTimes(2);
    const [claimArgs, doneArgs] = transitionTaskMock.mock.calls;
    expect(claimArgs[0]).toBe('t1');
    expect(claimArgs[1]).toBe('running');
    expect(typeof (claimArgs[2] as { startedAt: string }).startedAt).toBe('string');
    expect(doneArgs[0]).toBe('t1');
    expect(doneArgs[1]).toBe('completed');
    expect(typeof (doneArgs[2] as { completedAt: string }).completedAt).toBe('string');

    // Dispatched through the routines headless path with the goal as the
    // instruction, the owner's Clerk id, and the agent_task ledger trigger.
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
    expect(fireRoutineRunMock).toHaveBeenCalledWith(
      's1',
      'Goal for t1',
      'user_clerk_1',
      undefined,
      'agent_task',
    );
  });

  it('falls back description → title when goalDescription is empty', async () => {
    queueTick({
      tasks: [task('t1', 's1', { goalDescription: '  ', description: null, title: 'Just the title' })],
    });
    await invoke('Bearer test-secret');
    expect(fireRoutineRunMock).toHaveBeenCalledWith(
      's1',
      'Just the title',
      undefined,
      undefined,
      'agent_task',
    );
  });

  it('a failed dispatch marks the task failed (retryable), not completed', async () => {
    fireRoutineRunMock.mockResolvedValueOnce('error');
    queueTick({ tasks: [task('t1', 's1')] });

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ ran: 1, completed: 0, failed: 1 });
    const terminal = transitionTaskMock.mock.calls[1];
    expect(terminal[1]).toBe('failed');
  });

  it('a THROWING dispatch marks the task failed and does not break the tick', async () => {
    fireRoutineRunMock.mockRejectedValueOnce(new Error('modal down'));
    queueTick({ tasks: [task('t1', 's1'), task('t2', 's1')] });

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ ran: 2, completed: 1, failed: 1 });
  });

  it('a lapsed-paid space is skipped: task stays queued, no claim, no dispatch', async () => {
    queueTick({
      tasks: [task('t_blocked', 's_lapsed'), task('t_live', 's_live')],
      spaces: [
        { id: 's_lapsed', ownerId: null, stripeSubscriptionStatus: 'canceled', stripePeriodEnd: null },
        { id: 's_live', ownerId: null, stripeSubscriptionStatus: 'active', stripePeriodEnd: '2099-01-01T00:00:00.000Z' },
      ],
    });

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ scanned: 2, ran: 1, completed: 1, skipped: 1 });
    // Only the live space's task was touched.
    expect(transitionTaskMock.mock.calls.map((c) => c[0])).toEqual(['t_live', 't_live']);
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
    expect(fireRoutineRunMock.mock.calls[0][0]).toBe('s_live');
  });

  it('a kill-switched space is skipped (fail closed when the check itself throws)', async () => {
    isSpaceDisabledMock.mockImplementation(async (id: string) => id === 's_off');
    queueTick({ tasks: [task('t_off', 's_off'), task('t_on', 's_on')] });

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ ran: 1, skipped: 1 });
    expect(fireRoutineRunMock.mock.calls[0][0]).toBe('s_on');

    // Check failure → fail closed: the space is skipped too.
    vi.clearAllMocks();
    transitionTaskMock.mockResolvedValue({ ok: true });
    fireRoutineRunMock.mockResolvedValue('ok');
    isSpaceDisabledMock.mockRejectedValue(new Error('DisabledSpace query failed'));
    queueTick({ tasks: [task('t1', 's1')] });
    const body2 = await (await invoke('Bearer test-secret')).json();
    expect(body2).toMatchObject({ ran: 0, skipped: 1 });
    expect(fireRoutineRunMock).not.toHaveBeenCalled();
  });

  it('a lost claim (concurrent tick or racing cancel) skips the task without dispatching', async () => {
    transitionTaskMock.mockResolvedValueOnce({ ok: false, error: 'invalid_transition' });
    queueTick({ tasks: [task('t1', 's1')] });

    const body = await (await invoke('Bearer test-secret')).json();
    expect(body).toMatchObject({ ran: 0, completed: 0, failed: 0 });
    expect(fireRoutineRunMock).not.toHaveBeenCalled();
    // Only the failed claim — no terminal transition.
    expect(transitionTaskMock).toHaveBeenCalledTimes(1);
  });
});
