import { describe, expect, it } from 'vitest';
import {
  buildSpecialistControlVoiceOutput,
  buildSpecialistSpawnVoiceOutput,
  extractContinueWorkspaceRunCalls,
  extractSpawnSpecialistTeamCalls,
  extractSpecialistControlCalls,
  extractStartWorkSessionCalls,
} from '@/lib/realtime/client-events';

describe('Realtime client event normalization', () => {
  it('extracts the dedicated completed-arguments event', () => {
    expect(
      extractStartWorkSessionCalls({
        type: 'response.function_call_arguments.done',
        name: 'start_work_session',
        call_id: 'call_direct',
        arguments: '{"goal":"Prepare a market report"}',
      }),
    ).toEqual([
      {
        callId: 'call_direct',
        arguments: '{"goal":"Prepare a market report"}',
      },
    ]);
  });

  it('extracts the final response output shape', () => {
    expect(
      extractStartWorkSessionCalls({
        type: 'response.done',
        response: {
          output: [
            { type: 'message' },
            {
              type: 'function_call',
              name: 'start_work_session',
              call_id: 'call_response',
              arguments: '{"goal":"Research the listing"}',
            },
          ],
        },
      }),
    ).toEqual([
      {
        callId: 'call_response',
        arguments: '{"goal":"Research the listing"}',
      },
    ]);
  });

  it('ignores unrelated and incomplete calls', () => {
    expect(
      extractStartWorkSessionCalls({
        type: 'response.done',
        response: {
          output: [
            {
              type: 'function_call',
              name: 'send_email',
              call_id: 'call_send',
              arguments: '{}',
            },
            {
              type: 'function_call',
              name: 'start_work_session',
              arguments: '{}',
            },
          ],
        },
      }),
    ).toEqual([]);
  });

  it('normalizes continuation calls from both provider event shapes without confusing work-session calls', () => {
    expect(extractContinueWorkspaceRunCalls({
      type: 'response.function_call_arguments.done', name: 'continue_workspace_run', call_id: 'continue_direct', arguments: '{"instruction":"Add the seller review"}',
    })).toEqual([{ callId: 'continue_direct', arguments: '{"instruction":"Add the seller review"}' }]);
    expect(extractContinueWorkspaceRunCalls({
      type: 'response.done', response: { output: [
        { type: 'function_call', name: 'start_work_session', call_id: 'session', arguments: '{}' },
        { type: 'function_call', name: 'continue_workspace_run', call_id: 'continue_done', arguments: '{"instruction":"Extend it"}' },
      ] },
    })).toEqual([{ callId: 'continue_done', arguments: '{"instruction":"Extend it"}' }]);
  });

  it('normalizes both specialist controls from both event shapes for browser dedupe', () => {
    expect(extractSpecialistControlCalls({
      type: 'response.function_call_arguments.done',
      name: 'get_specialist_status',
      call_id: 'status-direct',
      arguments: '{}',
    })).toEqual([{ name: 'get_specialist_status', callId: 'status-direct', arguments: '{}' }]);
    expect(extractSpecialistControlCalls({
      type: 'response.done',
      response: { output: [
        { type: 'function_call', name: 'cancel_specialist_task', call_id: 'cancel-done', arguments: '{}' },
        { type: 'function_call', name: 'start_work_session', call_id: 'not-control', arguments: '{}' },
      ] },
    })).toEqual([{ name: 'cancel_specialist_task', callId: 'cancel-done', arguments: '{}' }]);
  });

  it('normalizes specialist spawn and strips browser-only identifiers from voice output', () => {
    expect(extractSpawnSpecialistTeamCalls({
      type: 'response.function_call_arguments.done',
      name: 'spawn_specialist_team',
      call_id: 'spawn-direct',
      arguments: '{"goal":"Analyze the whole listing pipeline"}',
    })).toEqual([{
      callId: 'spawn-direct',
      arguments: '{"goal":"Analyze the whole listing pipeline"}',
    }]);
    expect(extractSpawnSpecialistTeamCalls({
      type: 'response.done',
      response: { output: [{
        type: 'function_call',
        name: 'spawn_specialist_team',
        call_id: 'spawn-done',
        arguments: '{"goal":"Prepare a seller strategy"}',
      }] },
    })).toEqual([{
      callId: 'spawn-done',
      arguments: '{"goal":"Prepare a seller strategy"}',
    }]);

    const output = buildSpecialistSpawnVoiceOutput({
      runId: 'browser-run-id',
      accepted: true,
      requestSaved: true,
      recoveryArmed: false,
      newlyQueued: true,
      status: 'queued',
      delivery: 'queued',
      reused: false,
      conversationCreated: true,
      conversationRecorded: false,
      executionMode: 'review',
    });
    expect(output).toEqual({
      ok: true,
      accepted: true,
      requestSaved: true,
      recoveryArmed: false,
      newlyQueued: true,
      status: 'queued',
      delivery: 'queued',
      reused: false,
      conversationCreated: true,
      conversationRecorded: false,
      executionMode: 'review',
    });
    expect(JSON.stringify(output)).not.toContain('browser-run-id');
  });

  it('reports an unconfirmed but recoverable specialist handoff without claiming acceptance', () => {
    expect(buildSpecialistSpawnVoiceOutput({
      accepted: false,
      requestSaved: true,
      recoveryArmed: true,
      newlyQueued: true,
      status: 'planning',
      delivery: 'unconfirmed_recovery_armed',
    })).toEqual({
      ok: true,
      accepted: false,
      requestSaved: true,
      recoveryArmed: true,
      newlyQueued: true,
      status: 'planning',
      delivery: 'unconfirmed_recovery_armed',
      reused: false,
      conversationCreated: false,
      conversationRecorded: true,
      executionMode: 'review',
    });
  });

  it('forwards only coarse specialist facts to the Realtime model', () => {
    const privateBrowserResponse = {
      runId: 'browser-only-run',
      goal: 'private goal',
      resultSummary: 'private result',
      errorSummary: 'private provider error',
      found: true,
      status: 'completed',
      active: false,
      terminal: true,
      failed: false,
      members: { total: 2, queued: 0, running: 0, completed: 2, failed: 0 },
      resultAvailable: true,
      outcome: 'already_terminal',
      reused: true,
    };
    expect(buildSpecialistControlVoiceOutput('get_specialist_status', privateBrowserResponse)).toEqual({
      ok: true,
      found: true,
      status: 'completed',
      active: false,
      terminal: true,
      failed: false,
      members: { total: 2, queued: 0, running: 0, completed: 2, failed: 0 },
      resultAvailable: true,
    });
    expect(buildSpecialistControlVoiceOutput('cancel_specialist_task', privateBrowserResponse)).toEqual({
      ok: true,
      found: true,
      status: 'completed',
      outcome: 'already_terminal',
      reused: true,
    });
  });
});
