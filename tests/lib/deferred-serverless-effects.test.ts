import { beforeEach, describe, expect, it, vi } from 'vitest';

const { afterMock } = vi.hoisted(() => ({ afterMock: vi.fn() }));

vi.mock('next/server', () => ({ after: afterMock }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { audit } from '@/lib/audit';
import { notifyBroker } from '@/lib/broker-notify';
import { syncBrokerageSeatBilling } from '@/lib/billing/brokerage-seat-billing';

beforeEach(() => {
  afterMock.mockReset();
});

describe('deferred serverless side effects', () => {
  it('registers audit, broker notification, and seat billing work with after()', async () => {
    await Promise.all([
      audit({ actorClerkId: 'user_1', action: 'UPDATE', resource: 'Contact' }),
      notifyBroker({
        brokerageId: 'brokerage_1',
        type: 'review_requested',
        title: 'Review requested',
      }),
      syncBrokerageSeatBilling('brokerage_1'),
    ]);

    expect(afterMock).toHaveBeenCalledTimes(3);
    for (const [callback] of afterMock.mock.calls) {
      expect(callback).toBeTypeOf('function');
    }
  });
});
