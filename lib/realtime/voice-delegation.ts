import crypto from 'crypto';

const UUID_NAMESPACE_BYTES = 16;

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
    name: 'start_work_session';
    description: string;
    parameters: Record<string, unknown>;
  }>;
  tool_choice: 'auto';
}

export function buildVoiceRealtimeSessionConfig(args: {
  workspaceName: string;
  conversationAttached: boolean;
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
      'Never claim the work started until the function returns ok=true.',
      'Use plan_first unless the user clearly says to proceed without waiting for plan approval.',
      'This voice capability cannot send messages or change CRM records. Say so plainly if asked.',
      'After a successful function call, tell the user the work is running in the conversation and that they can close voice mode.',
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
    ],
    tool_choice: 'auto',
  };
}
