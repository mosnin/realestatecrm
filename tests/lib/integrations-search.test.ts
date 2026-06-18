/**
 * Tests for `searchIntegrationActions` in `lib/integrations/search.ts` —
 * the on-demand search behind the chat agent's `find_integration_tool`.
 *
 * This is the load-bearing half of the token redesign: instead of shipping
 * every connected toolkit's action schemas on every turn, the model searches
 * here and gets back only the handful that match. The contract:
 *   - never touch Composio when it can't help (unconfigured, zero toolkits)
 *   - never crash the turn (a dead toolkit is skipped, not fatal)
 *   - rank the obvious match first (slug/name beat description)
 *   - the `slugs` path is an exact fetch (curated/build-time), no scoring
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  composioConfiguredMock,
  activeToolkitsMock,
  getComposioMock,
  getRawComposioToolsMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  composioConfiguredMock: vi.fn(() => true),
  activeToolkitsMock: vi.fn(),
  getComposioMock: vi.fn(),
  getRawComposioToolsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
  getComposio: getComposioMock,
}));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: loggerWarnMock, info: vi.fn(), debug: vi.fn() },
}));

import { searchIntegrationActions } from '@/lib/integrations/search';

const GMAIL_SEND = {
  slug: 'GMAIL_SEND_EMAIL',
  name: 'Send Email',
  description: 'Send an email from the connected Gmail account.',
  inputParameters: {
    type: 'object' as const,
    properties: { to: { type: 'string' }, body: { type: 'string' } },
    required: ['to'],
  },
};
const GMAIL_FETCH = {
  slug: 'GMAIL_FETCH_EMAILS',
  name: 'Fetch Emails',
  description: 'Fetch emails from the inbox.',
};
const SLACK_SEND = {
  slug: 'SLACK_SEND_MESSAGE',
  name: 'Send Message',
  description: 'Post a message to a Slack channel.',
};

beforeEach(() => {
  vi.clearAllMocks();
  composioConfiguredMock.mockReturnValue(true);
  activeToolkitsMock.mockResolvedValue([]);
  getComposioMock.mockReturnValue({ tools: { getRawComposioTools: getRawComposioToolsMock } });
  getRawComposioToolsMock.mockResolvedValue([]);
});

describe('searchIntegrationActions — short-circuits (no wasted Composio calls)', () => {
  it('returns [] when Composio is not configured — never looks up toolkits', async () => {
    composioConfiguredMock.mockReturnValue(false);
    const out = await searchIntegrationActions({ spaceId: 's_1', userId: 'u_1', query: 'send email' });
    expect(out).toEqual([]);
    expect(activeToolkitsMock).not.toHaveBeenCalled();
    expect(getComposioMock).not.toHaveBeenCalled();
  });

  it('returns [] when the realtor has zero active toolkits — never calls Composio', async () => {
    activeToolkitsMock.mockResolvedValue([]);
    const out = await searchIntegrationActions({ spaceId: 's_1', userId: 'u_1', query: 'send email' });
    expect(out).toEqual([]);
    expect(getRawComposioToolsMock).not.toHaveBeenCalled();
  });

  it('returns [] AND logs when the toolkit lookup throws — the turn must survive', async () => {
    activeToolkitsMock.mockRejectedValue(new Error('db down'));
    const out = await searchIntegrationActions({ spaceId: 's_1', userId: 'u_1', query: 'send email' });
    expect(out).toEqual([]);
    expect(loggerWarnMock).toHaveBeenCalled();
    expect(getRawComposioToolsMock).not.toHaveBeenCalled();
  });
});

describe('searchIntegrationActions — natural-language scoring', () => {
  it('ranks the obvious match first and fetches per-toolkit', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    getRawComposioToolsMock.mockImplementation(async ({ toolkits }: { toolkits: string[] }) =>
      toolkits.includes('gmail') ? [GMAIL_SEND, GMAIL_FETCH] : [SLACK_SEND],
    );

    const out = await searchIntegrationActions({
      spaceId: 's_1',
      userId: 'u_1',
      query: 'send an email',
    });

    // The send-email action wins: full-name hit + token hits beat a
    // description-only or single-token match.
    expect(out[0].slug).toBe('GMAIL_SEND_EMAIL');
    expect(out.map((t) => t.slug)).toContain('SLACK_SEND_MESSAGE');
    // One fetch per active toolkit, each capped (so a giant toolkit can't
    // blow up the turn) but high enough to see real catalogs.
    expect(getRawComposioToolsMock).toHaveBeenCalledTimes(2);
    expect(getRawComposioToolsMock).toHaveBeenCalledWith({ toolkits: ['gmail'], limit: 200 });
  });

  it('respects the result limit', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    getRawComposioToolsMock.mockResolvedValue([GMAIL_SEND, GMAIL_FETCH]);
    const out = await searchIntegrationActions({
      spaceId: 's_1',
      userId: 'u_1',
      query: 'email',
      limit: 1,
    });
    expect(out).toHaveLength(1);
  });

  it('returns the documented match shape (slug, name, description, parameters, toolkit)', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    getRawComposioToolsMock.mockResolvedValue([GMAIL_SEND, GMAIL_FETCH]);
    const out = await searchIntegrationActions({ spaceId: 's_1', userId: 'u_1', query: 'send email' });
    const send = out.find((t) => t.slug === 'GMAIL_SEND_EMAIL')!;
    expect(send).toMatchObject({
      slug: 'GMAIL_SEND_EMAIL',
      name: 'Send Email',
      toolkit: 'gmail',
      parameters: { type: 'object', properties: { to: {}, body: {} }, required: ['to'] },
    });
    // An action with no inputParameters still gets a valid empty schema.
    const fetch = out.find((t) => t.slug === 'GMAIL_FETCH_EMAILS')!;
    expect(fetch.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('isolates a dead toolkit — the rest of the catalog still searches', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    getRawComposioToolsMock.mockImplementation(async ({ toolkits }: { toolkits: string[] }) => {
      if (toolkits.includes('gmail')) throw new Error('composio 503');
      return [SLACK_SEND];
    });

    const out = await searchIntegrationActions({ spaceId: 's_1', userId: 'u_1', query: 'send message' });

    expect(out.map((t) => t.slug)).toEqual(['SLACK_SEND_MESSAGE']);
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});

describe('searchIntegrationActions — exact slug fetch (curated path)', () => {
  it('returns the requested slugs in the order asked, no scoring', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    getRawComposioToolsMock.mockImplementation(async ({ toolkits }: { toolkits: string[] }) =>
      toolkits.includes('gmail') ? [GMAIL_SEND, GMAIL_FETCH] : [SLACK_SEND],
    );

    const out = await searchIntegrationActions({
      spaceId: 's_1',
      userId: 'u_1',
      // No query — slugs drive it. Order is preserved as given, not by toolkit.
      slugs: ['SLACK_SEND_MESSAGE', 'GMAIL_SEND_EMAIL'],
    });

    expect(out.map((t) => t.slug)).toEqual(['SLACK_SEND_MESSAGE', 'GMAIL_SEND_EMAIL']);
  });

  it('drops unknown slugs instead of inventing them', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    getRawComposioToolsMock.mockResolvedValue([GMAIL_SEND]);
    const out = await searchIntegrationActions({
      spaceId: 's_1',
      userId: 'u_1',
      slugs: ['GMAIL_SEND_EMAIL', 'NOTAREAL_ACTION'],
    });
    expect(out.map((t) => t.slug)).toEqual(['GMAIL_SEND_EMAIL']);
  });
});
