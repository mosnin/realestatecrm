/**
 * Tests for `reconcileFromComposio` — the hot path on every
 * /api/integrations GET request.
 *
 * Behaviour locked in:
 *   - Composio outage / list throws → swallow + log, no DB writes
 *   - Items with non-ACTIVE status are skipped
 *   - Items for toolkits we don't know about are skipped
 *   - Items already present in our DB are skipped
 *   - Brand-new ACTIVE items get inserted
 *   - Mid-list failure on one item doesn't drop the rest
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── listConnectedAccountsForEntity mock ──────────────────────────────

const { listMock } = vi.hoisted(() => ({ listMock: vi.fn() }));
vi.mock('@/lib/integrations/composio', () => ({
  listConnectedAccountsForEntity: listMock,
  deleteConnection: vi.fn(),
}));

// ── triggers mock — reconcile self-heals missing trigger registrations ──
// `ensureTriggersRegistered` lazy-imports this module; mocking it lets us
// assert reconcile registers curated triggers for active rows that have none.
const { listTriggersMock, registerTriggersMock } = vi.hoisted(() => ({
  listTriggersMock: vi.fn(),
  registerTriggersMock: vi.fn(),
}));
vi.mock('@/lib/integrations/triggers', () => ({
  listTriggersForConnection: listTriggersMock,
  registerForConnection: registerTriggersMock,
}));

// ── catalog mock — control which toolkit slugs are "known" ───────────

vi.mock('@/lib/integrations/catalog', () => ({
  findIntegration: vi.fn((slug: string) =>
    ['gmail', 'slack', 'hubspot'].includes(slug) ? { toolkit: slug } : undefined,
  ),
}));

// ── Supabase mock — capture per-table behaviour ──────────────────────
//
// reconcileFromComposio calls:
//   findByComposioId(itemId)  → may return null (new) or a row (already tracked)
//   insertConnection(args)    → inserts a fresh row
//
// We mock at the `supabase.from(table)` level. The chain methods used
// here are .select().eq().maybeSingle() and .insert(...).select().single().
// Behaviour per table is controlled by tableBehavior.

type Behavior = {
  /** maybeSingle return value for IntegrationConnection lookups */
  maybeSingle?: { data: unknown; error: unknown };
  /** single return value for IntegrationConnection.insert */
  single?: { data: unknown; error: unknown };
};

const tableBehavior: Record<string, Behavior> = {};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'insert', 'update', 'upsert', 'delete'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(() => Promise.resolve(tableBehavior[table]?.maybeSingle ?? { data: null, error: null }));
      chain.single = vi.fn(() => Promise.resolve(tableBehavior[table]?.single ?? { data: null, error: null }));
      const term = () => Promise.resolve(tableBehavior[table]?.maybeSingle ?? { data: null, error: null });
      chain.then = (r: (v: unknown) => unknown) => term().then(r);
      return chain;
    }),
  },
}));

const { warnMock, errorMock, infoMock } = vi.hoisted(() => ({
  warnMock: vi.fn(),
  errorMock: vi.fn(),
  infoMock: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: errorMock, warn: warnMock, info: infoMock, debug: vi.fn() },
}));

import { reconcileFromComposio } from '@/lib/integrations/connections';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing rows, insert succeeds.
  tableBehavior.IntegrationConnection = {
    maybeSingle: { data: null, error: null },
    single: { data: { id: 'new-row-id' }, error: null },
  };
  // Default trigger mocks: nothing registered yet, registration succeeds.
  listTriggersMock.mockResolvedValue([]);
  registerTriggersMock.mockResolvedValue({ registered: 1, failed: 0 });
});

