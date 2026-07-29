import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildVoiceRealtimeSessionConfig,
  failClosedVoiceWorkspaceContinuationEligibility,
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
    expect(config.instructions).toContain('Never claim the work started until');
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
  });

  it('advertises voice only when feature, provider, and durable dispatcher are ready', () => {
    delete process.env.REALTIME_VOICE_GATEWAY_ENABLED;
    delete process.env.OPENAI_API_KEY;
    delete process.env.INNGEST_EVENT_KEY;
    expect(realtimeVoiceGatewayEnabled()).toBe(false);
    expect(realtimeVoiceGatewayReady()).toBe(false);

    process.env.REALTIME_VOICE_GATEWAY_ENABLED = '1';
    process.env.OPENAI_API_KEY = 'test-only';
    expect(realtimeVoiceGatewayReady()).toBe(false);

    process.env.INNGEST_EVENT_KEY = 'test-only';
    expect(realtimeVoiceGatewayReady()).toBe(true);
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
