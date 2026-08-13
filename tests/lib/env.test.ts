import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test',
  OPENAI_API_KEY: 'openai-test',
  CLERK_SECRET_KEY: 'clerk-secret-test',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'clerk-public-test',
} as const;

const CONTROLLED_OPTIONAL_KEYS = [
  'WORKER_URL',
  'WORKER_SECRET',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'INNGEST_CRONS_ENABLED',
  'INNGEST_CRONS_DISABLED',
  'REALTIME_VOICE_GATEWAY_ENABLED',
  'CHIPPI_REALTIME_VOICE_FLOOR_MANAGER_ENABLED',
  'NEXT_PUBLIC_CHIPPI_WORKBENCH_ENABLED',
  'CHIPPI_RESEARCH_WORKSPACE_ENABLED',
  'NEXT_PUBLIC_CHIPPI_RESEARCH_WORKSPACE_ENABLED',
  'CHIPPI_RESEARCH_WORKSPACE_SPACE_IDS',
  'MODAL_HEADLESS_BROWSER_URL',
  'CHIPPI_BROWSER_WORKER_SECRET',
  'CHIPPI_WORKSPACE_RUNS_ENABLED',
  'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED',
  'CHIPPI_WORKSPACE_RUNS_SPACE_IDS',
  'CHIPPI_WORKSPACE_RUN_RECOVERY_ENABLED',
  'CRON_WORKSPACE_RUN_RECOVERY_DISABLED',
  'CRON_CONVERSATION_TURN_RECOVERY_DISABLED',
  'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
  'NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED',
  'CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_SPACE_IDS',
  'CHIPPI_WORKSPACE_RUN_TASK_RECOVERY_ENABLED',
  'MODAL_WORKSPACE_RUN_URL',
  'MODAL_WORKSPACE_RUN_TASK_URL',
  'CHIPPI_WORKSPACE_MODAL_SECRET',
  'CHIPPI_WORKSPACE_CALLBACK_SECRET',
  'AGENT_RUN_POLICY_MODE',
  'AGENT_RUN_POLICY_SECRET',
  'DURABLE_SCHEDULE_OCCURRENCES_ENABLED',
  'WORK_SESSION_ACTIONS_DISABLED',
  'CHIPPI_CHAT_RUNTIME',
  'CHIPPI_REASONING_EFFORT',
  'OPENROUTER_API_KEY',
] as const;

describe('environment feature readiness warnings', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadEnv(overrides: Record<string, string> = {}) {
    vi.resetModules();
    for (const [key, value] of Object.entries(REQUIRED)) vi.stubEnv(key, value);
    for (const key of CONTROLLED_OPTIONAL_KEYS) vi.stubEnv(key, '');
    for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
    return import('@/lib/env');
  }

  function warningText(): string {
    return warn.mock.calls.map((call) => String(call[0])).join('\n');
  }

  it('keeps restored features silent and bootable while every rollout flag is off', async () => {
    await expect(loadEnv()).resolves.toBeDefined();
    expect(warningText()).not.toContain('Realtime Voice —');
    expect(warningText()).not.toContain('Research Workspace —');
    expect(warningText()).not.toContain('Managed Workspace Runs —');
    expect(warningText()).not.toContain('Workspace private terminal/follow-ups —');
  });

  it('accepts Cloudflare as the primary durable rail for Realtime Voice', async () => {
    await loadEnv({
      REALTIME_VOICE_GATEWAY_ENABLED: '1',
      WORKER_URL: 'https://worker.example.workers.dev',
      WORKER_SECRET: 'worker-secret-test',
    });
    expect(warningText()).not.toContain('Durable Work Session dispatch is unavailable');
  });

  it('warns when Voice is enabled without Cloudflare or the Inngest fallback', async () => {
    await loadEnv({ REALTIME_VOICE_GATEWAY_ENABLED: '1' });
    expect(warningText()).toContain('Durable Work Session dispatch is unavailable');
  });

  it('does not advertise an event-key-only Inngest fallback as durable', async () => {
    await loadEnv({
      REALTIME_VOICE_GATEWAY_ENABLED: '1',
      INNGEST_EVENT_KEY: 'event-test',
    });
    expect(warningText()).toContain('Durable Work Session dispatch is unavailable');
    expect(warningText()).toContain('INNGEST_SIGNING_KEY');
  });

  it('names the missing half of a partially configured Cloudflare pair', async () => {
    await loadEnv({ WORKER_URL: 'https://worker.example.workers.dev' });
    const text = warningText();
    expect(text).toContain('Cloudflare background worker');
    expect(text).toContain('missing: WORKER_SECRET');
  });

  it('rejects false as a truthiness trap without claiming the mirror is active', async () => {
    await loadEnv({
      WORKER_URL: 'https://worker.example.workers.dev',
      WORKER_SECRET: 'worker-secret-test',
      INNGEST_CRONS_ENABLED: 'false',
      INNGEST_EVENT_KEY: 'event-test',
      INNGEST_SIGNING_KEY: 'signing-test',
    });
    expect(warningText()).toContain('requires exact value 1');
    expect(warningText()).not.toContain('Scheduler conflict');
  });

  it('requires exact 1 for the Workspace Run recovery kill switch', async () => {
    await loadEnv({ CRON_WORKSPACE_RUN_RECOVERY_DISABLED: 'true' });
    expect(warningText()).toContain(
      'CRON_WORKSPACE_RUN_RECOVERY_DISABLED requires exact value 1 to disable recovery; otherwise UNSET it.',
    );
  });

  it('requires exact 1 for the ConversationTurn recovery kill switch', async () => {
    await loadEnv({ CRON_CONVERSATION_TURN_RECOVERY_DISABLED: 'true' });
    expect(warningText()).toContain(
      'CRON_CONVERSATION_TURN_RECOVERY_DISABLED requires exact value 1 to disable recovery; otherwise UNSET it.',
    );
  });

  it.each(['1', 'true'])(
    'quarantines DURABLE_SCHEDULE_OCCURRENCES_ENABLED=%s even with valid policy auth',
    async (value) => {
      await loadEnv({
        DURABLE_SCHEDULE_OCCURRENCES_ENABLED: value,
        AGENT_RUN_POLICY_MODE: 'enforce',
        AGENT_RUN_POLICY_SECRET: 'a'.repeat(32),
      });
      expect(warningText()).toContain(
        'no durable occurrence executor is wired, so 1/true has no runtime effect',
      );
    },
  );

  it('keeps explicit false silent for the construction-only occurrence flag', async () => {
    await loadEnv({ DURABLE_SCHEDULE_OCCURRENCES_ENABLED: 'false' });
    expect(warningText()).not.toContain('no durable occurrence executor is wired');
  });

  it('accepts the required OpenAI provider for private terminal follow-ups', async () => {
    await loadEnv({
      CHIPPI_WORKSPACE_RUNS_ENABLED: 'true',
      NEXT_PUBLIC_CHIPPI_WORKSPACE_RUNS_ENABLED: 'true',
      CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED: 'true',
      NEXT_PUBLIC_CHIPPI_WORKSPACE_RUN_FOLLOW_UPS_ENABLED: 'true',
    });
    const text = warningText();
    expect(text).toContain('Workspace private terminal/follow-ups');
    expect(text).not.toContain('OPENROUTER_API_KEY');
  });
});
