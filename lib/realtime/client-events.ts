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
  | 'spawn_specialist_team'
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

/** Normalize the bounded voice-to-specialist launch from both Realtime shapes. */
export function extractSpawnSpecialistTeamCalls(
  event: RealtimeEvent,
): RealtimeFunctionCall[] {
  return extractFunctionCalls(event, 'spawn_specialist_team');
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

export interface SpecialistSpawnBrowserResult {
  runId?: string | null;
  accepted?: boolean;
  requestSaved?: boolean;
  recoveryArmed?: boolean;
  newlyQueued?: boolean;
  status?: string;
  delivery?: string;
  reused?: boolean;
  conversationCreated?: boolean;
  conversationRecorded?: boolean;
  executionMode?: 'review' | 'autonomous';
}

/**
 * Exact provider boundary for a specialist launch. The browser may retain the
 * run/conversation handles for UI hydration, but they never cross back into
 * the Realtime model as function output.
 */
export function buildSpecialistSpawnVoiceOutput(
  data: SpecialistSpawnBrowserResult,
): Record<string, unknown> {
  return {
    ok: true,
    accepted: data.accepted === true,
    requestSaved: data.requestSaved === true,
    recoveryArmed: data.recoveryArmed === true,
    newlyQueued: data.newlyQueued === true,
    status: data.status ?? 'unknown',
    delivery: data.delivery ?? 'unknown',
    reused: data.reused === true,
    conversationCreated: data.conversationCreated === true,
    conversationRecorded: data.conversationRecorded !== false,
    // Voice never gets to widen the persisted policy. Unknown/missing values
    // are represented conservatively as Review at the provider boundary.
    executionMode: data.executionMode === 'autonomous' ? 'autonomous' : 'review',
  };
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
