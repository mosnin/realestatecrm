import { describe, expect, it } from 'vitest';
import { inngestCronFallbackEnabled } from '@/lib/inngest/cron-fallback';

describe('Inngest cron fallback selection', () => {
  it('is off unless explicitly requested with the exact value 1', () => {
    expect(inngestCronFallbackEnabled({})).toBe(false);
    expect(inngestCronFallbackEnabled({ INNGEST_CRONS_ENABLED: 'true' })).toBe(false);
    expect(inngestCronFallbackEnabled({ INNGEST_CRONS_ENABLED: 'false' })).toBe(false);
    expect(inngestCronFallbackEnabled({ INNGEST_CRONS_ENABLED: ' 1 ' })).toBe(true);
  });

  it('refuses to mirror schedules when the Cloudflare rail is configured', () => {
    expect(inngestCronFallbackEnabled({
      INNGEST_CRONS_ENABLED: '1',
      WORKER_URL: 'https://worker.example',
      WORKER_SECRET: 'secret',
    })).toBe(false);
  });

  it('does not treat partial or whitespace Cloudflare configuration as active', () => {
    expect(inngestCronFallbackEnabled({
      INNGEST_CRONS_ENABLED: '1',
      WORKER_URL: '  ',
      WORKER_SECRET: 'secret',
    })).toBe(true);
    expect(inngestCronFallbackEnabled({
      INNGEST_CRONS_ENABLED: '1',
      WORKER_URL: 'https://worker.example',
    })).toBe(true);
  });
});
