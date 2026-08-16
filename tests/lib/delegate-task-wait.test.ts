import { describe, expect, it, vi, beforeEach } from 'vitest';

const runDelegatedChildTurnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai-tools/delegate-run', () => ({
  runDelegatedChildTurn: (...args: unknown[]) => runDelegatedChildTurnMock(...args),
}));

vi.mock('@/lib/agent/kill-switch', () => ({
  assertSpaceEnabled: vi.fn(async () => undefined),
}));

import { buildDelegateTaskTool } from '@/lib/ai-tools/tools/delegate-task';
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
  runDelegatedChildTurnMock.mockReset();
});

describe('delegate_task waits for the specialist', () => {
  it('returns the child briefing instead of walking away after launch', async () => {
    runDelegatedChildTurnMock.mockResolvedValue({
      ok: true,
      summary: 'Called Jane. Tour booked Friday at 2pm.',
      toolNames: ['find_person', 'schedule_tour'],
    });
    const tool = buildDelegateTaskTool();
    const result = await tool.handler(
      { goal: 'Find Jane and book a Friday tour' },
      makeCtx(),
    );

    expect(runDelegatedChildTurnMock).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe('Called Jane. Tour booked Friday at 2pm.');
    expect(result.display).not.toBe('error');
    expect(result.summary).not.toMatch(/kicked it off/i);
    expect(result.summary).not.toMatch(/Working on it now/i);
  });

  it('surfaces a child failure so the parent can continue directly', async () => {
    runDelegatedChildTurnMock.mockResolvedValue({
      ok: false,
      summary: 'The specialist was stopped before it finished.',
      toolNames: [],
    });
    const tool = buildDelegateTaskTool();
    const result = await tool.handler({ goal: 'Audit the whole pipeline' }, makeCtx());
    expect(result.display).toBe('error');
    expect(result.summary).toContain('stopped');
  });
});
