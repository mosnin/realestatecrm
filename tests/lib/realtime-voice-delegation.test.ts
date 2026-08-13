import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildVoiceRealtimeSessionConfig,
  failClosedVoiceWorkspaceContinuationEligibility,
  resolveVoiceWorkExecutionMode,
  stableVoiceId,
} from '@/lib/realtime/voice-delegation';
import {
  realtimeVoiceGatewayEnabled,
  realtimeVoiceGatewayReady,
} from '@/lib/realtime/voice-feature';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Realtime voice delegation contract', () => {
  it('derives stable, scoped UUIDs for provider retries', () => {
    const first = stableVoiceId('space-a', 'conversation-a', 'call-a', 'session');
    const retry = stableVoiceId('space-a', 'conversation-a', 'call-a', 'session');
    const otherTenant = stableVoiceId('space-b', 'conversation-a', 'call-a', 'session');
    const otherKind = stableVoiceId('space-a', 'conversation-a', 'call-a', 'user-message');

    expect(first).toBe(retry);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(otherTenant).not.toBe(first);
    expect(otherKind).not.toBe(first);
  });

  it('uses the current Realtime model and only exposes continuation after server eligibility', () => {
    const config = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: true,
    });

    expect(config.model).toBe('gpt-realtime-2.1');
    expect(config.output_modalities).toEqual(['audio']);
    expect(config.tools).toHaveLength(1);
    expect(config.tools[0].name).toBe('start_work_session');
    expect(config.tools[0].parameters).toMatchObject({
      additionalProperties: false,
      required: ['goal', 'autonomy', 'allow_questions'],
    });
    expect(config.instructions).toContain('For start_work_session, say a new background session started only when that call returns ok=true');
    expect(config.instructions).toContain('cannot send messages or change CRM records');
    expect(JSON.stringify(config)).not.toContain('OPENAI_API_KEY');

    const eligible = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: true,
      workspaceContinuationEligible: true,
    });
    expect(eligible.tools.map((tool) => tool.name)).toEqual(['start_work_session', 'continue_workspace_run']);
    expect(eligible.tools[1].parameters).toMatchObject({
      additionalProperties: false,
      required: ['instruction'],
    });
    expect(eligible.instructions).toContain('Never ask for or provide a Workspace run id');
    expect(eligible.instructions).toContain('For continue_workspace_run, say the Workspace continuation started only when that call returns ok=true');
  });

  it('defaults missing or malformed voice policy to Review and preserves only explicit Autonomous', () => {
    expect(resolveVoiceWorkExecutionMode(undefined)).toBe('review');
    expect(resolveVoiceWorkExecutionMode(null)).toBe('review');
    expect(resolveVoiceWorkExecutionMode('unexpected')).toBe('review');
    expect(resolveVoiceWorkExecutionMode('review')).toBe('review');
    expect(resolveVoiceWorkExecutionMode('autonomous')).toBe('autonomous');

    const config = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: false,
      specialistSpawnEligible: true,
    });
    expect(config.instructions).toContain('server-held Work policy is Review');
  });

  it('advertises voice only when feature, provider, and durable dispatcher are ready', () => {
    delete process.env.REALTIME_VOICE_GATEWAY_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.INNGEST_EVENT_KEY;
    delete process.env.INNGEST_SIGNING_KEY;
    delete process.env.WORKER_URL;
    delete process.env.WORKER_SECRET;
    expect(realtimeVoiceGatewayEnabled()).toBe(false);
    expect(realtimeVoiceGatewayReady()).toBe(false);

    process.env.REALTIME_VOICE_GATEWAY_ENABLED = '1';
    process.env.OPENAI_API_KEY = 'test-only';
    expect(realtimeVoiceGatewayReady()).toBe(false);

    process.env.WORKER_URL = 'https://worker.example.workers.dev';
    expect(realtimeVoiceGatewayReady()).toBe(false);
    process.env.WORKER_SECRET = 'test-only';
    expect(realtimeVoiceGatewayReady()).toBe(true);

    delete process.env.WORKER_URL;
    delete process.env.WORKER_SECRET;
    process.env.INNGEST_EVENT_KEY = 'test-only';
    expect(realtimeVoiceGatewayReady()).toBe(false);
    process.env.INNGEST_SIGNING_KEY = 'test-only-signing';
    expect(realtimeVoiceGatewayReady()).toBe(true);
  });

  it('does not advertise durable voice for whitespace-only rail values', () => {
    process.env.REALTIME_VOICE_GATEWAY_ENABLED = '1';
    process.env.OPENAI_API_KEY = 'test-only';
    process.env.WORKER_URL = '   ';
    process.env.WORKER_SECRET = 'test-only';
    process.env.INNGEST_EVENT_KEY = '   ';
    process.env.INNGEST_SIGNING_KEY = 'test-only-signing';

    expect(realtimeVoiceGatewayReady()).toBe(false);
  });

  it('exposes empty-id floor-manager tools only for an eligible attached conversation', () => {
    const eligible = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: true,
      floorManagerEligible: true,
    });
    expect(eligible.tools.map((tool) => tool.name)).toEqual([
      'start_work_session',
      'get_specialist_status',
      'cancel_specialist_task',
    ]);
    for (const tool of eligible.tools.slice(1)) {
      expect(tool.parameters).toEqual({
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      });
    }
    expect(eligible.instructions).toContain('Never ask for, accept, or provide a specialist run id');
    expect(eligible.instructions).toContain('For get_specialist_status, report only the returned coarse status facts');
    expect(eligible.instructions).toContain(
      'For cancel_specialist_task, when outcome=cancelled say cancellation was recorded and future results are blocked; do not claim an in-flight model call stopped immediately.',
    );
    expect(eligible.instructions).not.toContain('After a successful function call, tell the user the work is running');
    expect(JSON.stringify(eligible.tools.slice(1))).not.toContain('runId');

    const unattached = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: false,
      floorManagerEligible: false,
    });
    expect(unattached.tools.map((tool) => tool.name)).toEqual(['start_work_session']);
  });

  it('exposes a goal-only specialist spawn under the persisted Work policy', () => {
    const config = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: true,
      specialistSpawnEligible: true,
      workExecutionMode: 'review',
    });
    const tool = config.tools.find((candidate) => candidate.name === 'spawn_specialist_team');

    expect(tool?.parameters).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        goal: expect.objectContaining({ minLength: 10, maxLength: 2000 }),
      },
      required: ['goal'],
    });
    expect(JSON.stringify(tool?.parameters)).not.toMatch(/runId|agentId|tenant|executionMode|autonomy/);
    expect(config.instructions).toContain('server-held Work policy is Review');
    expect(config.instructions).toContain('You cannot widen or change it from voice');
    expect(config.instructions).toContain('Queue acceptance does not prove that any specialist has started');
    expect(config.instructions).toContain('accepted=false, and requestSaved=true');
    expect(config.instructions).toContain('delivery=already_completed');
    expect(config.instructions).toContain('no new specialist team was started');
  });

  it('fails closed to the legacy voice tool when optional Workspace eligibility is unavailable', async () => {
    const warning = vi.fn();
    await expect(failClosedVoiceWorkspaceContinuationEligibility(
      async () => { throw new Error('temporary database read failure'); },
      warning,
    )).resolves.toBe(false);
    expect(warning).toHaveBeenCalledOnce();
    const config = buildVoiceRealtimeSessionConfig({
      workspaceName: 'P&W Properties',
      conversationAttached: true,
      workspaceContinuationEligible: false,
    });
    expect(config.tools.map((tool) => tool.name)).toEqual(['start_work_session']);
  });
});
