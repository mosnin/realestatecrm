/**
 * `control_browser` — end-to-end wiring test through the REAL registry
 * (lib/ai-tools/registry.ts → ALL_TOOLS → lib/ai-tools/execute.ts), unlike
 * tests/lib/control-browser-tool.test.ts which calls the tool's handler
 * directly. This proves the tool is actually reachable by name from the
 * catalog registration in lib/ai-tools/tools/index.ts, that
 * `toolRequiresApproval` gates every call (never auto-runs), and that the
 * shared `executeTool` pipeline (arg validation, per-tool rate limit,
 * handler invocation) behaves correctly for this specific tool.
 *
 * Mocks only the tool's own dependencies (browser-control/session, the
 * User lookup, and rate-limit's backing store) — the registry and
 * execute.ts run for real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabaseFromMock } = vi.hoisted(() => ({ supabaseFromMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => supabaseFromMock(...a) },
}));

const { enqueueActionMock, awaitActionResultMock } = vi.hoisted(() => ({
  enqueueActionMock: vi.fn(),
  awaitActionResultMock: vi.fn(),
}));
vi.mock('@/lib/browser-control/session', () => ({
  enqueueAction: (...a: unknown[]) => enqueueActionMock(...a),
  awaitActionResult: (...a: unknown[]) => awaitActionResultMock(...a),
}));

// Rate limit backing store isn't configured in tests (no Redis) — mock it
// directly so we control allow/deny deterministically instead of depending
// on the in-memory fallback's internal state across test runs.
let rateLimitAllowed = true;
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: 0, resetAt: 0 })),
}));

import { getTool, toolRequiresApproval } from '@/lib/ai-tools/registry';
import { executeTool } from '@/lib/ai-tools/execute';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'clerk_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'owner_1' },
    signal: new AbortController().signal,
  };
}

function mockUserLookup(dbUserId: string | null) {
  supabaseFromMock.mockImplementation((table: string) => {
    if (table !== 'User') throw new Error(`unexpected table ${table}`);
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.maybeSingle = vi.fn(async () => ({ data: dbUserId ? { id: dbUserId } : null, error: null }));
    return chain;
  });
}

beforeEach(() => {
  supabaseFromMock.mockReset();
  enqueueActionMock.mockReset();
  awaitActionResultMock.mockReset();
  rateLimitAllowed = true;
  mockUserLookup('user_1');
});

describe('control_browser — registry + execute wiring', () => {
  it('is reachable from the real ALL_TOOLS registry by name', () => {
    const tool = getTool('control_browser');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('control_browser');
  });

  it('always requires approval — toolRequiresApproval never auto-approves it', () => {
    const tool = getTool('control_browser')!;
    const approved = toolRequiresApproval(
      tool,
      { action: { type: 'read_dom', maxChars: 1000 } },
      makeCtx(),
    );
    expect(approved).toBe(true);
  });

  it('executeTool rejects an out-of-allow-list action with invalid_args (never reaches the handler)', async () => {
    const out = await executeTool('control_browser', { action: { type: 'run_js', code: '1' } }, makeCtx());
    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('invalid_args');
    expect(enqueueActionMock).not.toHaveBeenCalled();
  });

  it('executeTool runs the real handler end-to-end on valid args and honest no_session', async () => {
    enqueueActionMock.mockResolvedValue({ error: 'no_session' });

    const out = await executeTool(
      'control_browser',
      { action: { type: 'navigate', url: 'https://example.com' } },
      makeCtx(),
    );

    expect(out.ok).toBe(true);
    expect(out.result?.display).toBe('warning');
    expect(out.result?.summary.toLowerCase()).toContain('extension');
    expect(enqueueActionMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      userId: 'user_1',
      input: { type: 'navigate', url: 'https://example.com' },
    });
  });

  it('executeTool enforces the per-tool rate limit before the handler runs', async () => {
    rateLimitAllowed = false;

    const out = await executeTool('control_browser', { action: { type: 'wait', ms: 100 } }, makeCtx());

    expect(out.ok).toBe(false);
    expect(out.error?.code).toBe('rate_limited');
    expect(enqueueActionMock).not.toHaveBeenCalled();
  });

  it('executeTool succeeds end-to-end when the extension reports a real result', async () => {
    enqueueActionMock.mockResolvedValue({ actionId: 'act_1' });
    awaitActionResultMock.mockResolvedValue({ ok: true, summary: 'Clicked it.' });

    const out = await executeTool(
      'control_browser',
      { action: { type: 'click', x: 10, y: 20 } },
      makeCtx(),
    );

    expect(out.ok).toBe(true);
    expect(out.result?.summary).toContain('Clicked it.');
    expect((out.result?.data as { ok: boolean }).ok).toBe(true);
  });
});
