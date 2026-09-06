import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { settings, afterTasks, fetchMock, markInFlight, markFailed } =
  vi.hoisted(() => ({
    settings: { enabled: true },
    afterTasks: [] as Array<() => Promise<void>>,
    fetchMock: vi.fn(),
    markInFlight: vi.fn(),
    markFailed: vi.fn(),
  }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => Promise<void>) => {
    afterTasks.push(task);
  },
}));
vi.mock('@/lib/api-auth', () => ({
  requireAuth: async () => ({ userId: 'clerk-1' }),
}));
vi.mock('@/lib/space', () => ({
  getSpaceForUser: async () => ({ id: 'space-1' }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true }),
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/tenant-db', () => ({
  tenantTable: () => ({
    select: () => ({
      maybeSingle: async () => ({ data: settings, error: null }),
    }),
  }),
}));
vi.mock('@/lib/agent/run-ledger', () => ({
  recordDispatch: async () => 'run-1',
  markInFlight,
  markFailed,
}));
import { POST } from '@/app/api/agent/run-now/route';
beforeEach(() => {
  vi.clearAllMocks();
  afterTasks.length = 0;
  settings.enabled = true;
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('MODAL_WEBHOOK_URL', 'https://executor.invalid');
  vi.stubEnv('AGENT_INTERNAL_SECRET', 'fixture-secret');
  vi.stubEnv('KV_REST_API_URL', '');
  vi.stubEnv('KV_REST_API_TOKEN', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('Background review dispatch receipts', () => {
  it('does not report an executor refusal as a started run', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    const res = await POST();
    expect(res.status).toBe(503);
    expect((await res.json()).triggered).toBe(false);
    expect(markInFlight).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalled();
  });
  it('preserves an ambiguous acknowledgement without dispatching twice', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const res = await POST();
    expect(await res.json()).toMatchObject({
      triggered: false,
      method: 'unknown',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(markInFlight).not.toHaveBeenCalled();
  });
  it('retains a wakeup after a durable queue receipt and labels it queued', async () => {
    vi.stubEnv('KV_REST_API_URL', 'https://queue.invalid');
    vi.stubEnv('KV_REST_API_TOKEN', 'fixture');
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    expect(await (await POST()).json()).toMatchObject({
      triggered: true,
      method: 'queued',
    });
    expect(afterTasks).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await afterTasks[0]();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('honors a paused review before dispatching', async () => {
    settings.enabled = false;
    expect((await POST()).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
