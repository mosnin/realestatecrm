import crypto from 'crypto';

const UUID_NAMESPACE_BYTES = 16;

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
  kind: 'session' | 'user-message' | 'assistant-message',
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
    name: 'start_work_session' | 'continue_workspace_run' | 'get_specialist_status' | 'cancel_specialist_task';
    description: string;
    parameters: Record<string, unknown>;
  }>;
  tool_choice: 'auto';
}

export function buildVoiceRealtimeSessionConfig(args: {
  workspaceName: string;
  conversationAttached: boolean;
  workspaceContinuationEligible?: boolean;
  floorManagerEligible?: boolean;
}): VoiceRealtimeSessionConfig {
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
      ...(args.floorManagerEligible ? [
        'When the user asks how the latest specialist task in this conversation is doing, call get_specialist_status.',
        'Only when the user explicitly asks to stop the current specialist task, call cancel_specialist_task.',
        'Never ask for, accept, or provide a specialist run id. The server resolves the exact conversation-linked task.',
      ] : []),
      'For start_work_session, say a new background session started only when that call returns ok=true.',
      ...(args.workspaceContinuationEligible ? ['For continue_workspace_run, say the Workspace continuation started only when that call returns ok=true.'] : []),
      ...(args.floorManagerEligible ? [
        'For get_specialist_status, report only the returned coarse status facts. Never call the task running unless active=true.',
        'For cancel_specialist_task, say it stopped only when outcome=cancelled; describe already_terminal or no_run truthfully.',
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
