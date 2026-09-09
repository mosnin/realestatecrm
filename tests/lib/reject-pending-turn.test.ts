import { describe, expect, it } from 'vitest';
import { rejectPendingTurn } from '@/lib/chat/reject-pending-turn';

describe('durable preflight rejection', () => {
  it.each(['pending', 'running', 'completed'])('only settles the bound pending request (%s)', async status => {
    const rows = [
      { spaceId: 'a', id: 't', conversationId: 'c', clientRequestId: 'r', message: 'work', status },
      { spaceId: 'b', id: 't', conversationId: 'c', clientRequestId: 'r', message: 'work', status: 'pending' },
      { spaceId: 'a', id: 'other', conversationId: 'c', clientRequestId: 'r', message: 'work', status: 'pending' },
    ];
    const client = { from: () => ({ update: (patch: object) => {
      const filters: [string, string][] = [];
      const q = { eq(key: string, value: string) { filters.push([key,value]); return q; },
        then(resolve: (result: object) => unknown) {
          rows.filter(row => filters.every(([key,value]) => (row as any)[key] === value)).forEach(row => Object.assign(row,patch));
          return Promise.resolve(resolve({ error: null }));
        } };
      return q;
    } }) };
    await rejectPendingTurn(client as any, { spaceId: 'a', turnId: 't', conversationId: 'c', clientRequestId: 'r', message: 'work', error: 'Out of credits' });
    expect(rows[0].status).toBe(status === 'pending' ? 'failed' : status);
    expect(rows[1].status).toBe('pending');
    expect(rows[2].status).toBe('pending');
  });
  it('does not alter legacy requests without an accepted identity', async () => {
    await expect(rejectPendingTurn({} as any, { spaceId: 'a', message: 'work', error: 'Denied' })).resolves.toBeUndefined();
  });
});
