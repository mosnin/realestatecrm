/**
 * Tests for `loadIntegrationMetaTools` in `lib/ai-tools/sdk-chat.ts` — the
 * chat path's integration loader AFTER the token redesign.
 *
 * The whole point of the redesign: the per-turn integration footprint is a
 * CONSTANT two meta-tools, no matter how many apps the realtor connected.
 * The old loader shipped ~30 action schemas per toolkit every step; this one
 * ships find_integration_tool + call_integration_tool and lets the model
 * search on demand. These tests pin that constant-footprint contract plus the
 * same "never crash the turn / degrade loudly" guarantees the old loader had.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  activeToolkitsMock,
  composioConfiguredMock,
  buildIntegrationSearchToolsMock,
  loggerWarnMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  activeToolkitsMock: vi.fn(),
  composioConfiguredMock: vi.fn(() => true),
  buildIntegrationSearchToolsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
  markExpiredByToolkit: vi.fn(),
}));

vi.mock('@/lib/integrations/composio', () => ({
  composioConfigured: composioConfiguredMock,
}));

vi.mock('@/lib/integrations/agent-tools', () => ({
  buildToolkitAgentTools: vi.fn(),
}));

vi.mock('@/lib/integrations/agent-search-tools', () => ({
  buildIntegrationSearchTools: buildIntegrationSearchToolsMock,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: loggerErrorMock, warn: loggerWarnMock, info: vi.fn(), debug: vi.fn() },
}));

import { loadIntegrationMetaTools } from '@/lib/ai-tools/sdk-chat';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(): ToolContext {
  return {
    userId: 'user_clerk_123',
    space: { id: 'space_1', slug: 'jane', name: 'Jane Realty', ownerId: 'u_db_1' },
    signal: new AbortController().signal,
  };
}

const META = [{ name: 'find_integration_tool' }, { name: 'call_integration_tool' }];

beforeEach(() => {
  vi.clearAllMocks();
  composioConfiguredMock.mockReturnValue(true);
  activeToolkitsMock.mockResolvedValue([]);
  buildIntegrationSearchToolsMock.mockReturnValue(META);
});

describe('loadIntegrationMetaTools — constant footprint', () => {
  it('attaches exactly two meta-tools no matter how many apps are connected', async () => {
    // Ten connected toolkits, still two tools. This is the redesign's whole
    // thesis: footprint is O(1) in the number of integrations, not O(actions).
    activeToolkitsMock.mockResolvedValue([
      'gmail', 'slack', 'hubspot', 'notion', 'googlecalendar',
      'twilio', 'linkedin', 'discord', 'googlesheets', 'reddit',
    ]);

    const out = await loadIntegrationMetaTools(makeCtx());

    expect(out.tools).toEqual(META);
    expect(buildIntegrationSearchToolsMock).toHaveBeenCalledTimes(1);
    // The prompt still learns every connected app (so it knows what's reachable).
    expect(out.liveToolkits).toHaveLength(10);
    expect(out.unavailableToolkits).toEqual([]);
  });

  it('passes the turn context AND connected toolkits through to the meta-tool builder', async () => {
    // The toolkit list is what lets call_integration_tool resolve the real
    // toolkit for the approval gate (multi-word toolkits like microsoft_teams).
    activeToolkitsMock.mockResolvedValue(['gmail', 'microsoft_teams']);
    const ctx = makeCtx();
    await loadIntegrationMetaTools(ctx);
    expect(buildIntegrationSearchToolsMock).toHaveBeenCalledWith(
      ctx,
      ['gmail', 'microsoft_teams'],
      { userMessage: undefined },
    );
  });

  it('passes only the exact fresh-turn message into connected-app authorization', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail']);
    const ctx = { ...makeCtx(), workMode: true };
    await loadIntegrationMetaTools(ctx, { userMessage: 'Send an email through Gmail.' });
    expect(buildIntegrationSearchToolsMock).toHaveBeenCalledWith(ctx, ['gmail'], {
      userMessage: 'Send an email through Gmail.',
    });
  });
});

describe('loadIntegrationMetaTools — short-circuits + loud degradation', () => {
  it('returns nothing when the realtor has zero toolkits — no meta-tools built', async () => {
    activeToolkitsMock.mockResolvedValue([]);
    const out = await loadIntegrationMetaTools(makeCtx());
    expect(out).toEqual({ tools: [], liveToolkits: [], unavailableToolkits: [] });
    expect(buildIntegrationSearchToolsMock).not.toHaveBeenCalled();
  });

  it('degrades loudly when Composio is unconfigured but apps are connected', async () => {
    // The misconfig that read as "Chippi lost my integrations": connected
    // toolkits but no API key. Report them as unavailable, not gone, and
    // do NOT attach meta-tools that would just fail.
    composioConfiguredMock.mockReturnValue(false);
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    const out = await loadIntegrationMetaTools(makeCtx());
    expect(out.tools).toEqual([]);
    expect(out.liveToolkits).toEqual([]);
    expect(out.unavailableToolkits).toEqual(['gmail', 'slack']);
    expect(loggerErrorMock).toHaveBeenCalled();
    expect(buildIntegrationSearchToolsMock).not.toHaveBeenCalled();
  });

  it('survives a toolkit-lookup failure — the turn keeps working on native tools', async () => {
    activeToolkitsMock.mockRejectedValue(new Error('db down'));
    const out = await loadIntegrationMetaTools(makeCtx());
    expect(out).toEqual({ tools: [], liveToolkits: [], unavailableToolkits: [] });
    expect(loggerWarnMock).toHaveBeenCalled();
    expect(buildIntegrationSearchToolsMock).not.toHaveBeenCalled();
  });
});
