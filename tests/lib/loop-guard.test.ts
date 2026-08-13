/**
 * Tests for `withLoopGuard` (lib/ai-tools/loop-guard.ts) — the per-turn
 * code-level control that stops the chat model from re-calling the same tool
 * with the same args and burning the turn budget.
 *
 * Contract:
 *   - the first `maxIdentical` identical calls execute for real
 *   - the next identical call short-circuits (no execute) with a steer note
 *   - different args / different tools are counted separately
 *   - arg key order doesn't matter ({a,b} == {b,a})
 *   - it mutates invoke in place and leaves the other tool props intact
 *
 * Note: the guard REPLACES `invoke`, so we assert on a separate `exec` spy that
 * the original invoke delegates to — that's the real execution count.
 */

import { describe, it, expect, vi } from 'vitest';
import { withLoopGuard } from '@/lib/ai-tools/loop-guard';
import type { Tool as SdkTool } from '@openai/agents';

/** Minimal function-tool stand-in. `exec` is the real work; the guard wraps
 *  the invoke that calls it, so `exec.mock.calls` = actual executions. */
function fakeTool(name: string) {
  const exec = vi.fn(async (_input: string) => 'ok');
  const tool = {
    type: 'function',
    name,
    description: `${name} desc`,
    needsApproval: async () => false,
    invoke: async (_ctx: unknown, input: string) => exec(input),
  };
  return { tool: tool as unknown as SdkTool, exec };
}

const RUN = {}; // stand-in RunContext; the guard passes it straight through

/** Invoke a guarded tool (typed loosely — the guard mutated invoke). */
function invoke(tool: SdkTool, input: string): Promise<string> {
  return (tool as unknown as { invoke: (c: unknown, i: string) => Promise<string> }).invoke(RUN, input);
}

describe('withLoopGuard', () => {
  it('runs the first maxIdentical identical calls, then short-circuits the next', async () => {
    const { tool, exec } = fakeTool('list_contacts');
    const [g] = withLoopGuard([tool], { maxIdentical: 2 });

    const a = await invoke(g, JSON.stringify({ scoreLabel: 'hot' }));
    const b = await invoke(g, JSON.stringify({ scoreLabel: 'hot' }));
    const c = await invoke(g, JSON.stringify({ scoreLabel: 'hot' }));

    expect(a).toBe('ok');
    expect(b).toBe('ok');
    // 3rd identical call never reached the real tool.
    expect(exec).toHaveBeenCalledTimes(2);
    const parsed = JSON.parse(c);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/loop guard/i);
    expect(parsed.error).toContain('list_contacts');
  });

  it('treats different arguments as separate calls', async () => {
    const { tool, exec } = fakeTool('find_person');
    const [g] = withLoopGuard([tool], { maxIdentical: 1 });

    await invoke(g, JSON.stringify({ name: 'Sam' }));
    await invoke(g, JSON.stringify({ name: 'Alex' }));
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('hashes args order-independently ({a,b} === {b,a})', async () => {
    const { tool, exec } = fakeTool('send_email');
    const [g] = withLoopGuard([tool], { maxIdentical: 1 });

    await invoke(g, JSON.stringify({ to: 'a@b.com', subject: 'hi' }));
    const second = await invoke(g, JSON.stringify({ subject: 'hi', to: 'a@b.com' }));

    expect(exec).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second).ok).toBe(false);
  });

  it('allows create_plan once and blocks the second call even when its payload changes', async () => {
    const { tool, exec } = fakeTool('create_plan');
    const [g] = withLoopGuard([tool]);

    await invoke(g, JSON.stringify({
      task: 'Rank the people',
      steps: [{ title: 'Read', description: 'Read the book.' }],
    }));
    const second = await invoke(g, JSON.stringify({
      steps: [{ description: 'Read every person.', title: 'Read' }],
      task: 'Rank all the people',
    }));

    expect(exec).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second)).toMatchObject({ ok: false });
    expect(JSON.parse(second).error).toMatch(/only be called once per turn/i);
  });

  it('counts each tool independently', async () => {
    const a = fakeTool('tool_a');
    const b = fakeTool('tool_b');
    const [ga, gb] = withLoopGuard([a.tool, b.tool], { maxIdentical: 1 });

    await invoke(ga, '{}');
    await invoke(gb, '{}'); // same args, different tool → not a repeat
    expect(a.exec).toHaveBeenCalledTimes(1);
    expect(b.exec).toHaveBeenCalledTimes(1);
  });

  it('passes non-JSON args through and still guards on the raw string', async () => {
    const { tool, exec } = fakeTool('weird');
    const [g] = withLoopGuard([tool], { maxIdentical: 1 });
    await invoke(g, 'not json');
    const second = await invoke(g, 'not json');
    expect(exec).toHaveBeenCalledTimes(1);
    expect(JSON.parse(second).ok).toBe(false);
  });

  it('leaves non-function tools (no invoke) untouched', () => {
    const passthrough = { type: 'hosted_tool', name: 'web_search' } as unknown as SdkTool;
    const out = withLoopGuard([passthrough]);
    expect(out[0]).toBe(passthrough);
  });

  it('preserves the other tool properties (mutates invoke in place)', async () => {
    const { tool } = fakeTool('list_files');
    const out = withLoopGuard([tool]);
    // Same object identity, name + approval intact.
    expect(out[0]).toBe(tool);
    expect((out[0] as unknown as { name: string }).name).toBe('list_files');
    await expect(
      (out[0] as unknown as { needsApproval: () => Promise<boolean> }).needsApproval(),
    ).resolves.toBe(false);
  });
});
