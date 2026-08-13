import crypto from 'crypto';
import type { WorkExecutionMode } from '@/lib/chat/work-execution-mode';

const UUID_NAMESPACE_BYTES = 16;

/**
 * Voice may reflect an explicit persisted Work policy, but it must never turn
 * a missing or malformed policy into Autonomous execution. The general Work
 * default is intentionally not reused here because a voice-created thread has
 * no composer confirmation from which to derive that posture.
 */
export function resolveVoiceWorkExecutionMode(value: unknown): WorkExecutionMode {
  return value === 'autonomous' ? 'autonomous' : 'review';
}

/** Optional Workspace capability reads must never take down legacy voice. */
export async function failClosedVoiceWorkspaceContinuationEligibility(
  resolve: () => Promise<boolean>,
  onFailure: (error: unknown) => void,
): Promise<boolean> {
  try {
    return await resolve();
  } catch (error) {
    onFailure(error);
    return false;
  }
}

/** Stable UUID-shaped ids for idempotent Realtime function-call retries. */
export function stableVoiceId(
  spaceId: string,
  conversationId: string,
  callId: string,
  kind:
    | 'session'
    | 'user-message'
    | 'assistant-message'
    | 'specialist-run'
    | 'specialist-launch',
): string {
  const digest = crypto
    .createHash('sha256')
    .update(['chippi-voice-v1', kind, spaceId, conversationId, callId].join('\0'))
    .digest()
    .subarray(0, UUID_NAMESPACE_BYTES);
  // RFC 4122 variant + v5 marker. The bytes are SHA-256, but the UUID
  // version marker communicates deterministic/name-derived semantics.
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export interface VoiceRealtimeSessionConfig {
  type: 'realtime';
  model: 'gpt-realtime-2.1';
  instructions: string;
  output_modalities: ['audio'];
  audio: {
    input: {
      turn_detection: {
        type: 'server_vad';
        create_response: true;
        interrupt_response: true;
      };
    };
    output: { voice: 'marin' };
  };
  tools: Array<{
    type: 'function';
    name:
      | 'start_work_session'
      | 'continue_workspace_run'
      | 'spawn_specialist_team'
      | 'get_specialist_status'
      | 'cancel_specialist_task';
    description: string;
    parameters: Record<string, unknown>;
  }>;
  tool_choice: 'auto';
}

export function buildVoiceRealtimeSessionConfig(args: {
  workspaceName: string;
  conversationAttached: boolean;
  workspaceContinuationEligible?: boolean;
  specialistSpawnEligible?: boolean;
  floorManagerEligible?: boolean;
  workExecutionMode?: WorkExecutionMode;
}): VoiceRealtimeSessionConfig {
  const workExecutionMode = resolveVoiceWorkExecutionMode(args.workExecutionMode);
  const conversationLine = args.conversationAttached
    ? 'This voice session is attached to the open Chippi conversation.'
    : 'If you delegate work, Chippi will create a conversation and place the live work card there.';
  return {
    type: 'realtime',
    model: 'gpt-realtime-2.1',
    output_modalities: ['audio'],
    instructions: [
      `You are Chippi, the voice control surface for the real-estate workspace "${args.workspaceName}".`,
      conversationLine,
      'Speak naturally, warmly, and concisely. Default to one or two short sentences.',
      'You can discuss the request and you can start one durable background Work Session.',
      'Call start_work_session only when the user explicitly asks you to delegate, research, prepare, analyze, or work on a substantial goal in the background.',
      ...(args.workspaceContinuationEligible ? ['When the user explicitly asks to continue the completed Workspace in this conversation, call continue_workspace_run. Never ask for or provide a Workspace run id.'] : []),
      ...(args.specialistSpawnEligible ? [
        'For an explicit substantial, multi-step background goal that benefits from parallel specialists, call spawn_specialist_team.',
        'Pass only a self-contained goal. Never ask for or provide run ids, agent ids, tenant ids, or an execution mode.',
        `The server-held Work policy is ${workExecutionMode === 'review' ? 'Review' : 'Fully autonomous'}. You cannot widen or change it from voice.`,
      ] : []),
      ...(args.floorManagerEligible ? [
        'When the user asks how the latest specialist task in this conversation is doing, call get_specialist_status.',
        'Only when the user explicitly asks to stop the current specialist task, call cancel_specialist_task.',
        'Never ask for, accept, or provide a specialist run id. The server resolves the exact conversation-linked task.',
      ] : []),
      'For start_work_session, say a new background session started only when that call returns ok=true.',
      ...(args.workspaceContinuationEligible ? ['For continue_workspace_run, say the Workspace continuation started only when that call returns ok=true.'] : []),
      ...(args.specialistSpawnEligible ? [
        'For spawn_specialist_team with delivery=queued, say only that the request was durably queued. Queue acceptance does not prove that any specialist has started.',
        'When delivery=unconfirmed_recovery_armed, accepted=false, and requestSaved=true, say the request is saved and durable recovery is reconciling delivery. Do not call it queued, accepted by a worker, started, or running.',
        'When delivery=already_completed, say the matching request was already completed and no new specialist team was started.',
        'When delivery=already_accepted, say the matching request already existed and report only its returned status. Do not describe it as newly queued or newly started.',
        'Only for delivery=queued or unconfirmed_recovery_armed may you say the request can keep progressing while voice is minimized or closed.',
      ] : []),
      ...(args.floorManagerEligible ? [
        'For get_specialist_status, report only the returned coarse status facts. Never call the task running unless active=true.',
        'For cancel_specialist_task, when outcome=cancelled say cancellation was recorded and future results are blocked; do not claim an in-flight model call stopped immediately. Describe already_terminal or no_run truthfully.',
      ] : []),
      'Use plan_first unless the user clearly says to proceed without waiting for plan approval.',
      'This voice capability cannot send messages or change CRM records. Say so plainly if asked.',
      'After starting or continuing work successfully, tell the user they can close voice mode while that work continues.',
    ].join('\n'),
    audio: {
      input: {
        turn_detection: {
          type: 'server_vad',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: 'marin' },
    },
    tools: [
      {
        type: 'function',
        name: 'start_work_session',
        description:
          'Start a durable, read-only Chippi Work Session linked to the current conversation. ' +
          'It plans, runs in the background, can ask one question, and returns a report.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            goal: {
              type: 'string',
              minLength: 10,
              maxLength: 1000,
              description: 'A self-contained background-work goal.',
            },
            autonomy: {
              type: 'string',
              enum: ['plan_first', 'just_go'],
              description:
                'plan_first waits for approval; just_go is only for an explicit user request.',
            },
            allow_questions: {
              type: 'boolean',
              description: 'Whether Chippi may pause once for a clarifying question.',
            },
          },
          required: ['goal', 'autonomy', 'allow_questions'],
        },
      },
      ...(args.workspaceContinuationEligible ? [{
        type: 'function' as const,
        name: 'continue_workspace_run' as const,
        description: 'Continue the completed private Workspace linked to the current conversation. The server resolves the Workspace; no run id is accepted.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            instruction: {
              type: 'string',
              minLength: 3,
              maxLength: 1000,
              description: 'The grounded follow-up to create from the completed Workspace.',
            },
          },
          required: ['instruction'],
        },
      }] : []),
      ...(args.specialistSpawnEligible ? [{
        type: 'function' as const,
        name: 'spawn_specialist_team' as const,
        description:
          'Request a durable, conversation-bound specialist team for one substantial background goal. ' +
          'The server supplies tenant, conversation, execution policy, run identity, and specialist selection.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            goal: {
              type: 'string',
              minLength: 10,
              maxLength: 2000,
              description: 'A self-contained, multi-step background goal for the specialist team.',
            },
          },
          required: ['goal'],
        },
      }] : []),
      ...(args.floorManagerEligible ? [
        {
          type: 'function' as const,
          name: 'get_specialist_status' as const,
          description: 'Get the latest conversation-bound specialist task status. The server resolves the task; no run id is accepted.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
        {
          type: 'function' as const,
          name: 'cancel_specialist_task' as const,
          description: 'Stop the current active conversation-bound specialist task after an explicit user request. The server resolves the task; no run id is accepted.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {},
            required: [],
          },
        },
      ] : []),
    ],
    tool_choice: 'auto',
  };
}
