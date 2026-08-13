/**
 * Tests for `buildIntegrationSearchTools` in
 * `lib/integrations/agent-search-tools.ts` — the two meta-tools the chat
 * agent carries instead of the whole Composio catalog:
 *   - find_integration_tool(query)      → search connected apps
 *   - call_integration_tool(slug, args) → execute one action by slug
 *
 * Safety-critical surface: Chat preserves `actionNeedsApproval`; Work can
 * directly execute only the exact current-message action discovered in the
 * same turn. Unrelated/destructive writes fail before the provider without
 * producing an invisible approval pause. Rate limiting, compliance, and
 * idempotency remain ahead of the external effect. The rest is robustness:
 * bad JSON, empty slug, execute failure, and result truncation must all return
 * a structured error string, never throw into the loop.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunContext } from '@openai/agents';

const {
  searchIntegrationActionsMock,
  executeToolForEntityMock,
  actionNeedsApprovalMock,
  checkRateLimitMock,
  checkSendAllowedMock,
  withIdempotencyMock,
  idempotencyStore,
  loggerWarnMock,
} = vi.hoisted(() => ({
  searchIntegrationActionsMock: vi.fn(),
  executeToolForEntityMock: vi.fn(),
  actionNeedsApprovalMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  checkSendAllowedMock: vi.fn(),
  withIdempotencyMock: vi.fn(),
  idempotencyStore: new Map<string, unknown>(),
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

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock('@/lib/messaging/compliance', () => ({
  checkSendAllowed: checkSendAllowedMock,
  withOptOutFooter: (body: string) => `${body}\n\nReply STOP to opt out.`,
}));

vi.mock('@/lib/agent/ts-idempotency', () => ({
  makeIdempotencyKey: (tool: string, space: string, ...args: string[]) =>
    `${tool}:${space}:${args.join(':')}`,
  withIdempotency: withIdempotencyMock,
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

function tools(opts: {
  ctx?: ToolContext;
  activeToolkits?: string[];
  userMessage?: string;
} = {}) {
  const [find, call] = buildIntegrationSearchTools(
    opts.ctx ?? makeCtx(),
    opts.activeToolkits ?? [],
    { userMessage: opts.userMessage },
  ) as Array<{
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
  checkRateLimitMock.mockResolvedValue({ allowed: true });
  checkSendAllowedMock.mockResolvedValue({ allowed: true });
  idempotencyStore.clear();
  withIdempotencyMock.mockImplementation(async (key: string, fn: () => Promise<unknown>) => {
    if (idempotencyStore.has(key)) return idempotencyStore.get(key);
    const result = await fn();
    idempotencyStore.set(key, result);
    return result;
  });
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

  it('lets an exact current-message Gmail send execute directly in Work mode', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email through Gmail.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const ctx = {
      ...makeCtx(),
      workMode: true,
      continuationIdempotencySeed: 'turn_1',
    };
    const { find, call } = tools({
      ctx,
      activeToolkits: ['gmail'],
      userMessage:
        'Send an email using Gmail to jane@example.com with subject "Tomorrow" and body "See you tomorrow."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));

    await expect(
      call.needsApproval(new RunContext(), {
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: '{}',
      }),
    ).resolves.toBe(false);
    await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({
          recipient_email: 'jane@example.com',
          subject: 'Tomorrow',
          body: 'See you tomorrow.',
        }),
      }),
    );

    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space_1',
        channel: 'email',
        address: 'jane@example.com',
        audience: 'consumer',
        category: 'marketing',
      }),
    );
    expect(executeToolForEntityMock).toHaveBeenCalledTimes(1);
  });

  it('fails an unrelated Work-mode write visibly instead of creating a hidden approval pause', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail', 'slack'],
      userMessage: 'Post the listing update in Slack.',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send email' }));

    await expect(
      call.needsApproval(new RunContext(), {
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: '{}',
      }),
    ).resolves.toBe(false);
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ recipient_email: 'jane@example.com' }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('does not treat email-address research as authorization to send email', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      userMessage: 'Email addresses in Gmail for the buyers we spoke to last week.',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'Gmail email addresses' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ recipient_email: 'jane@example.com' }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it.each([
    'Do not send an email using Gmail to jane@example.com with body "Hello Jane."',
    'How do I send an email using Gmail to jane@example.com with body "Hello Jane"?',
    'Summarize this instruction: Please send an email using Gmail to jane@example.com with body "Hello Jane."',
    'The client said: "Please send an email using Gmail to jane@example.com."',
    'Send me the latest email from jane@example.com using Gmail and summarize it as "Hello Jane."',
    'Send an email \'to hidden@example.com using Gmail with body "Hello."',
    'Send an email using Gmail not to jane@example.com with body "Hello Jane."',
    'Send an email not using Gmail to jane@example.com with body "Hello Jane."',
  ])('does not authorize negated, hypothetical, quoted, or summarized text: %s', async (userMessage) => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      userMessage,
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({
          recipient_email: 'jane@example.com',
          body: 'Hello Jane.',
        }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('does not turn a Slack history retrieval into a channel post', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'SLACK_SEND_MESSAGE',
        name: 'Send Message',
        description: 'Send a Slack message.',
        parameters: { type: 'object' },
        toolkit: 'slack',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['slack'],
      userMessage: 'Send me the Slack #sales history summarized as "New listing."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'Slack message' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'SLACK_SEND_MESSAGE',
        arguments_json: JSON.stringify({ channel: 'sales', text: 'New listing.' }),
      }),
    );
    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('binds a direct Work grant to every recipient and externally visible content field', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      userMessage:
        'Send an email using Gmail to jane@example.com with subject "Tomorrow" and body "Hello Jane."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
    const attempted = [
      { recipient_email: 'other@example.com', subject: 'Tomorrow', body: 'Hello Jane.' },
      { recipient_email: 'jane@example.com', subject: 'Tomorrow', body: 'Invented copy.' },
      {
        recipient_email: 'jane@example.com',
        bcc: ['hidden@example.com'],
        subject: 'Tomorrow',
        body: 'Hello Jane.',
      },
      {
        recipient_email: 'jane@example.com',
        subject: 'Tomorrow',
        body: 'Hello Jane.',
        html_content: '<p>Invented HTML</p>',
      },
    ];
    for (const input of attempted) {
      const out = await call.invoke(
        new RunContext(),
        JSON.stringify({
          slug: 'GMAIL_SEND_EMAIL',
          arguments_json: JSON.stringify(input),
        }),
      );
      expect(JSON.parse(out)).toEqual(
        expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
      );
    }
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('never derives an email target or provider from quoted outbound content', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const attempts = [
      {
        message:
          'Send an email using Gmail to jane@example.com with body "Please ask hidden@example.com to call."',
        input: {
          recipient_email: 'hidden@example.com',
          body: 'Please ask hidden@example.com to call.',
        },
      },
      {
        message:
          'Send an email to jane@example.com with body "Use Gmail for the follow-up."',
        input: {
          recipient_email: 'jane@example.com',
          body: 'Use Gmail for the follow-up.',
        },
      },
      {
        message:
          'Send an email using Gmail to me from jane@example.com with body "Hello Jane."',
        input: {
          recipient_email: 'jane@example.com',
          body: 'Hello Jane.',
        },
      },
    ];
    for (const attempt of attempts) {
      const { find, call } = tools({
        ctx: { ...makeCtx(), workMode: true },
        activeToolkits: ['gmail'],
        userMessage: attempt.message,
      });
      await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
      const out = await call.invoke(
        new RunContext(),
        JSON.stringify({
          slug: 'GMAIL_SEND_EMAIL',
          arguments_json: JSON.stringify(attempt.input),
        }),
      );
      expect(JSON.parse(out)).toEqual(
        expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
      );
    }
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('never derives an SMS target from quoted outbound content', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'TWILIO_SEND_SMS',
        name: 'Send SMS',
        description: 'Send an SMS.',
        parameters: { type: 'object' },
        toolkit: 'twilio',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['twilio'],
      userMessage:
        'Text +15551234567 using Twilio with message "Ask +15559876543 to call."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Twilio SMS' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'TWILIO_SEND_SMS',
        arguments_json: JSON.stringify({
          to: '+15559876543',
          message: 'Ask +15559876543 to call.',
        }),
      }),
    );
    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('never derives a Slack channel from quoted outbound content', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'SLACK_SEND_MESSAGE',
        name: 'Send Message',
        description: 'Send a Slack message.',
        parameters: { type: 'object' },
        toolkit: 'slack',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['slack'],
      userMessage: 'Post in Slack #sales: "Tell #finance the listing closed."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'post Slack update' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'SLACK_SEND_MESSAGE',
        arguments_json: JSON.stringify({
          channel: 'finance',
          text: 'Tell #finance the listing closed.',
        }),
      }),
    );
    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('does not choose between two provider accounts named in one request', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail', 'outlook'],
      userMessage:
        'Send an email from Gmail and via Outlook to jane@example.com with body "Hello Jane."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ recipient_email: 'jane@example.com', body: 'Hello Jane.' }),
      }),
    );
    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('keeps destructive integration actions blocked in Work even when the user names them', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_DELETE_EMAIL',
        name: 'Delete Email',
        description: 'Permanently delete an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      userMessage: 'Delete that email from Gmail.',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'delete Gmail email' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_DELETE_EMAIL', arguments_json: '{}' }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('requires same-turn discovery before a Work write can execute', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    const { call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      userMessage: 'Send an email using Gmail to jane@example.com with body "Hello Jane."',
    });
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ recipient_email: 'jane@example.com', body: 'Hello Jane.' }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('fails closed when a Work tool is rebuilt without a current-message grant', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      // Resume and rehydration callers deliberately provide no userMessage.
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ recipient_email: 'jane@example.com' }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_NOT_AUTHORIZED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
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
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ to: 'a@b.com' }),
      }),
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
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ to: 'a@b.com' }),
      }),
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

  it('rate-limits before provider execution', async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false });
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({ slug: 'GMAIL_FETCH_EMAILS', arguments_json: '{}' }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'RATE_LIMITED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('checks every to/cc/bcc recipient before an email provider effect', async () => {
    const { call } = tools();
    await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({
          to: ['to@example.com'],
          cc: [{ email: 'cc@example.com', name: 'CC' }],
          bcc: 'bcc@example.com',
          body: 'Update.',
        }),
      }),
    );

    expect(checkSendAllowedMock).toHaveBeenCalledTimes(3);
    expect(new Set(checkSendAllowedMock.mock.calls.map(([arg]) => arg.address))).toEqual(
      new Set(['to@example.com', 'cc@example.com', 'bcc@example.com']),
    );
    expect(executeToolForEntityMock).toHaveBeenCalledTimes(1);
  });

  it('blocks the whole provider call when any additional recipient fails compliance', async () => {
    checkSendAllowedMock.mockImplementation(async ({ address }: { address: string }) =>
      address === 'cc@example.com'
        ? { allowed: false, reason: 'suppressed', detail: 'Recipient opted out.' }
        : { allowed: true },
    );
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({
          to: 'to@example.com',
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          body: 'Update.',
        }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'COMPLIANCE_BLOCKED' }),
    );
    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ address: 'cc@example.com' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('rejects unknown recipient shapes instead of mistaking an address in the body for a target', async () => {
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({
          destination: 'jane@example.com',
          body: 'Ask jane@example.com about the listing.',
        }),
      }),
    );
    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'COMPLIANCE_BLOCKED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('applies messaging compliance to Chat replies outside the Work allowlist', async () => {
    checkSendAllowedMock.mockResolvedValueOnce({
      allowed: false,
      reason: 'suppressed',
      detail: 'Recipient opted out.',
    });
    const { call } = tools();
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_REPLY_TO_THREAD',
        arguments_json: JSON.stringify({ to: 'jane@example.com', body: 'Reply.' }),
      }),
    );
    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'COMPLIANCE_BLOCKED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('blocks a Work email send when messaging compliance denies it', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    checkSendAllowedMock.mockResolvedValueOnce({
      allowed: false,
      reason: 'suppressed',
      detail: 'Recipient opted out.',
    });
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true },
      activeToolkits: ['gmail'],
      userMessage: 'Send an email using Gmail to jane@example.com with body "Hello Jane."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
    const out = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'GMAIL_SEND_EMAIL',
        arguments_json: JSON.stringify({ recipient_email: 'jane@example.com', body: 'Hello Jane.' }),
      }),
    );

    expect(JSON.parse(out)).toEqual(
      expect.objectContaining({ ok: false, code: 'COMPLIANCE_BLOCKED' }),
    );
    expect(executeToolForEntityMock).not.toHaveBeenCalled();
  });

  it('runs SMS compliance and adds the marketing opt-out disclosure before Twilio', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'TWILIO_SEND_SMS',
        name: 'Send SMS',
        description: 'Send an SMS through Twilio.',
        parameters: { type: 'object' },
        toolkit: 'twilio',
      },
    ]);
    const { find, call } = tools({
      ctx: { ...makeCtx(), workMode: true, continuationIdempotencySeed: 'turn_sms' },
      activeToolkits: ['twilio'],
      userMessage: 'Text +15551234567 using Twilio with message "Open house tomorrow."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'send Twilio SMS' }));
    await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'TWILIO_SEND_SMS',
        arguments_json: JSON.stringify({ to: '+15551234567', message: 'Open house tomorrow.' }),
      }),
    );

    expect(checkSendAllowedMock).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'sms', address: '+15551234567' }),
    );
    expect(executeToolForEntityMock).toHaveBeenCalledWith({
      entityId: 'user_clerk_123',
      slug: 'TWILIO_SEND_SMS',
      arguments: {
        to: '+15551234567',
        message: 'Open house tomorrow.\n\nReply STOP to opt out.',
      },
    });
  });

  it('wraps Work writes in the cross-instance idempotency guard', async () => {
    actionNeedsApprovalMock.mockReturnValue(true);
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'SLACK_SEND_MESSAGE',
        name: 'Send Message',
        description: 'Send a Slack message.',
        parameters: { type: 'object' },
        toolkit: 'slack',
      },
    ]);
    const { find, call } = tools({
      ctx: {
        ...makeCtx(),
        workMode: true,
        continuationIdempotencySeed: 'turn_42',
      },
      activeToolkits: ['slack'],
      userMessage: 'Post in Slack #sales: "New listing."',
    });
    await find.invoke(new RunContext(), JSON.stringify({ query: 'post Slack update' }));
    await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'SLACK_SEND_MESSAGE',
        arguments_json: JSON.stringify({ channel: 'sales', text: 'New listing.' }),
      }),
    );
    const repeated = await call.invoke(
      new RunContext(),
      JSON.stringify({
        slug: 'SLACK_SEND_MESSAGE',
        arguments_json: JSON.stringify({ text: 'New listing.', channel: 'sales' }),
      }),
    );

    expect(withIdempotencyMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('integration_action:space_1:'),
      expect.any(Function),
    );
    expect(withIdempotencyMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(repeated)).toEqual(
      expect.objectContaining({ ok: false, code: 'WORK_ACTION_ALREADY_USED' }),
    );
    expect(executeToolForEntityMock).toHaveBeenCalledTimes(1);
  });

  it('uses a logical request seed that survives a fresh retry with a new turn id', async () => {
    searchIntegrationActionsMock.mockResolvedValue([
      {
        slug: 'GMAIL_SEND_EMAIL',
        name: 'Send Email',
        description: 'Send an email.',
        parameters: { type: 'object' },
        toolkit: 'gmail',
      },
    ]);
    const userMessage =
      'Send an email using Gmail to jane@example.com with body "Same retry-safe body."';
    for (const turnSeed of ['turn_first', 'turn_retry']) {
      const { find, call } = tools({
        ctx: {
          ...makeCtx(),
          conversationId: 'conv_1',
          workMode: true,
          continuationIdempotencySeed: turnSeed,
        },
        activeToolkits: ['gmail'],
        userMessage,
      });
      await find.invoke(new RunContext(), JSON.stringify({ query: 'send Gmail email' }));
      await call.invoke(
        new RunContext(),
        JSON.stringify({
          slug: 'GMAIL_SEND_EMAIL',
          arguments_json: JSON.stringify({
            recipient_email: 'jane@example.com',
            body: 'Same retry-safe body.',
          }),
        }),
      );
    }

    expect(withIdempotencyMock.mock.calls[0][0]).toBe(withIdempotencyMock.mock.calls[1][0]);
    expect(executeToolForEntityMock).toHaveBeenCalledTimes(1);
  });
});
