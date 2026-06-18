/**
 * Regression test for the HTTP-verb contract of
 * PATCH | POST /api/agent/tasks/[taskId]/status.
 *
 * The task-card controls (components/agent/task-controls.tsx) POST to this
 * route to Pause/Resume/Cancel/Retry a task. The route originally exported
 * ONLY `PATCH`, so every one of those clicks returned 405 and the task status
 * silently never changed. The fix exports the same handler under BOTH verbs.
 *
 * These tests lock that contract in: both `POST` and `PATCH` must exist and
 * perform an identical, successful transition for a valid request.
 *
 * Mock strategy mirrors app/api/agent/tasks/__tests__/tasks.test.ts:
 *   - @/lib/api-auth   → requireAuth() returns { userId }
 *   - @/lib/space      → getSpaceForUser() returns a fake space
 *   - @/lib/rate-limit → checkRateLimit() allows
 *   - @/lib/agent/task-state-machine → real pure fns (canTransition,
 *       VALID_TRANSITIONS); only transitionTask is stubbed to succeed
 *   - @/lib/supabase   → chainable thenable mock; queue feeds the task fetch
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// ── Supabase chainable mock ───────────────────────────────────────────────────

type TerminalResult = { data?: unknown; error?: unknown };
let supabaseQueue: TerminalResult[] = [];

function makeChain(): Record<string, unknown> {
  const terminal: TerminalResult = supabaseQueue.shift() ?? { data: [], error: null };

  const chain: Record<string, unknown> = {};
  const passthroughs = ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update'];
  for (const method of passthroughs) {
    chain[method] = vi.fn((..._args: unknown[]) => chain);
  }
  chain.single = vi.fn(() => Promise.resolve(terminal));
  chain.maybeSingle = vi.fn(() => Promise.resolve(terminal));
  chain.then = (
    resolve: (v: TerminalResult) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(terminal).then(resolve, reject);

  return chain;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((_table: string) => makeChain()),
  },
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/space', () => ({
  getSpaceForUser: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/agent/task-state-machine', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agent/task-state-machine')>(
    '@/lib/agent/task-state-machine',
  );
  return {
    ...actual,
    transitionTask: vi.fn(async () => ({ ok: true })),
  };
});

// ── Import after mocks are registered ─────────────────────────────────────────

import { PATCH, POST } from '@/app/api/agent/tasks/[taskId]/status/route';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { transitionTask } from '@/lib/agent/task-state-machine';
import type { Space } from '@/lib/types';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetSpaceForUser = vi.mocked(getSpaceForUser);
const mockTransitionTask = vi.mocked(transitionTask);

const SPACE_ID = 'space-test-001';
const USER_ID = 'user_clerk_abc';
const TASK_ID = 'task-001';

const fakeSpace = {
  id: SPACE_ID,
  slug: 'test-space',
  name: 'Test Space',
  ownerId: USER_ID,
} as unknown as Space;

function makeRequest(method: 'PATCH' | 'POST', body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/agent/tasks/${TASK_ID}/status`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ taskId: TASK_ID });

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  mockRequireAuth.mockResolvedValue({ userId: USER_ID } as never);
  mockGetSpaceForUser.mockResolvedValue(fakeSpace);
});

describe('POST | PATCH /api/agent/tasks/[taskId]/status — verb contract', () => {
  it('exports both POST and PATCH handlers', () => {
    // The bug: only PATCH was exported, so the POST-ing UI got 405.
    expect(typeof POST).toBe('function');
    expect(typeof PATCH).toBe('function');
  });

  it('POST performs a valid running→paused transition (no 405)', async () => {
    // The route fetches the task to read its current status before transitioning.
    supabaseQueue.push({ data: { id: TASK_ID, status: 'running' }, error: null });

    const res = await POST(makeRequest('POST', { status: 'paused' }), { params });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, task: { id: TASK_ID, status: 'paused' } });
    expect(mockTransitionTask).toHaveBeenCalledWith(TASK_ID, 'paused', expect.any(Object));
  });

  it('PATCH still works identically (running→paused)', async () => {
    supabaseQueue.push({ data: { id: TASK_ID, status: 'running' }, error: null });

    const res = await PATCH(makeRequest('PATCH', { status: 'paused' }), { params });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, task: { id: TASK_ID, status: 'paused' } });
  });

  it('POST rejects an invalid transition with 409 (contract unchanged)', async () => {
    // completed is terminal — cannot move to paused.
    supabaseQueue.push({ data: { id: TASK_ID, status: 'completed' }, error: null });

    const res = await POST(makeRequest('POST', { status: 'paused' }), { params });

    expect(res.status).toBe(409);
    expect(mockTransitionTask).not.toHaveBeenCalled();
  });
});
