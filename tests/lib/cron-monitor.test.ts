/**
 * monitorCron wraps the unattended Vercel crons with a Sentry dead-man
 * check-in. The whole point is catching SILENT failures, so pin: it opens an
 * in_progress check-in with the schedule before running; a <500 response
 * closes 'ok'; a returned 5xx closes 'error' (the silent-500 case) while STILL
 * returning the response; a thrown error closes 'error', captures the
 * exception tagged with the cron slug, and re-throws; and the handler's args +
 * return value pass through untouched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { captureCheckIn, captureException } = vi.hoisted(() => ({
  captureCheckIn: vi.fn((..._args: unknown[]) => 'checkin-id'),
  captureException: vi.fn((..._args: unknown[]) => undefined),
}));

vi.mock('@sentry/nextjs', () => ({ captureCheckIn, captureException }));

import { monitorCron } from '@/lib/cron-monitor';

beforeEach(() => {
  vi.clearAllMocks();
  captureCheckIn.mockReturnValue('checkin-id');
});

describe('monitorCron', () => {
  it('opens an in_progress check-in with the schedule, then closes ok on <500', async () => {
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    const res = await monitorCron('lead-sla', { crontab: '*/15 * * * *' }, handler)();

    // Open
    expect(captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'lead-sla', status: 'in_progress' },
      {
        schedule: { type: 'crontab', value: '*/15 * * * *' },
        checkinMargin: 5,
        maxRuntime: 10,
        timezone: 'Etc/UTC',
      },
    );
    // Close ok, reusing the id
    expect(captureCheckIn).toHaveBeenNthCalledWith(2, {
      checkInId: 'checkin-id',
      monitorSlug: 'lead-sla',
      status: 'ok',
    });
    expect(res.status).toBe(200);
  });

  it('marks a returned 5xx as error but still returns the response', async () => {
    const handler = vi.fn(async () => new Response(null, { status: 500 }));
    const res = await monitorCron('sweep', { crontab: '0 * * * *' }, handler)();

    expect(captureCheckIn).toHaveBeenNthCalledWith(2, {
      checkInId: 'checkin-id',
      monitorSlug: 'sweep',
      status: 'error',
    });
    expect(captureException).not.toHaveBeenCalled();
    expect(res.status).toBe(500); // not swallowed
  });

  it('on a thrown error: closes error, captures tagged, and re-throws', async () => {
    const boom = new Error('cron blew up');
    const handler = vi.fn(async () => {
      throw boom;
    });
    await expect(monitorCron('digest', { crontab: '0 9 * * *' }, handler)()).rejects.toBe(boom);

    expect(captureCheckIn).toHaveBeenNthCalledWith(2, {
      checkInId: 'checkin-id',
      monitorSlug: 'digest',
      status: 'error',
    });
    expect(captureException).toHaveBeenCalledWith(boom, { tags: { cron: 'digest' } });
  });

  it('honours margin/runtime overrides', async () => {
    const handler = vi.fn(async () => new Response(null, { status: 200 }));
    await monitorCron(
      'long-sweep',
      { crontab: '0 0 * * *', checkinMarginMinutes: 15, maxRuntimeMinutes: 30 },
      handler,
    )();
    expect(captureCheckIn.mock.calls[0][1]).toMatchObject({ checkinMargin: 15, maxRuntime: 30 });
  });

  it('passes the handler args through and returns its value', async () => {
    const handler = vi.fn(async (n: number) => new Response(String(n), { status: 200 }));
    const wrapped = monitorCron('echo', { crontab: '* * * * *' }, handler as never) as (
      n: number,
    ) => Promise<Response>;
    const res = await wrapped(42);
    expect(handler).toHaveBeenCalledWith(42);
    expect(await res.text()).toBe('42');
  });
});
