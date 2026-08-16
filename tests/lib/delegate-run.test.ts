import { describe, expect, it, vi, beforeEach } from 'vitest';

const runMock = vi.hoisted(() => vi.fn());

vi.mock('@openai/agents', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openai/agents')>();
  return { ...actual, run: (...args: unknown[]) => runMock(...args) };
});

vi.mock('@/lib/ai-tools/agent-model', () => ({
  getAgentModel: () => 'test-model',
}));

import {
  buildDelegateChildPrompt,
  buildDelegateChildTools,
  DELEGATE_CHILD_MAX_TURNS,
  runDelegatedChildTurn,
} from '@/lib/ai-tools/delegate-run';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
    workMode: true,
  };
}

beforeEach(() => {
  runMock.mockReset();
});

describe('delegated specialist run', () => {
  it('gives the child more inner steps than the parent chat loop and no nested delegate', () => {
    expect(DELEGATE_CHILD_MAX_TURNS).toBeGreaterThanOrEqual(20);
    const names = buildDelegateChildTools(makeCtx(), 'Email Sarah and schedule a tour').map(
      (tool) => tool.name,
    );
    expect(names).not.toContain('delegate_task');
    expect(names).not.toContain('start_work_session');
    expect(names).toContain('send_email');
    expect(names).toContain('schedule_tour');
  });

  it('briefs the child with the exact goal and no parent transcript', () => {
    const goal = 'Rank my hottest buyers and draft a Friday follow-up plan.';
    const prompt = buildDelegateChildPrompt(makeCtx(), goal);
    expect(prompt).toContain(goal);
    expect(prompt).toContain('dense briefing');
    expect(prompt).not.toContain('Active Work goal');
  });

  it('waits for the child briefing and heartbeats progress', async () => {
    const onProgress = vi.fn();
    async function* stream() {
      yield {
        type: 'run_item_stream_event',
        name: 'tool_called',
        item: { rawItem: { callId: 'c1', name: 'list_contacts', arguments: '{}' } },
      };
    }
    runMock.mockResolvedValue({
      toStream: () => stream(),
      completed: Promise.resolve(),
      finalOutput: 'Jane is hot. Last touch March 3. Recommend a Friday call.',
    });

    const out = await runDelegatedChildTurn({
      ctx: { ...makeCtx(), onProgress },
      goal: 'Who should I call first this week?',
    });

    expect(out.ok).toBe(true);
    expect(out.summary).toContain('Jane is hot');
    expect(out.toolNames).toEqual(['list_contacts']);
    expect(onProgress).toHaveBeenCalledWith('Specialist started');
    expect(onProgress).toHaveBeenCalledWith('Specialist: list contacts');
    expect(runMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ maxTurns: DELEGATE_CHILD_MAX_TURNS, stream: true }),
    );
  });
});
