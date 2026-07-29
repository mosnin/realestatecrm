/**
 * `control_browser` tool — behavioral tests. Mocks '@/lib/browser-control/session'
 * (enqueueAction / awaitActionResult) and the '@/lib/supabase' User lookup that
 * resolves ctx.userId (Clerk id) to the internal User.id, then executes the
 * real tool handler and asserts on ToolResult (never on tool source text).
 *
 * Per CLAUDE.md honest-UI: a `no_session` enqueue result must produce a
 * summary that tells the realtor to connect the extension — never a summary
 * implying the action ran.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── @/lib/supabase — only used here to map ctx.userId (Clerk id) -> User.id,
//    mirrors the pattern in summarize-realtor.ts / analyze-realtor.ts.
const { supabaseFromMock } = vi.hoisted(() => ({ supabaseFromMock: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...a: unknown[]) => supabaseFromMock(...a) },
}));

// ── @/lib/browser-control/session — the dependency contract this tool imports.
const { enqueueActionMock, awaitActionResultMock } = vi.hoisted(() => ({
  enqueueActionMock: vi.fn(),
  awaitActionResultMock: vi.fn(),
}));
vi.mock('@/lib/browser-control/session', () => ({
  enqueueAction: (...a: unknown[]) => enqueueActionMock(...a),
  enqueueActionForSession: (...a: unknown[]) => enqueueActionMock(...a),
  awaitActionResult: (...a: unknown[]) => awaitActionResultMock(...a),
  // resolveBrowserRuntime (real, from the index barrel) calls these; default
  // to an active EXTENSION session so these tool tests exercise the normal
  // enqueue path (headless routing has its own tests in browser-routing.test.ts).
  getActiveSession: async () => ({ id: 'sess_ext', source: 'extension', status: 'active', spaceId: 'space_1', userId: 'user_1' }),
  getActiveExtensionSession: async () => ({ id: 'sess_ext', source: 'extension', status: 'active', spaceId: 'space_1', userId: 'user_1' }),
  startHeadlessSession: async () => ({ id: 'sess_hl', source: 'headless', status: 'active', spaceId: 'space_1', userId: 'user_1' }),
  endHeadlessSession: async () => undefined,
}));

import { controlBrowserTool } from '@/lib/ai-tools/tools/control-browser';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'clerk_1',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'owner_1' },
    signal: new AbortController().signal,
  };
}

/** Chainable Supabase-shaped mock resolving User lookups to a fixed db id. */
function mockUserLookup(dbUserId: string | null) {
  supabaseFromMock.mockImplementation((table: string) => {
    if (table !== 'User') throw new Error(`unexpected table ${table}`);
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    chain.select = vi.fn(passthrough);
    chain.eq = vi.fn(passthrough);
    chain.maybeSingle = vi.fn(async () => ({
      data: dbUserId ? { id: dbUserId } : null,
      error: null,
    }));
    return chain;
  });
}

beforeEach(() => {
  supabaseFromMock.mockReset();
  enqueueActionMock.mockReset();
  awaitActionResultMock.mockReset();
  mockUserLookup('user_1');
});

