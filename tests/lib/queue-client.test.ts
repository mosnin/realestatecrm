/**
 * lib/queue.ts — the app's producer client for the Cloudflare worker.
 * Pins the honesty contract: unconfigured/unreachable/rejected → null (never
 * a fake success), and the wire format the Worker's /enqueue expects.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { enqueueWorkerTask, workerHealth } from '@/lib/queue';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  process.env.WORKER_URL = 'https://chippi-worker.test.workers.dev';
  process.env.WORKER_SECRET = 's3cret';
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WORKER_URL;
  delete process.env.WORKER_SECRET;
});

describe('enqueueWorkerTask', () => {
  it('returns null without touching the network when unconfigured', async () => {
    delete process.env.WORKER_URL;
    expect(await enqueueWorkerTask('noop')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('POSTs the task to /enqueue with the bearer secret', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const result = await enqueueWorkerTask('noop', { ping: 1 }, { delaySeconds: 60 });
    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://chippi-worker.test.workers.dev/enqueue');
    expect(init.headers.Authorization).toBe('Bearer s3cret');
    expect(JSON.parse(init.body)).toEqual({ task: 'noop', payload: { ping: 1 }, delaySeconds: 60 });
  });

  it('returns null when the worker rejects or is unreachable', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await enqueueWorkerTask('noop')).toBeNull();
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await enqueueWorkerTask('noop')).toBeNull();
  });
});

describe('workerHealth', () => {
  it('reads the Worker /health payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, scheduledJobs: 23 }), { status: 200 }),
    );
    expect(await workerHealth()).toEqual({ ok: true, scheduledJobs: 23 });
  });

  it('null when unconfigured or down', async () => {
    delete process.env.WORKER_URL;
    expect(await workerHealth()).toBeNull();
    process.env.WORKER_URL = 'https://chippi-worker.test.workers.dev';
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await workerHealth()).toBeNull();
  });
});
