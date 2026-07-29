import { describe, expect, it } from 'vitest';
import { extractContinueWorkspaceRunCalls, extractStartWorkSessionCalls } from '@/lib/realtime/client-events';

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
});
