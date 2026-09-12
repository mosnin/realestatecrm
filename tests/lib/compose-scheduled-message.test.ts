import { beforeEach, describe, expect, it, vi } from 'vitest';
const { create, spend, usage } = vi.hoisted(() => ({
  create: vi.fn(),
  spend: vi.fn(),
  usage: vi.fn(),
}));
vi.mock('@/lib/llm', () => ({
  getLLMClient: () => ({ chat: { completions: { create } } }),
  resolveChatModel: () => 'provider/model',
  usageAccountingParams: () => ({}),
}));
vi.mock('@/lib/billing/meter', () => ({ assertCanSpend: spend }));
vi.mock('@/lib/usage/record-chat-usage', () => ({ recordChatUsage: usage }));
import { composeScheduledMessage } from '@/lib/workflows/compose-message';
const input = {
  spaceId: 'space',
  scheduledMessageId: 'step-1',
  channel: 'email' as const,
  instruction: 'Ask whether they want to schedule a viewing',
  recipientName: 'Maya',
};
beforeEach(() => {
  vi.clearAllMocks();
  spend.mockResolvedValue(undefined);
  create.mockResolvedValue({
    id: 'completion-1',
    choices: [
      {
        message: {
          content: JSON.stringify({
            subject: 'Your viewing',
            body: 'Would you like to arrange a viewing?',
          }),
        },
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 24, cost: 0.0012 },
  });
});
describe('Scheduled message preparation', () => {
  it('returns finished content and accounts for actual provider usage', async () => {
    expect(await composeScheduledMessage(input)).toEqual({
      subject: 'Your viewing',
      body: 'Would you like to arrange a viewing?',
    });
    expect(spend).toHaveBeenCalledWith('space', 'chat_turn');
    expect(usage).toHaveBeenCalledWith(
      expect.objectContaining({
        costUsd: 0.0012,
        idempotencyKey: 'scheduled-compose:step-1:completion-1',
      }),
    );
    expect(create.mock.calls[0][0]).not.toHaveProperty('tools');
  });
  it('rejects unfinished content after still recording the consumed usage', async () => {
    create.mockResolvedValue({
      id: 'bad-1',
      choices: [
        {
          message: {
            content: JSON.stringify({
              subject: 'Hello',
              body: 'Hello [client name]',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0.0001 },
    });
    await expect(composeScheduledMessage(input)).rejects.toThrow(
      'unresolved placeholders',
    );
    expect(usage).toHaveBeenCalled();
  });
  it('stops before requesting the model when the workspace cannot spend', async () => {
    spend.mockRejectedValue(new Error('credits unavailable'));
    await expect(composeScheduledMessage(input)).rejects.toThrow(
      'credits unavailable',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