describe('reconcileFromComposio', () => {
  it('swallows Composio list errors (no DB writes, logs a warning)', async () => {
    listMock.mockRejectedValueOnce(new Error('composio down'));

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    expect(warnMock).toHaveBeenCalled();
    const calledTables = (await import('@/lib/supabase')).supabase.from as ReturnType<typeof vi.fn>;
    // No supabase calls happened (the early-return path).
    expect(calledTables).not.toHaveBeenCalled();
  });

  it('inserts a row for an ACTIVE item we don\'t already track', async () => {
    listMock.mockResolvedValueOnce({
      items: [
        {
          id: 'ca_new',
          status: 'ACTIVE',
          alias: 'jane@gmail.com',
          toolkit: { slug: 'gmail' },
        },
      ],
    });
    // No existing row → insert path.
    tableBehavior.IntegrationConnection = {
      maybeSingle: { data: null, error: null },
      single: { data: { id: 'fresh-row', composioConnectionId: 'ca_new' }, error: null },
    };

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    expect(infoMock).toHaveBeenCalledWith(
      '[integrations.connections] reconciled composio connection into DB',
      expect.objectContaining({ composioConnectionId: 'ca_new', toolkit: 'gmail' }),
    );
  });

  it('skips items with non-ACTIVE status', async () => {
    listMock.mockResolvedValueOnce({
      items: [
        { id: 'ca_expired', status: 'EXPIRED', alias: 'a', toolkit: { slug: 'gmail' } },
        { id: 'ca_failed', status: 'FAILED', alias: 'b', toolkit: { slug: 'gmail' } },
        { id: 'ca_init', status: 'INITIALIZING', alias: 'c', toolkit: { slug: 'gmail' } },
      ],
    });

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    // None of them should have triggered the "reconciled" info log.
    const reconcileLogs = infoMock.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('reconciled composio connection'),
    );
    expect(reconcileLogs).toHaveLength(0);
  });

  it('skips items for toolkits we don\'t know about (not in catalog)', async () => {
    listMock.mockResolvedValueOnce({
      items: [
        { id: 'ca_unk', status: 'ACTIVE', alias: 'x', toolkit: { slug: 'unknown_toolkit' } },
      ],
    });

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    const reconcileLogs = infoMock.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('reconciled composio connection'),
    );
    expect(reconcileLogs).toHaveLength(0);
  });

  it('skips items missing id or toolkit slug (malformed payload)', async () => {
    listMock.mockResolvedValueOnce({
      items: [
        { id: undefined, status: 'ACTIVE', toolkit: { slug: 'gmail' } },
        { id: 'ca_no_toolkit', status: 'ACTIVE', toolkit: null },
        { id: 'ca_empty_toolkit', status: 'ACTIVE', toolkit: { slug: undefined } },
      ],
    });

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    const reconcileLogs = infoMock.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('reconciled composio connection'),
    );
    expect(reconcileLogs).toHaveLength(0);
  });

  it('skips items we already track (existing IntegrationConnection by composio id)', async () => {
    listMock.mockResolvedValueOnce({
      items: [
        { id: 'ca_existing', status: 'ACTIVE', alias: 'a', toolkit: { slug: 'gmail' } },
      ],
    });
    // findByComposioId returns a row → skip path.
    tableBehavior.IntegrationConnection = {
      maybeSingle: { data: { id: 'existing-row', composioConnectionId: 'ca_existing' }, error: null },
    };

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    const reconcileLogs = infoMock.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('reconciled composio connection'),
    );
    expect(reconcileLogs).toHaveLength(0);
  });

  it('handles an empty items list as a no-op', async () => {
    listMock.mockResolvedValueOnce({ items: [] });

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    expect(errorMock).not.toHaveBeenCalled();
    const reconcileLogs = infoMock.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('reconciled composio connection'),
    );
    expect(reconcileLogs).toHaveLength(0);
  });

  // ── trigger self-heal: the root-cause fix for the empty activity feed ──────
  // An active connection that never went through the OAuth callback (callback
  // dropped, or predates the triggers feature) has zero IntegrationTrigger
  // rows → Composio never fires webhooks → activity feed stays empty. Reconcile
  // (runs on every /settings load) must register the curated triggers.

  it('registers curated triggers for an already-tracked ACTIVE row that has none', async () => {
    listMock.mockResolvedValueOnce({
      items: [{ id: 'ca_active', status: 'ACTIVE', alias: 'a', toolkit: { slug: 'gmail' } }],
    });
    // Already tracked + already active (the common 9-connections case).
    tableBehavior.IntegrationConnection = {
      maybeSingle: {
        data: { id: 'conn-active', composioConnectionId: 'ca_active', toolkit: 'gmail', status: 'active' },
        error: null,
      },
    };
    listTriggersMock.mockResolvedValue([]); // no triggers yet

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    expect(registerTriggersMock).toHaveBeenCalledTimes(1);
    expect(registerTriggersMock).toHaveBeenCalledWith({
      connection: expect.objectContaining({ id: 'conn-active', toolkit: 'gmail', status: 'active' }),
    });
  });

  it('does NOT re-register triggers when the connection already has rows (no duplicate Composio subscriptions)', async () => {
    listMock.mockResolvedValueOnce({
      items: [{ id: 'ca_active', status: 'ACTIVE', alias: 'a', toolkit: { slug: 'gmail' } }],
    });
    tableBehavior.IntegrationConnection = {
      maybeSingle: {
        data: { id: 'conn-active', composioConnectionId: 'ca_active', toolkit: 'gmail', status: 'active' },
        error: null,
      },
    };
    listTriggersMock.mockResolvedValue([{ id: 'existing-trigger' }]); // already registered

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    expect(registerTriggersMock).not.toHaveBeenCalled();
  });

  it('promotes a pending row AND registers its triggers in one pass', async () => {
    listMock.mockResolvedValueOnce({
      items: [{ id: 'ca_pending', status: 'ACTIVE', alias: 'a', toolkit: { slug: 'gmail' } }],
    });
    // Tracked but still pending (callback dropped before promotion).
    tableBehavior.IntegrationConnection = {
      maybeSingle: {
        data: { id: 'conn-pending', composioConnectionId: 'ca_pending', toolkit: 'gmail', status: 'pending' },
        error: null,
      },
    };
    listTriggersMock.mockResolvedValue([]);

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    // Promotion log fired …
    const promoteLogs = infoMock.mock.calls.filter(
      ([msg]) => typeof msg === 'string' && msg.includes('promoted pending row'),
    );
    expect(promoteLogs).toHaveLength(1);
    // … and triggers were registered with status forced to 'active'.
    expect(registerTriggersMock).toHaveBeenCalledWith({
      connection: expect.objectContaining({ id: 'conn-pending', status: 'active' }),
    });
  });

  it('registers triggers for a freshly reconciled-in connection', async () => {
    listMock.mockResolvedValueOnce({
      items: [{ id: 'ca_new', status: 'ACTIVE', alias: 'jane@gmail.com', toolkit: { slug: 'gmail' } }],
    });
    // Not tracked → insert path returns the new row.
    tableBehavior.IntegrationConnection = {
      maybeSingle: { data: null, error: null },
      single: { data: { id: 'fresh-row', composioConnectionId: 'ca_new', toolkit: 'gmail', status: 'active' }, error: null },
    };
    listTriggersMock.mockResolvedValue([]);

    await reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' });

    expect(registerTriggersMock).toHaveBeenCalledTimes(1);
    expect(registerTriggersMock).toHaveBeenCalledWith({
      connection: expect.objectContaining({ id: 'fresh-row', toolkit: 'gmail' }),
    });
  });

  it('swallows a trigger-registration failure (panel must still load)', async () => {
    listMock.mockResolvedValueOnce({
      items: [{ id: 'ca_active', status: 'ACTIVE', alias: 'a', toolkit: { slug: 'gmail' } }],
    });
    tableBehavior.IntegrationConnection = {
      maybeSingle: {
        data: { id: 'conn-active', composioConnectionId: 'ca_active', toolkit: 'gmail', status: 'active' },
        error: null,
      },
    };
    listTriggersMock.mockResolvedValue([]);
    registerTriggersMock.mockRejectedValueOnce(new Error('composio down'));

    // Must not throw.
    await expect(
      reconcileFromComposio({ spaceId: 'space-1', entityId: 'user-1' }),
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalled();
  });
});
