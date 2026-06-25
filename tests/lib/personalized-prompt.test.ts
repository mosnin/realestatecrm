/**
 * Per-realtor snapshot for the chat system prompt. Two surfaces:
 *   - `buildPersonalizedSnapshot` — fetches + caches the snapshot per
 *     (space, user). 5-min TTL.
 *   - `renderSnapshot` — turns the snapshot into the markdown the prompt
 *     embeds. Empty snapshot → empty string (the prompt skips the block
 *     rather than printing zeros that sound like a brand-new account).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockByTable: Record<string, { single?: Record<string, unknown> | null; count?: number }> = {};

vi.mock('@/lib/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        const override = mockByTable[table] ?? {};
        const chain: Record<string, unknown> = {};
        const passthrough = () => chain;
        chain.select = vi.fn(passthrough);
        chain.eq = vi.fn(passthrough);
        chain.is = vi.fn(passthrough);
        chain.lt = vi.fn(passthrough);
        chain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: override.single ?? null, error: null }),
        );
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: [], error: null, count: override.count ?? null });
        return chain;
      }),
    },
  };
});

const { activeToolkitsMock } = vi.hoisted(() => ({
  activeToolkitsMock: vi.fn(async () => [] as string[]),
}));
vi.mock('@/lib/integrations/connections', () => ({
  activeToolkits: activeToolkitsMock,
}));

// Mock the feed helper directly — severs the triggers/composio import subtree
// (and any `server-only` guard inside it) and lets us drive the snapshot's
// recent-activity section row by row.
const { listEventsMock } = vi.hoisted(() => ({
  listEventsMock: vi.fn(async () => [] as Array<Record<string, unknown>>),
}));
vi.mock('@/lib/integrations/events', () => ({
  listEvents: listEventsMock,
}));

import {
  buildPersonalizedSnapshot,
  renderSnapshot,
  __resetPersonalizedSnapshotCacheForTests,
} from '@/lib/ai-tools/personalized-prompt';

beforeEach(() => {
  for (const key of Object.keys(mockByTable)) delete mockByTable[key];
  activeToolkitsMock.mockReset();
  activeToolkitsMock.mockResolvedValue([]);
  listEventsMock.mockReset();
  listEventsMock.mockResolvedValue([]);
  __resetPersonalizedSnapshotCacheForTests();
});

describe('buildPersonalizedSnapshot', () => {
  it('returns first name from the User row', async () => {
    mockByTable.User = { single: { name: 'Sarah Chen' } };
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.firstName).toBe('Sarah');
  });

  it('returns null firstName when User row is missing', async () => {
    mockByTable.User = { single: null };
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.firstName).toBeNull();
  });

  it('returns counts from the parallel queries', async () => {
    mockByTable.Deal = { count: 3 };
    mockByTable.AgentDraft = { count: 2 };
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.activeDealCount).toBe(3);
    expect(snap.pendingDraftCount).toBe(2);
  });

  it('looks up connected apps via activeToolkits and resolves names', async () => {
    activeToolkitsMock.mockResolvedValue(['gmail', 'slack']);
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.connectedApps).toEqual(['Gmail', 'Slack']);
  });

  it('folds recent captured events into recentActivity (app-name + truncation)', async () => {
    listEventsMock.mockResolvedValue([
      {
        id: 'e1',
        toolkit: 'gmail',
        eventType: 'GMAIL_NEW_GMAIL_MESSAGE',
        title: 'Re: 1421 Maple offer',
        actor: 'jane@example.com',
        snippet: 'Looks good, when can we tour?',
        occurredAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        status: 'dispatched',
      },
    ]);
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.recentActivity).toHaveLength(1);
    const line = snap.recentActivity[0];
    expect(line.app).toBe('Gmail'); // slug resolved to display name
    expect(line.text).toBe('Re: 1421 Maple offer');
    expect(line.actor).toBe('jane@example.com');
    expect(line.ago).toBe('2h ago');
  });

  it('is space-scoped: passes the snapshot spaceId to listEvents', async () => {
    await buildPersonalizedSnapshot({ spaceId: 'space-xyz', userId: 'u' });
    expect(listEventsMock).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-xyz' }),
    );
  });

  it('falls back to snippet when an event has no title', async () => {
    listEventsMock.mockResolvedValue([
      {
        id: 'e2',
        toolkit: 'slack',
        eventType: 'SLACK_NEW_MESSAGE',
        title: null,
        actor: null,
        snippet: 'Standup moved to 10am',
        occurredAt: new Date().toISOString(),
        status: 'captured',
      },
    ]);
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.recentActivity[0].text).toBe('Standup moved to 10am');
  });

  it('leaves recentActivity empty when listEvents returns nothing', async () => {
    listEventsMock.mockResolvedValue([]);
    const snap = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' });
    expect(snap.recentActivity).toEqual([]);
  });

  it('serves the second call from cache (no second supabase round-trip)', async () => {
    mockByTable.User = { single: { name: 'Sam' } };
    const t = { now: () => 100 };
    await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    // Mutate the mock — if the cache misses, this would surface.
    mockByTable.User = { single: { name: 'Different' } };
    const second = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    expect(second.firstName).toBe('Sam');
  });

  it('expires after the 5-minute TTL', async () => {
    mockByTable.User = { single: { name: 'Original' } };
    let now = 0;
    const t = { now: () => now };
    await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    mockByTable.User = { single: { name: 'Refreshed' } };
    now += 6 * 60_000;
    const second = await buildPersonalizedSnapshot({ spaceId: 's', userId: 'u' }, t);
    expect(second.firstName).toBe('Refreshed');
  });
});

describe('renderSnapshot', () => {
  const empty = {
    firstName: null,
    activeDealCount: 0,
    hotPersonCount: 0,
    overdueFollowUpCount: 0,
    pendingDraftCount: 0,
    connectedApps: [] as string[],
    recentActivity: [] as Array<{
      app: string;
      text: string | null;
      actor: string | null;
      ago: string;
    }>,
    voice: { tone: null as string | null, style: null as string | null, note: null as string | null },
  };

  it('returns empty string when there is nothing useful to say', () => {
    expect(renderSnapshot(empty)).toBe('');
  });

  it('renders only the lines that have facts', () => {
    const out = renderSnapshot({
      ...empty,
      firstName: 'Sam',
      activeDealCount: 4,
      hotPersonCount: 2,
    });
    expect(out).toContain('Realtor: Sam.');
    expect(out).toContain('Snapshot: 4 active deals, 2 hot persons.');
    expect(out).not.toContain('Connected:');
  });

  it('pluralises facts correctly', () => {
    const single = renderSnapshot({
      ...empty,
      activeDealCount: 1,
      hotPersonCount: 1,
      overdueFollowUpCount: 1,
    });
    expect(single).toContain('1 active deal,');
    expect(single).toContain('1 hot person,');
    expect(single).toContain('1 overdue follow-up.');
  });

  it('lists connected apps when present', () => {
    const out = renderSnapshot({
      ...empty,
      firstName: 'Sam',
      connectedApps: ['Gmail', 'Slack'],
    });
    expect(out).toContain('Connected: Gmail, Slack.');
  });

  it('omits the recent-activity section entirely when there are no events', () => {
    const out = renderSnapshot({ ...empty, firstName: 'Sam' });
    expect(out).not.toContain('Recent connected-app activity');
  });

  it('renders recent activity as one terse line each', () => {
    const out = renderSnapshot({
      ...empty,
      recentActivity: [
        { app: 'Gmail', text: 'Re: 1421 Maple', actor: 'jane@…', ago: '2h ago' },
        { app: 'Google Calendar', text: 'Tour confirmed', actor: null, ago: '5h ago' },
      ],
    });
    expect(out).toContain('Recent connected-app activity:');
    expect(out).toContain('• Gmail — "Re: 1421 Maple" — from jane@… · 2h ago');
    expect(out).toContain('• Google Calendar — "Tour confirmed" · 5h ago');
  });

  it('renders the realtor voice when present, and omits it when unset', () => {
    const withVoice = renderSnapshot({
      ...empty,
      firstName: 'Sam',
      voice: { tone: 'warm and direct', style: 'texts more than emails', note: null },
    });
    expect(withVoice).toContain('Their voice (match it in everything you write for them):');
    expect(withVoice).toContain('tone warm and direct');
    expect(withVoice).toContain('working style: texts more than emails');

    // No voice fields → no voice line, and a bare name still yields no snapshot noise.
    expect(renderSnapshot({ ...empty, firstName: 'Sam' })).not.toContain('Their voice');
  });

  it('caps the recent-activity section line count', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      app: 'Gmail',
      text: `msg ${i}`,
      actor: null,
      ago: '1h ago',
    }));
    const out = renderSnapshot({ ...empty, recentActivity: many });
    const bullets = out.split('\n').filter((l) => l.startsWith('• '));
    expect(bullets.length).toBeLessThanOrEqual(8);
  });
});
