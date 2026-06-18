/**
 * Tests for `buildIntegrationSearchTools` in
 * `lib/integrations/agent-search-tools.ts` — the two meta-tools the chat
 * agent carries instead of the whole Composio catalog:
 *   - find_integration_tool(query)      → search connected apps
 *   - call_integration_tool(slug, args) → execute one action by slug
 *
 * Safety-critical surface: `call_integration_tool` MUST gate per action
 * exactly like the old per-action path (`actionNeedsApproval`), so a send
 * still prompts the realtor and a read runs straight through. The rest is
 * robustness: bad JSON, empty slug, execute failure, and result truncation
 * must all return a structured error string, never throw into the loop.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunContext } from '@openai/agents';

const {
  searchIntegrationActionsMock,
  executeToolForEntityMock,
  actionNeedsApprovalMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  searchIntegrationActionsMock: vi.fn(),
  executeToolForEntityMock: vi.fn(),
  actionNeedsApprovalMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@/lib/integrations/search', () => ({
  searchIntegrationActions: searchIntegrationActionsMock,
}));

vi.mock('@/lib/integrations/composio', () => ({
  executeToolForEntity: executeToolForEntityMock,
}));

vi.mock('@/lib/integrations/agent-tools', () => ({
  actionNeedsApproval: actionNeedsApprovalMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: loggerWarnMock, info: vi.fn(), debug: vi.fn() },
}));

import { buildIntegrationSearchTools } from '@/lib/integrations/agent-search-tools';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_clerk_123',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_db_1' },
    signal: new AbortController().signal,
  };
}

function tools() {
  const [find, call] = buildIntegrationSearchTools(makeCtx()) as Array<{
    name: string;
    type: string;
    invoke: (ctx: RunContext, input: string) => Promise<string>;
    needsApproval: (ctx: RunContext, input: unknown) => Promise<boolean>;
  }>;
  return { find, call };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchIntegrationActionsMock.mockResolvedValue([]);
  executeToolForEntityMock.mockResolvedValue({ successful: true, data: {} });
  actionNeedsApprovalMock.mockReturnValue(false);
});

describe('buildIntegrationSearchTools — shape', () => {
  it('returns exactly the two meta-tools, named for discovery', () => {
    const { find, call } = tools();
    expect(find.name).toBe('find_integration_tool');
    expect(call.name).toBe('call_integration_tool');
    expect(find.type).toBe('function');
    expect(call.type).toBe('function');
  });

  it('does not call Composio at build time — search only fires on use', () => {
    buildIntegrationSearchTools(makeCtx());
    expect(searchIntegrationActionsMock).not.toHaveBeenCalled();
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });
});

describe('find_integration_tool', () => {
  it('never needs approval — searching is free and read-only', async () => {
    const { find } = tools();
    await expect(find.needsApproval(new RunContext(), { query: 'send email' })).resolves.toBe(false);
  });

  it('searches the connected apps and returns the matches as JSON', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      { slug: 'GMAIL_SEND_EMAIL', name: 'Send Email', description: 'd', parameters: { type: 'object' }, toolkit: 'gmail' },
    ]);
    const { find } = tools();
    const out = await find.invoke(new RunContext(), JSON.stringify({ query: 'send an email', limit: 5 }));
    expect(searchIntegrationActionsMock).toHaveBeenCalledWith({
      spaceId: 'space_1',
      userId: 'user_clerk_123',
      query: 'send an email',
      limit: 5,
    });
    expect(JSON.parse(out).tools[0].slug).toBe('GMAIL_SEND_EMAIL');
  });

  it('clamps the limit to 1..10', async () => {
    const { find } = tools();
    await find.invoke(new RunContext(), JSON.stringify({ query: 'x', limit: 99 }));
    expect(searchIntegrationActionsMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    await find.invoke(new RunContext(), JSON.stringify({ query: 'x', limit: 0 }));
    expect(searchIntegrationActionsMock).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }));
  });

  it('rejects an empty query without hitting Composio', async () => {
    const { find } = tools();
    const out = await find.invoke(new RunContext(), JSON.stringify({ query: '   ' }));
    expect(JSON.parse(out)).toEqual({ tools: [], error: 'query is required' });
    expect(searchIntegrationActionsMock).not.toHaveBeenCalled();
  });

  it('returns a steer-the-model note (not an error) when nothing matches', async () => {
    searchIntegrationActionsMock.mockResolvedValue([]);
    const { find } = tools();
    const out = await find.invoke(new RunContext(), JSON.stringify({ query: 'order a pizza' }));
    const parsed = JSON.parse(out);
    expect(parsed.tools).toEqual([]);
    expect(parsed.note).toMatch(/do not retry endlessly/i);
  });

  it('degrades to an empty result (not a throw) when search blows up', async () => {
    searchIntegrationActionsMock.mockRejectedValue(new Error('composio down'));
    const { find } = tools();
    const out = await find.invoke(new RunContext(), JSON.stringify({ query: 'send email' }));
    expect(JSON.parse(out)).toEqual({ tools: [], error: 'search failed' });
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});

describe('call_integration_tool — approval parity', () => {
  it('gates a send and derives the toolkit from the slug', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    const { call } = tools();
    const approves = await call.needsApproval(new RunContext(), { slug: 'GMAIL_SEND_EMAIL', arguments_json: '{}' });
    expect(approves).toBe(true);
    // toolkitFromSlug(GMAIL_SEND_EMAIL) === 'gmail'
    expect(actionNeedsApprovalMock).toHaveBeenCalledWith('GMAIL_SEND_EMAIL', 'gmail');
  });

  it('lets a read run without approval', async () => {
    actionNeedsApprovalMock.mockReturnValue(false);
    const { call } = tools();
    const approves = await call.needsApproval(new RunContext(), { slug: 'GMAIL_FETCH_EMAILS', arguments_json: '{}' });
    expect(approves).toBe(false);
    expect(actionNeedsApprovalMock).toHaveBeenCalledWith('GMAIL_FETCH_EMAILS', 'gmail');
  });

  it('resolves a MULTI-WORD toolkit from the connected list, not the slug split', async () => {
    // microsoft_teams is a `messaging` toolkit (always-gate, even reads).
    // Splitting on the first underscore yields 'microsoft' and misses the
    // gate; resolving against the connected toolkits keeps it correct.
    actionNeedsApprovalMock.mockReturnValue(true);
    const [, call] = buildIntegrationSearchTools(makeCtx(), ['gmail', 'microsoft_teams']) as Array<{
      needsApproval: (c: RunContext, i: unknown) => Promise<boolean>;
    }>;
    await call.needsApproval(new RunContext(), { slug: 'MICROSOFT_TEAMS_GET_CHANNEL', arguments_json: '{}' });
    expect(actionNeedsApprovalMock).toHaveBeenCalledWith('MICROSOFT_TEAMS_GET_CHANNEL', 'microsoft_teams');
  });
});

describe('call_integration_tool — execution', () => {
  it('parses arguments_json and executes the action against the realtor entity', async () => {
    executeToolForEntityMock.mockResolvedValue({ successful: true, data: { id: 'msg_1' } });
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_SEND_EMAIL', arguments_json: JSON.stringify({ to: 'a@b.com' }) }),
    );
    expect(executeToolForEntityMock).toHaveBeenCalledWith({
      entityId: 'user_clerk_123',
      slug: 'GMAIL_SEND_EMAIL',
      arguments: { to: 'a@b.com' },
    });
    expect(JSON.parse(out)).toEqual({ ok: true, data: { id: 'msg_1' } });
  });

  it('rejects a missing slug', async () => {
    const { call } = tools();
    const out = await call.invoke(new RunContext(), JSON.stringify({ slug: '  ', arguments_json: '{}' }));
    expect(JSON.parse(out)).toEqual({ ok: false, error: 'slug is required' });
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('rejects malformed arguments JSON before calling Composio', async () => {
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_SEND_EMAIL', arguments_json: '{not json' }),
    );
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/bad arguments JSON/i);
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed action as ok:false with the slug in the message', async () => {
    executeToolForEntityMock.mockResolvedValue({ successful: false, error: 'recipient rejected' });
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_SEND_EMAIL', arguments_json: '{}' }),
    );
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('GMAIL_SEND_EMAIL');
    expect(parsed.error).toContain('recipient rejected');
  });

  it('catches a thrown execute so the loop never sees a stack trace', async () => {
    executeToolForEntityMock.mockRejectedValue(new Error('network blip'));
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_SEND_EMAIL', arguments_json: '{}' }),
    );
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('network blip');
    expect(loggerWarnMock).toHaveBeenCalled();
  });

  it('truncates a huge result so it cannot blow up the next step', async () => {
    executeToolForEntityMock.mockResolvedValue({ successful: true, data: { blob: 'x'.repeat(20_000) } });
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_FETCH_EMAILS', arguments_json: '{}' }),
    );
    expect(out.length).toBeLessThan(5_000);
    expect(out).toMatch(/truncated/i);
  });
});
