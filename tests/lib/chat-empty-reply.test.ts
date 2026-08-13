/**
 * The direct chat path must never complete a turn silently.
 *
 * When the provider returns no visible text — thinking consumed the whole
 * completion budget, a filtered choice came back, an empty stream — the old
 * code pushed `turn_complete` with zero text deltas and skipped persistence
 * entirely. To the realtor that is indistinguishable from Chippi ignoring
 * them, and because nothing was saved the turn also disappeared on reload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runStreamMock, saveMock, recordUsageMock, retrieveMock, stopFlag } = vi.hoisted(() => ({
  runStreamMock: vi.fn(),
  saveMock: vi.fn(),
  recordUsageMock: vi.fn(),
  retrieveMock: vi.fn(),
  stopFlag: { value: false },
}));

vi.mock('@/lib/chat/direct-llm', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/chat/direct-llm')>('@/lib/chat/direct-llm');
  return { ...actual, runDirectChatStream: runStreamMock };
});
vi.mock('@/lib/ai-tools/persistence', () => ({ saveAssistantMessage: saveMock }));
vi.mock('@/lib/usage/record-chat-usage', () => ({ recordChatUsage: recordUsageMock }));
vi.mock('@/lib/chat/vector-context', () => ({ retrieveContext: retrieveMock }));
vi.mock('@/lib/chat/turn-presence', () => ({ markTurnEnded: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/chat/stop-signal', () => ({
  createStopPoller: () => async () => stopFlag.value,
}));

import { streamDirectTurn } from '@/lib/chat/direct-stream';
import { chippiErrorMessage } from '@/lib/ai-tools/chippi-voice';

const EMPTY_LINE = chippiErrorMessage('empty_reply');

function noUsage() {
  return { promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: undefined };
}

/** Read the whole SSE body and return the parsed frames. */
async function drain(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((raw) => JSON.parse(raw) as Record<string, unknown>);
}

function input(overrides: Partial<Parameters<typeof streamDirectTurn>[0]> = {}) {
  return {
    spaceId: 'space-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    model: 'test-model',
    userMessage: 'what is my pipeline worth?',
    history: [],
    attachments: [],
    abortController: new AbortController(),
    ...overrides,
  };
}

beforeEach(() => {
  runStreamMock.mockReset();
  saveMock.mockReset().mockResolvedValue(undefined);
  recordUsageMock.mockReset().mockResolvedValue(undefined);
  retrieveMock.mockReset().mockResolvedValue({ block: '' });
  stopFlag.value = false;
});

describe('direct path — empty provider reply', () => {
  it('says something instead of completing the turn silently', async () => {
    runStreamMock.mockResolvedValue({
      text: '',
      reasoningText: 'thought about it for a while',
      provider: 'openrouter',
      usage: noUsage(),
      fallbackNote: '',
    });

    const frames = await drain(streamDirectTurn(input()));

    const deltas = frames.filter((f) => f.type === 'text_delta').map((f) => f.delta);
    expect(deltas).toEqual([EMPTY_LINE]);
    expect(frames.at(-1)).toMatchObject({ type: 'turn_complete', reason: 'complete' });
  });

  it('persists the fallback so the turn survives a reload', async () => {
    runStreamMock.mockResolvedValue({
      text: '   ',
      reasoningText: '',
      provider: 'openrouter',
      usage: noUsage(),
      fallbackNote: '',
    });

    await drain(streamDirectTurn(input()));

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      spaceId: 'space-1',
      conversationId: 'conv-1',
      blocks: [{ type: 'text', content: EMPTY_LINE }],
    });
  });

  it('leaves a normal reply completely untouched', async () => {
    runStreamMock.mockImplementation(async (_opts: unknown, onDelta: (d: string) => void) => {
      onDelta('Your pipeline is worth $1.2M.');
      return {
        text: 'Your pipeline is worth $1.2M.',
        reasoningText: '',
        provider: 'openrouter',
        usage: noUsage(),
        fallbackNote: '',
      };
    });

    const frames = await drain(streamDirectTurn(input()));

    const deltas = frames.filter((f) => f.type === 'text_delta').map((f) => f.delta);
    expect(deltas.join('')).toBe('Your pipeline is worth $1.2M.');
    expect(deltas).not.toContain(EMPTY_LINE);
    expect(saveMock.mock.calls[0][0].blocks).toEqual([
      { type: 'text', content: 'Your pipeline is worth $1.2M.' },
    ]);
  });

  it('does not invent a reply for a turn the user stopped', async () => {
    // Stop aborts generation; an empty result there is the realtor's own
    // doing, not a provider failure, and saying "I came up empty" would be a
    // small lie about what happened.
    stopFlag.value = true;
    runStreamMock.mockResolvedValue({
      text: '',
      reasoningText: '',
      provider: 'openrouter',
      usage: noUsage(),
      fallbackNote: '',
    });

    const frames = await drain(streamDirectTurn(input()));

    expect(frames.filter((f) => f.type === 'text_delta')).toHaveLength(0);
    expect(frames.at(-1)).toMatchObject({ type: 'turn_complete', reason: 'aborted' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('does not acknowledge completion when the assistant transcript could not be persisted', async () => {
    const onSettled = vi.fn().mockResolvedValue(undefined);
    runStreamMock.mockResolvedValue({
      text: 'The analysis is ready.',
      reasoningText: '',
      provider: 'openrouter',
      usage: noUsage(),
      fallbackNote: '',
    });
    saveMock.mockRejectedValueOnce(new Error('database unavailable'));

    const frames = await drain(streamDirectTurn(input({ onSettled })));

    expect(frames.some((frame) => frame.type === 'turn_complete')).toBe(false);
    expect(frames.at(-1)).toMatchObject({ type: 'error', code: 'persistence' });
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      reason: 'persistence',
    }));
  });
});
