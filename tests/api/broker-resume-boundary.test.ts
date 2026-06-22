import { describe, expect, it, vi } from 'vitest';

const brokerCtx = {
  brokerage: { id: 'bk_own', ownerId: 'u_owner', name: 'Own Brokerage' },
  membership: { id: 'mem_1', brokerageId: 'bk_own', userId: 'u_1', role: 'broker_owner' },
  dbUserId: 'u_1',
  brokerRole: 'broker_owner',
};

const resolveBrokerContext = vi.fn<() => Promise<typeof brokerCtx | null>>(async () => brokerCtx);

vi.mock('@/lib/agent/broker-context', () => ({
  resolveBrokerContext: () => resolveBrokerContext(),
}));

import { POST } from '@/app/api/ai/broker-task/resume/[pausedRunId]/route';

function request() {
  return {} as Parameters<typeof POST>[0];
}

const params = { params: Promise.resolve({ pausedRunId: 'paused_1' }) };

describe('POST /api/ai/broker-task/resume/[pausedRunId]', () => {
  it('fails closed for broker resumes instead of using the realtor resume route', async () => {
    const res = await POST(request(), params);

    expect(resolveBrokerContext).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Broker resume is not available' });
  });

  it('still gates the explicit broker resume boundary on broker context', async () => {
    resolveBrokerContext.mockResolvedValueOnce(null);

    const res = await POST(request(), params);

    expect(res.status).toBe(403);
  });
});
