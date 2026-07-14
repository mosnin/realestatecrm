/**
 * Self-critique revision pass in composeDraftWithOpenAI.
 *
 * Proves the wiring: a slop-laden email draft is run back through the model
 * once and the cleaner rewrite is what comes out; a clean draft is returned
 * as-is with NO second call; and a failed/non-improving revision falls back to
 * the original. Notes skip the pass entirely.
 *
 * The OpenAI client is mocked at the `@/lib/llm` boundary so we control both
 * the compose response and the revision response turn by turn.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@/lib/llm', () => ({
  getLLMClient: () => ({ chat: { completions: { create: createMock } } }),
  hasLLMKey: () => true,
  openaiModel: (n: string) => n,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { composeDraftWithOpenAI } from '@/lib/agent/quick-draft';

function reply(obj: Record<string, unknown>) {
  return { choices: [{ message: { content: JSON.stringify(obj) } }] };
}

const baseArgs = {
  intent: 'check-in' as const,
  channel: 'email' as const,
  subjectLabel: 'Chen',
  recentActivity: [] as string[],
  daysQuiet: 3,
  voiceSamples: [],
};

beforeEach(() => {
  createMock.mockReset();
});

describe('composeDraftWithOpenAI — voice self-critique', () => {
  it('rejects an unsupported inventory/prior-conversation claim and pins the grounding prompt', async () => {
    createMock.mockResolvedValueOnce(
      reply({
        subject: 'A few options',
        body: 'I found two new listings based on what we discussed.',
      }),
    );

    await expect(composeDraftWithOpenAI(baseArgs)).resolves.toBeNull();
    expect(createMock).toHaveBeenCalledOnce();
    const request = (createMock.mock.calls[0] as unknown as [
      { messages: Array<{ role: string; content: string }> },
    ])[0];
    expect(request.messages[0]?.content).toMatch(/Use ONLY facts explicitly present/i);
    expect(request.messages[0]?.content).toMatch(/do not fill gaps/i);
  });

  it('keeps a guarded claim when the same fact exists in recent activity', async () => {
    createMock.mockResolvedValueOnce(
      reply({
        subject: 'Two new options',
        body: 'I found two new listings that match your search.',
      }),
    );

    const out = await composeDraftWithOpenAI({
      ...baseArgs,
      recentActivity: ['I found two new listings that match the search.'],
    });
    expect(out?.body).toContain('two new listings');
  });

  it('keeps a foreground compose alive for 15 seconds before aborting', async () => {
    vi.useFakeTimers();
    try {
      createMock.mockImplementationOnce(
        (_request: unknown, options: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );

      let settled = false;
      const pending = composeDraftWithOpenAI(baseArgs).finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBeNull();
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('revises a slop draft and returns the cleaner rewrite', async () => {
    createMock
      .mockResolvedValueOnce(
        reply({
          subject: 'Quick check-in',
          body: 'I hope this email finds you well. Let me know if you have any questions.',
        }),
      )
      .mockResolvedValueOnce(
        reply({
          subject: 'Quick check-in',
          body: 'Wanted to check in on the Chen deal. Anything you need from me this week?',
        }),
      );

    const out = await composeDraftWithOpenAI(baseArgs);
    expect(out).not.toBeNull();
    expect(out!.body).toBe(
      'Wanted to check in on the Chen deal. Anything you need from me this week?',
    );
    // Compose + one revision pass.
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT call the model a second time when the draft is already clean', async () => {
    createMock.mockResolvedValueOnce(
      reply({ subject: 'Quick check-in', body: 'Tuesday at 3 works. See you there.' }),
    );
    const out = await composeDraftWithOpenAI(baseArgs);
    expect(out!.body).toBe('Tuesday at 3 works. See you there.');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the original when the revision does not actually reduce slop', async () => {
    createMock
      .mockResolvedValueOnce(reply({ subject: 's', body: 'Happy to help with the comps.' }))
      // Revision still contains a tell (em dash) — no net improvement.
      .mockResolvedValueOnce(reply({ subject: 's', body: 'Glad to assist — comps attached.' }));
    const out = await composeDraftWithOpenAI(baseArgs);
    expect(out!.body).toBe('Happy to help with the comps.');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the original when the revision call throws', async () => {
    createMock
      .mockResolvedValueOnce(reply({ subject: 's', body: 'Happy to help with the comps.' }))
      .mockRejectedValueOnce(new Error('revision boom'));
    const out = await composeDraftWithOpenAI(baseArgs);
    expect(out!.body).toBe('Happy to help with the comps.');
  });

  it('does not run the revision pass for note channel', async () => {
    createMock.mockResolvedValueOnce(
      reply({ subject: null, body: 'Called Chen. Wants to revisit pricing — next week.' }),
    );
    const out = await composeDraftWithOpenAI({ ...baseArgs, channel: 'note' });
    expect(out!.body).toBe('Called Chen. Wants to revisit pricing — next week.');
    // Note bodies are internal logs; even with an em dash present, no revision.
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