describe('controlBrowserTool', () => {
  it('is a mutating tool that always requires approval', () => {
    expect(controlBrowserTool.requiresApproval).toBe(true);
    expect(controlBrowserTool.rateLimit).toBeDefined();
  });

  it('rejects an action shape outside the closed allow-list (zod parse failure)', () => {
    const result = controlBrowserTool.parameters.safeParse({
      action: { type: 'eval', code: 'alert(1)' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a well-known type with a malformed payload', () => {
    const result = controlBrowserTool.parameters.safeParse({
      action: { type: 'navigate', url: 'not-a-url' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid navigate action', () => {
    const result = controlBrowserTool.parameters.safeParse({
      action: { type: 'navigate', url: 'https://example.com' },
    });
    expect(result.success).toBe(true);
  });

  it('summariseCall describes the action for the approval prompt', () => {
    const summary = controlBrowserTool.summariseCall!({
      action: { type: 'click', selector: '#submit' },
    } as never);
    expect(summary).toMatch(/#submit/);
  });

  it('returns an honest not-connected message when enqueueAction reports no_session — never implies the action ran', async () => {
    enqueueActionMock.mockResolvedValue({ error: 'no_session' });

    const result = await controlBrowserTool.handler(
      { action: { type: 'navigate', url: 'https://example.com' } },
      makeCtx(),
    );

    expect(enqueueActionMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      userId: 'user_1',
      sessionId: 'sess_ext',
      input: { type: 'navigate', url: 'https://example.com' },
    });
    expect(awaitActionResultMock).not.toHaveBeenCalled();
    expect(result.display).toBe('warning');
    expect(result.summary.toLowerCase()).toContain('extension');
    expect(result.summary.toLowerCase()).not.toContain('opened');
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });

  it('returns an honest blocked-url message when enqueueAction reports blocked_url', async () => {
    enqueueActionMock.mockResolvedValue({ error: 'blocked_url' });

    const result = await controlBrowserTool.handler(
      { action: { type: 'navigate', url: 'http://169.254.169.254/latest/meta-data' } },
      makeCtx(),
    );

    expect(awaitActionResultMock).not.toHaveBeenCalled();
    expect(result.display).toBe('error');
    expect(result.summary.toLowerCase()).toContain('blocked');
  });

  it('returns an honest timeout message when awaitActionResult times out (null)', async () => {
    enqueueActionMock.mockResolvedValue({ actionId: 'act_1' });
    awaitActionResultMock.mockResolvedValue(null);

    const result = await controlBrowserTool.handler(
      { action: { type: 'wait', ms: 500 } },
      makeCtx(),
    );

    expect(result.display).toBe('warning');
    expect(result.summary.toLowerCase()).toContain("didn't respond");
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });

  it('surfaces a failed extension result honestly', async () => {
    enqueueActionMock.mockResolvedValue({ actionId: 'act_1' });
    awaitActionResultMock.mockResolvedValue({ ok: false, error: 'selector not found' });

    const result = await controlBrowserTool.handler(
      { action: { type: 'click', selector: '#missing' } },
      makeCtx(),
    );

    expect(result.display).toBe('error');
    expect(result.summary).toContain('selector not found');
    expect((result.data as { ok: boolean }).ok).toBe(false);
  });

  it('returns the result summary + bounded dom text on a successful read_dom', async () => {
    enqueueActionMock.mockResolvedValue({ actionId: 'act_1' });
    awaitActionResultMock.mockResolvedValue({
      ok: true,
      summary: 'Read the page.',
      dom: 'Home | Listings | Contact',
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
    });

    const result = await controlBrowserTool.handler(
      { action: { type: 'read_dom', maxChars: 12000 } },
      makeCtx(),
    );

    expect(result.display).toBe('plain');
    expect(result.summary).toContain('Read the page.');
    const data = result.data as { ok: boolean; dom?: string; pageUrl?: string };
    expect(data.ok).toBe(true);
    expect(data.dom).toBe('Home | Listings | Contact');
    expect(data.pageUrl).toBe('https://example.com');
  });

  it('notes a screenshot was captured without inlining raw bytes into the model-facing data', async () => {
    enqueueActionMock.mockResolvedValue({ actionId: 'act_1' });
    awaitActionResultMock.mockResolvedValue({
      ok: true,
      summary: 'Captured screenshot.',
      screenshot: 'data:image/jpeg;base64,AAAA....',
    });

    const result = await controlBrowserTool.handler({ action: { type: 'screenshot' } }, makeCtx());

    expect(result.summary.toLowerCase()).toContain('screenshot');
    const data = result.data as { screenshotCaptured?: boolean };
    expect(data.screenshotCaptured).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('base64');
  });

  it('fails closed with an error summary when the caller cannot be resolved to a User row', async () => {
    mockUserLookup(null);

    const result = await controlBrowserTool.handler(
      { action: { type: 'wait', ms: 100 } },
      makeCtx(),
    );

    expect(enqueueActionMock).not.toHaveBeenCalled();
    expect(result.display).toBe('error');
  });
});
