export interface RealtimeFunctionCall {
  callId: string;
  arguments: string;
}

interface RealtimeEvent {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  response?: {
    output?: Array<{
      type?: string;
      name?: string;
      call_id?: string;
      arguments?: string;
    }>;
  };
}

/**
 * Realtime may surface a completed function call as its dedicated arguments
 * event or in the final response output. Normalize both shapes so the browser
 * can acknowledge the call exactly once.
 */
export function extractStartWorkSessionCalls(
  event: RealtimeEvent,
): RealtimeFunctionCall[] {
  if (
    event.type === 'response.function_call_arguments.done' &&
    event.name === 'start_work_session' &&
    event.call_id
  ) {
    return [{ callId: event.call_id, arguments: event.arguments ?? '{}' }];
  }

  if (event.type !== 'response.done') return [];
  return (event.response?.output ?? [])
    .filter(
      (output) =>
        output.type === 'function_call' &&
        output.name === 'start_work_session' &&
        Boolean(output.call_id),
    )
    .map((output) => ({
      callId: output.call_id!,
      arguments: output.arguments ?? '{}',
    }));
}
