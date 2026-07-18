/**
 * Route-level test for GET /api/drip/tick — the cron trigger + auth wrapper.
 * Mirrors the auth-boundary tests for the sibling scheduled-messages cron.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const advanceAllDueSpacesMock = vi.fn();
vi.mock('@/lib/drip/engine', () => ({
  advanceAllDueSpaces: (...args: unknown[]) => advanceAllDueSpacesMock(...args),
}));

vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: vi.fn(() => 'checkin-1'),
}));

import { GET } from '@/app/api/drip/tick/route';

const ORIGINAL_ENV = { ...process.env };

function req(auth?: string) {
  return new NextRequest('https://cron.internal/api/drip/tick', {
    headers: auth ? { Authorization: auth } : {},
  });
}

beforeEach(() => {
  advanceAllDueSpacesMock.mockReset();
  advanceAllDueSpacesMock.mockResolvedValue([]);
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_DRIP_DISABLED;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GET /api/drip/tick', () => {
  it('401s without the bearer secret', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(advanceAllDueSpacesMock).not.toHaveBeenCalled();
  });

  it('401s with the wrong secret', async () => {
    const res = await GET(req('Bearer wrong'));
    expect(res.status).toBe(401);
  });

  it('500s fail-closed when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req('Bearer whatever'));
    expect(res.status).toBe(500);
    expect(advanceAllDueSpacesMock).not.toHaveBeenCalled();
  });

  it('skips work when CRON_DRIP_DISABLED is set', async () => {
    process.env.CRON_DRIP_DISABLED = '1';
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'disabled' });
    expect(advanceAllDueSpacesMock).not.toHaveBeenCalled();
  });

  it('runs the tick and summarizes per-space results', async () => {
    advanceAllDueSpacesMock.mockResolvedValue([
      { spaceId: 'space-1', due: 2, scheduled: 1, stoppedReplied: 1, completed: 0, skipped: 0, failed: 0 },
      { spaceId: 'space-2', due: 1, scheduled: 1, stoppedReplied: 0, completed: 1, skipped: 0, failed: 0 },
    ]);
    const res = await GET(req('Bearer test-secret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.spacesProcessed).toBe(2);
    expect(body.due).toBe(3);
    expect(body.scheduled).toBe(2);
    expect(body.stoppedReplied).toBe(1);
    expect(body.completed).toBe(1);
  });
});
