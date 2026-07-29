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

type RealtimeFunctionName =
  | 'start_work_session'
  | 'continue_workspace_run'
  | 'get_specialist_status'
  | 'cancel_specialist_task';

/**
 * Realtime may surface a completed function call as its dedicated arguments
 * event or in the final response output. Normalize both shapes so the browser
 * can acknowledge the call exactly once.
 */
function extractFunctionCalls(event: RealtimeEvent, name: RealtimeFunctionName): RealtimeFunctionCall[] {
  if (
    event.type === 'response.function_call_arguments.done' &&
    event.name === name &&
    event.call_id
  ) {
    return [{ callId: event.call_id, arguments: event.arguments ?? '{}' }];
  }

  if (event.type !== 'response.done') return [];
  return (event.response?.output ?? [])
    .filter(
      (output) =>
        output.type === 'function_call' &&
        output.name === name &&
        Boolean(output.call_id),
    )
    .map((output) => ({
      callId: output.call_id!,
      arguments: output.arguments ?? '{}',
    }));
}

export function extractStartWorkSessionCalls(event: RealtimeEvent): RealtimeFunctionCall[] {
  return extractFunctionCalls(event, 'start_work_session');
}

/** Same dual-event normalization for an eligible Workspace continuation. */
export function extractContinueWorkspaceRunCalls(
  event: RealtimeEvent,
): RealtimeFunctionCall[] {
  return extractFunctionCalls(event, 'continue_workspace_run');
}

export function extractSpecialistControlCalls(
  event: RealtimeEvent,
): Array<RealtimeFunctionCall & { name: 'get_specialist_status' | 'cancel_specialist_task' }> {
  return (['get_specialist_status', 'cancel_specialist_task'] as const).flatMap((name) =>
    extractFunctionCalls(event, name).map((call) => ({ ...call, name })),
  );
}

export interface SpecialistControlBrowserResult {
  runId?: string | null;
  found?: boolean;
  status?: string;
  active?: boolean;
  terminal?: boolean;
  failed?: boolean;
  outcome?: string;
  reused?: boolean;
  members?: { total?: number; queued?: number; running?: number; completed?: number; failed?: number };
  resultAvailable?: boolean;
}

/** Exact privacy boundary between the server response and the Realtime model. */
export function buildSpecialistControlVoiceOutput(
  name: 'get_specialist_status' | 'cancel_specialist_task',
  data: SpecialistControlBrowserResult,
): Record<string, unknown> {
  if (name === 'get_specialist_status') {
    return {
      ok: true,
      found: data.found === true,
      status: data.status ?? 'none',
      active: data.active === true,
      terminal: data.terminal === true,
      failed: data.failed === true,
      members: data.members ?? { total: 0, queued: 0, running: 0, completed: 0, failed: 0 },
      resultAvailable: data.resultAvailable === true,
    };
  }
  return {
    ok: true,
    found: data.found === true,
    status: data.status ?? 'none',
    outcome: data.outcome ?? 'unknown',
    reused: data.reused === true,
  };
}
