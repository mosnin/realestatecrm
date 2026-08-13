import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env, type JobMessage } from '../../worker/src/index';

// This test intentionally imports the Worker runtime into the app test
// program. The production Worker gets the complete Cloudflare declarations
// from worker/tsconfig.json; these narrow ambient shapes keep the root app
// typecheck independent of the worker package's private dependency graph.
declare global {
  interface Queue<T = unknown> {
    send(message: T, options?: { delaySeconds?: number }): Promise<void>;
  }
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
  interface ScheduledController {
    scheduledTime: number;
  }
  interface MessageBatch<T = unknown> {
    messages: Array<{
      body: T;
      attempts: number;
      ack(): void;
      retry(options?: { delaySeconds?: number }): void;
    }>;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Cloudflare scheduled runtime', () => {
  it('retries only the failed occurrence after a partial enqueue', async () => {
    const state = new Map<string, string>([
      ['master-tick-watermark', '2026-08-10T08:55:00.000Z'],
    ]);
    const sends: JobMessage[] = [];
    let failReminderOnce = true;

    const env = {
      APP_BASE_URL: 'https://app.example.test',
      CRON_SECRET: 'cron-secret',
      WORKER_SECRET: 'worker-secret',
      JOBS: {
        send: vi.fn(async (message: JobMessage) => {
          sends.push(message);
          if (message.type === 'tick' && message.id === 'cron-follow-up-reminders' && failReminderOnce) {
            failReminderOnce = false;
            throw new Error('partial queue outage');
          }
        }),
      },
      STATE: {
        get: vi.fn(async (key: string) => state.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => { state.set(key, value); }),
        delete: vi.fn(async (key: string) => { state.delete(key); }),
      },
    } as unknown as Env;

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await worker.scheduled({
      scheduledTime: Date.parse('2026-08-10T09:00:00.000Z'),
    } as ScheduledController, env);
    expect(state.get('master-tick-watermark')).toBe('2026-08-10T08:55:00.000Z');

    await worker.scheduled({
      scheduledTime: Date.parse('2026-08-10T09:05:00.000Z'),
    } as ScheduledController, env);

    const tickSends = sends.filter((message): message is Extract<JobMessage, { type: 'tick' }> => message.type === 'tick');
    expect(tickSends.filter((message) => message.id === 'cron-follow-up-reminders')).toHaveLength(2);
    expect(tickSends.filter((message) => message.id === 'cron-broker-weekly-report')).toHaveLength(1);
    expect(tickSends.find((message) => message.id === 'cron-broker-weekly-report')?.occurrence)
      .toBe('2026-08-10T09:00:00.000Z');
    expect(state.get('master-tick-watermark')).toBe('2026-08-10T09:05:00.000Z');
  });
});
