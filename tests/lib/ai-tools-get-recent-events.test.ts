/**
 * `get_recent_events` — the read-only tool that hands the agent the recent
 * connected-app activity Chippi already captured, so it can answer without
 * re-fetching from the live app.
 *
 * Coverage: read-only contract, space-scoping (the handler ignores anything
 * but ctx.space.id), the compact projection shape (app-name resolution,
 * relative age, truncation), the limit clamp, and the empty state.
 *
 * We mock `@/lib/integrations/events` directly — the tool delegates the actual
 * query to `listEvents`, and mocking it both keeps the test focused on the
 * tool's projection AND severs the triggers/composio import subtree (and any
 * `server-only` guard inside it) from this file's import graph.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listEventsMock } = vi.hoisted(() => ({
  listEventsMock: vi.fn(
    async (_args: { spaceId: string; limit: number; toolkit?: string }) =>
      [] as Array<Record<string, unknown>>,
  ),
}));
vi.mock('@/lib/integrations/events', () => ({
  listEvents: listEventsMock,
}));

import { getRecentEventsTool } from '@/lib/ai-tools/tools/get-recent-events';
import type { ToolContext } from '@/lib/ai-tools/types';

function makeCtx(spaceId = 'space_1'): ToolContext {
  return {
    userId: 'user_1',
    space: { id: spaceId, slug: 'jane', name: 'Jane Realty', ownerId: 'u1' },
    signal: new AbortController().signal,
  };
}

function feedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_1',
    connectionId: 'conn_1',
    toolkit: 'gmail',
    eventType: 'GMAIL_NEW_GMAIL_MESSAGE',
    title: 'Re: 1421 Maple offer',
    actor: 'jane@example.com',
    snippet: 'Looks good — when can we tour?',
    occurredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    status: 'dispatched',
    deliveryId: 'd_1',
    ...overrides,
  };
}

beforeEach(() => {
  listEventsMock.mockReset();
  listEventsMock.mockResolvedValue([]);
});

describe('getRecentEventsTool', () => {
  it('is read-only (no approval) and safe', () => {
    expect(getRecentEventsTool.requiresApproval).toBe(false);
    expect(getRecentEventsTool.riskLevel).toBe('safe');
    expect(getRecentEventsTool.name).toBe('get_recent_events');
  });

  it('scopes the query to ctx.space.id and ignores any other space', async () => {
    await getRecentEventsTool.handler({ limit: 15 }, makeCtx('space_owned'));
    expect(listEventsMock).toHaveBeenCalledTimes(1);
    expect(listEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space_owned' }),
    );
  });

  it('returns a compact projection: app name, type, actor, snippet, age, status', async () => {
    listEventsMock.mockResolvedValue([feedEvent()]);
    const res = await getRecentEventsTool.handler({ limit: 15 }, makeCtx());
    const data = res.data as unknown as { count: number; events: Array<Record<string, unknown>> };
    expect(data.count).toBe(1);
    const ev = data.events[0];
    expect(ev.app).toBe('Gmail'); // slug resolved to catalog display name
    expect(ev.toolkit).toBe('gmail');
    expect(ev.eventType).toBe('GMAIL_NEW_GMAIL_MESSAGE');
    expect(ev.actor).toBe('jane@example.com');
    expect(ev.snippet).toBe('Looks good — when can we tour?');
    expect(ev.status).toBe('dispatched');
    expect(ev.occurredAgo).toBe('2h ago');
    expect(typeof ev.occurredAt).toBe('string');
  });

  it('does NOT leak the raw payload (only the projected feed columns)', async () => {
    listEventsMock.mockResolvedValue([feedEvent()]);
    const res = await getRecentEventsTool.handler({ limit: 5 }, makeCtx());
    const data = res.data as unknown as { events: Array<Record<string, unknown>> };
    expect(data.events[0]).not.toHaveProperty('payload');
    expect(data.events[0]).not.toHaveProperty('id');
    expect(data.events[0]).not.toHaveProperty('connectionId');
  });

  it('passes a toolkit filter through to listEvents', async () => {
    listEventsMock.mockResolvedValue([feedEvent({ toolkit: 'slack' })]);
    await getRecentEventsTool.handler({ toolkit: 'slack', limit: 10 }, makeCtx());
    expect(listEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ toolkit: 'slack', limit: 10 }),
    );
  });

  it('clamps the limit to the hard cap (50)', async () => {
    await getRecentEventsTool.handler({ limit: 999 }, makeCtx());
    expect(listEventsMock.mock.calls[0][0].limit).toBe(50);
  });

  it('defaults the limit when none is provided', async () => {
    // Schema default applies at parse time; the handler also defends. Call the
    // handler with the parsed shape (default already filled) to mirror runtime.
    const parsed = getRecentEventsTool.parameters.parse({});
    await getRecentEventsTool.handler(parsed, makeCtx());
    expect(listEventsMock.mock.calls[0][0].limit).toBe(15);
  });

  it('returns an empty, non-error result when nothing has been captured', async () => {
    listEventsMock.mockResolvedValue([]);
    const res = await getRecentEventsTool.handler({ limit: 15 }, makeCtx());
    const data = res.data as { count: number; events: unknown[] };
    expect(data.count).toBe(0);
    expect(data.events).toEqual([]);
    expect(res.display).not.toBe('error');
    expect(res.summary).toMatch(/no recent activity/i);
  });

  it('falls back to the raw slug when the toolkit is not in the catalog', async () => {
    listEventsMock.mockResolvedValue([feedEvent({ toolkit: 'some_unknown_app' })]);
    const res = await getRecentEventsTool.handler({ limit: 5 }, makeCtx());
    const data = res.data as unknown as { events: Array<Record<string, unknown>> };
    expect(data.events[0].app).toBe('some_unknown_app');
  });
});
