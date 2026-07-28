/**
 * Tests for `lib/integrations/triggers.ts` — the lifecycle + dispatch
 * layer for Composio trigger subscriptions.
 *
 * Three behaviours we lock in:
 *   1. registerForConnection registers EACH curated slug and tolerates a
 *      single-slug failure without dropping the rest.
 *   2. dispatchTrigger routes a DRAFT slug to fireRoutineRun with a
 *      templated instruction; an unmapped slug is a no-op; a thin
 *      payload also no-ops.
 *   3. deleteForConnection deletes every Composio trigger AND wipes the
 *      DB rows, in that order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Composio SDK wrapper mocks ────────────────────────────────────────

const { createTriggerMock, deleteTriggerMock } = vi.hoisted(() => ({
  createTriggerMock: vi.fn(),
  deleteTriggerMock: vi.fn(async () => undefined),
}));

vi.mock('@/lib/integrations/composio', () => ({
  createTrigger: createTriggerMock,
  deleteTrigger: deleteTriggerMock,
}));

// ── fireRoutineRun mock ───────────────────────────────────────────────

const { fireRoutineRunMock } = vi.hoisted(() => ({
  fireRoutineRunMock: vi.fn<() => Promise<'ok' | 'error'>>(async () => 'ok'),
}));
vi.mock('@/lib/routines', () => ({
  fireRoutineRun: fireRoutineRunMock,
}));

// Inbound calendar→Tour sync. dispatchTrigger runs this for calendar
// event-change slugs (the two-way fix); mocked here so we assert the WIRING
// (right slug → sync called with the connection's space/provider) without
// re-testing the sync internals (covered in calendar-tour-sync.test.ts).
const { syncCalendarEventToTourMock } = vi.hoisted(() => ({
  syncCalendarEventToTourMock: vi.fn<
    (arg: { spaceId: string; provider: string; triggerSlug: string; payload: Record<string, unknown> }) => Promise<{ action: string; tourId?: string; reason?: string }>
  >(async () => ({ action: 'noop' })),
}));
vi.mock('@/lib/calendar/tour-sync', () => ({
  syncCalendarEventToTour: syncCalendarEventToTourMock,
}));

// Inbound-email capture (Phase 3). dispatchTrigger calls recordInboundMessage
// for Gmail/Outlook deliveries BEFORE the DRAFT dispatch; mocked here so we
// assert the WIRING (resolved contact → inbound write with channel/externalId)
// without re-testing inbox internals (covered in inbox.test.ts).
const { recordInboundMessageMock } = vi.hoisted(() => ({
  recordInboundMessageMock: vi.fn<
    (arg: Record<string, unknown>) => Promise<{ threadId: string; messageId: string; deduped: boolean }>
  >(async () => ({ threadId: 'thread_1', messageId: 'msg_1', deduped: false })),
}));
vi.mock('@/lib/inbox', () => ({
  recordInboundMessage: recordInboundMessageMock,
}));

// ── Supabase mock — captures upsert/delete/select on IntegrationTrigger

type Terminal = { data: unknown; error: unknown };
const supabaseState: {
  terminal: Terminal;
  calls: Array<{ table: string; chain: Array<[string, unknown[]]> }>;
} = { terminal: { data: null, error: null }, calls: [] };

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const chainCalls: Array<[string, unknown[]]> = [];
    supabaseState.calls.push({ table, chain: chainCalls });
    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'ilike', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        chainCalls.push([method, args]);
        return chain;
      });
    }
    const term = () => Promise.resolve(supabaseState.terminal);
    chain.maybeSingle = vi.fn(term);
    chain.single = vi.fn(term);
    chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve(supabaseState.terminal).then(r, e);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  registerForConnection,
  deleteForConnection,
  dispatchTrigger,
  captureInboundEmail,
  setPausedForConnection,
  summariesForConnections,
  normalizeTriggerEvent,
  CURATED_TRIGGERS,
} from '@/lib/integrations/triggers';
// captureEvent uses the real normalizeTriggerEvent + the mocked supabase
// above, so we can assert the IntegrationEvent write shape directly.
import { captureEvent } from '@/lib/integrations/events';
import type { IntegrationConnectionRow } from '@/lib/integrations/connections';

function freshConnection(overrides: Partial<IntegrationConnectionRow> = {}): IntegrationConnectionRow {
  return {
    id: 'conn-1',
    spaceId: 'space-1',
    userId: 'user-1',
    toolkit: 'gmail',
    composioConnectionId: 'ca_abc',
    status: 'active',
    label: 'me@example.com',
    lastError: null,
    lastUsedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  createTriggerMock.mockReset();
  deleteTriggerMock.mockReset();
  fireRoutineRunMock.mockReset();
  fireRoutineRunMock.mockResolvedValue('ok');
  syncCalendarEventToTourMock.mockReset();
  syncCalendarEventToTourMock.mockResolvedValue({ action: 'noop' });
  recordInboundMessageMock.mockReset();
  recordInboundMessageMock.mockResolvedValue({ threadId: 'thread_1', messageId: 'msg_1', deduped: false });
  supabaseState.terminal = { data: null, error: null };
  supabaseState.calls = [];
});

// ─── CURATED_TRIGGERS sanity ─────────────────────────────────────────────────

describe('CURATED_TRIGGERS', () => {
  it('has an entry for every catalog toolkit that ships triggers', () => {
    // Gmail must ship with at least one slug — the v1 ship gate.
    expect(CURATED_TRIGGERS.gmail).toContain('GMAIL_NEW_GMAIL_MESSAGE');
  });

  it('uses UPPER_SNAKE_CASE for every slug it registers', () => {
    for (const [toolkit, slugs] of Object.entries(CURATED_TRIGGERS)) {
      for (const slug of slugs) {
        expect(slug, `${toolkit} → ${slug}`).toMatch(/^[A-Z][A-Z0-9_]+$/);
      }
    }
  });

  it('every curated slug has a dispatch + a working template', async () => {
    // Catches the failure mode where a slug enters CURATED_TRIGGERS
    // but TRIGGER_DISPATCH / TEMPLATES weren't updated. Registration
    // would succeed at Composio; deliveries would silently no-op.
    // Hits the dispatcher with a generously-shaped payload so the
    // template's bail-out branch doesn't masquerade as "no dispatch".
    const conn = freshConnection();
    const fatPayload = {
      // Cover field names across Gmail/Outlook/Slack/Discord/CRMs/Stripe.
      subject: 'X', from: 'a@b', sender: 'a@b', snippet: 'hi',
      bodyPreview: 'hi', text: 'hi', message: 'hi', user: 'u', author: 'u',
      summary: 'evt', responseStatus: 'accepted', startTime: 'soon',
      attendees: [{ email: 'x@y' }],
      properties: { firstname: 'A', lastname: 'B', email: 'a@b', phone: '1', dealname: 'D', dealstage: 'open' },
      name: 'N', company: 'C', leadSource: 'web', stageName: 'open', amount: '1',
      title: 'T', value: '1', personName: 'P',
      amount_total: '1', customer_email: 'a@b', failure_message: 'f', amount_paid: '1',
      taskName: 'T', listName: 'L', reaction: 'thumbs_up',
      cardName: 'C', change: 'moved',
      content: 'msg',
      emailAddress: 'a@b',
    };
    for (const [toolkit, slugs] of Object.entries(CURATED_TRIGGERS)) {
      for (const slug of slugs) {
        const result = await dispatchTrigger({
          triggerSlug: slug,
          connection: conn,
          payload: fatPayload,
        });
        // Every curated slug must either DRAFT or have a well-known
        // skip reason (NOT 'no_dispatch' — that means we forgot to
        // wire it up).
        if (result.dispatched === 'noop') {
          expect(result.reason, `${toolkit} → ${slug} should dispatch on a full payload`).not.toBe('no_dispatch');
        }
      }
    }
  });
});

// ─── registerForConnection ───────────────────────────────────────────────────

describe('registerForConnection', () => {
  it('registers every curated slug and returns the counts', async () => {
    createTriggerMock.mockImplementation(async (args: { slug: string }) => ({
      triggerId: `trg_${args.slug.toLowerCase()}`,
    }));
    supabaseState.terminal = { data: null, error: null };

    const result = await registerForConnection({ connection: freshConnection() });

    expect(createTriggerMock).toHaveBeenCalledTimes(CURATED_TRIGGERS.gmail.length);
    expect(result.registered).toBe(CURATED_TRIGGERS.gmail.length);
    expect(result.failed).toBe(0);
  });

  it('records a failed row when one slug throws and continues the rest', async () => {
    // Force a failure by faking gmail to have two slugs for this test —
    // we mock createTrigger by call index, regardless of the map's real
    // length (the asserts below don't depend on map size).
    const slugCount = CURATED_TRIGGERS.gmail.length;
    if (slugCount < 1) {
      throw new Error('gmail map must have at least one slug for this test to be meaningful');
    }
    createTriggerMock.mockImplementationOnce(async () => {
      throw new Error('composio said no');
    });
    // Subsequent calls succeed.
    createTriggerMock.mockImplementation(async (args: { slug: string }) => ({
      triggerId: `trg_${args.slug.toLowerCase()}`,
    }));

    const result = await registerForConnection({ connection: freshConnection() });

    expect(result.failed).toBe(1);
    expect(result.registered).toBe(slugCount - 1);
  });

  it('is a no-op when the toolkit has no curated triggers', async () => {
    // `zoho` is intentionally empty in CURATED_TRIGGERS (see the per-
    // entry comment in lib/integrations/triggers.ts). If this test
    // starts failing, either (a) zoho got triggers, in which case
    // swap to another intentionally-empty toolkit, or (b) we
    // accidentally registered something — investigate the map.
    const result = await registerForConnection({
      connection: freshConnection({ toolkit: 'zoho' }),
    });
    expect(createTriggerMock).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: 0, failed: 0 });
  });
});

// ─── deleteForConnection ─────────────────────────────────────────────────────

describe('deleteForConnection', () => {
  it('deletes every Composio trigger AND the DB rows', async () => {
    // First supabase call (list) returns two rows; second call is the delete.
    let callIndex = 0;
    supabaseState.terminal = { data: null, error: null };
    const responses: Terminal[] = [
      { data: [
        { id: 'r1', composioTriggerId: 'trg_a', connectionId: 'conn-1' },
        { id: 'r2', composioTriggerId: 'trg_b', connectionId: 'conn-1' },
      ], error: null },
      { data: null, error: null },
    ];
    vi.mocked(supabaseState).calls = [];

    // Intercept the supabase mock to swap the terminal per call.
    const { supabase } = await import('@/lib/supabase');
    const origFrom = supabase.from as ReturnType<typeof vi.fn>;
    origFrom.mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      const term = () => Promise.resolve(responses[callIndex++] ?? { data: null, error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve(responses[callIndex++] ?? { data: null, error: null }).then(r, e);
      return chain;
    });

    await deleteForConnection('conn-1');

    expect(deleteTriggerMock).toHaveBeenCalledWith('trg_a');
    expect(deleteTriggerMock).toHaveBeenCalledWith('trg_b');
    expect(deleteTriggerMock).toHaveBeenCalledTimes(2);
  });

  it('skips Composio delete for rows with null composioTriggerId', async () => {
    let callIndex = 0;
    const responses: Terminal[] = [
      { data: [{ id: 'r1', composioTriggerId: null, connectionId: 'conn-1' }], error: null },
      { data: null, error: null },
    ];
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      const term = () => Promise.resolve(responses[callIndex++] ?? { data: null, error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve(responses[callIndex++] ?? { data: null, error: null }).then(r, e);
      return chain;
    });

    await deleteForConnection('conn-1');

    expect(deleteTriggerMock).not.toHaveBeenCalled();
  });
});

// ─── setPausedForConnection ──────────────────────────────────────────────────

describe('setPausedForConnection', () => {
  it('updates rows from active → paused when called with paused:true', async () => {
    // Capture the chain to assert what was filtered + what was set.
    let chainCalls: Array<[string, unknown[]]> = [];
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) {
        chain[m] = vi.fn((...args: unknown[]) => {
          chainCalls.push([m, args]);
          return chain;
        });
      }
      chainCalls = [];
      const term = () => Promise.resolve({ data: [{ id: 'r1' }, { id: 'r2' }], error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: 'r1' }, { id: 'r2' }], error: null }).then(r, e);
      return chain;
    });

    const result = await setPausedForConnection({ connectionId: 'conn-1', paused: true });

    expect(result.updated).toBe(2);
    // Must have filtered on the OPPOSITE status — the helper only flips
    // rows in the wrong state, leaving paused-already and failed alone.
    const eqCalls = chainCalls.filter(([m]) => m === 'eq');
    expect(eqCalls).toContainEqual(['eq', ['status', 'active']]);
    // And updated TO 'paused'.
    const updateCall = chainCalls.find(([m]) => m === 'update');
    expect((updateCall![1][0] as { status: string }).status).toBe('paused');
  });

  it('updates rows from paused → active when called with paused:false', async () => {
    let chainCalls: Array<[string, unknown[]]> = [];
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) {
        chain[m] = vi.fn((...args: unknown[]) => {
          chainCalls.push([m, args]);
          return chain;
        });
      }
      chainCalls = [];
      const term = () => Promise.resolve({ data: [{ id: 'r1' }], error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: 'r1' }], error: null }).then(r, e);
      return chain;
    });

    const result = await setPausedForConnection({ connectionId: 'conn-1', paused: false });

    expect(result.updated).toBe(1);
    const eqCalls = chainCalls.filter(([m]) => m === 'eq');
    expect(eqCalls).toContainEqual(['eq', ['status', 'paused']]);
    const updateCall = chainCalls.find(([m]) => m === 'update');
    expect((updateCall![1][0] as { status: string }).status).toBe('active');
  });
});

// ─── summariesForConnections ─────────────────────────────────────────────────

describe('summariesForConnections', () => {
  it('returns "active" when ANY trigger row is active', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      const data = [
        { connectionId: 'c1', status: 'paused' },
        { connectionId: 'c1', status: 'active' }, // wins
      ];
      const term = () => Promise.resolve({ data, error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(r, e);
      return chain;
    });

    const result = await summariesForConnections(['c1']);
    expect(result.c1).toBe('active');
  });

  it('returns "paused" only when all rows are paused', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      const data = [
        { connectionId: 'c1', status: 'paused' },
        { connectionId: 'c1', status: 'paused' },
      ];
      const term = () => Promise.resolve({ data, error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(r, e);
      return chain;
    });

    const result = await summariesForConnections(['c1']);
    expect(result.c1).toBe('paused');
  });

  it('returns "off" for connections with no rows', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      const term = () => Promise.resolve({ data: [], error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(r, e);
      return chain;
    });

    const result = await summariesForConnections(['c1', 'c2']);
    expect(result.c1).toBe('off');
    expect(result.c2).toBe('off');
  });

  it('is a no-op for an empty input list', async () => {
    const result = await summariesForConnections([]);
    expect(result).toEqual({});
  });
});

// ─── dispatchTrigger ─────────────────────────────────────────────────────────

describe('dispatchTrigger', () => {
  it('routes a DRAFT slug to fireRoutineRun with a templated instruction', async () => {
    const result = await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: {
        subject: 'Offer accepted on 1421 Maple',
        from: 'sarah@example.com',
        snippet: 'Hi — we accept. When can we sign?',
      },
    });

    expect(result.dispatched).toBe('DRAFT');
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
    const call = fireRoutineRunMock.mock.calls[0] as unknown as [string, string, string];
    const [spaceId, instruction, userId] = call;
    expect(spaceId).toBe('space-1');
    expect(userId).toBe('user-1');
    expect(instruction).toContain('Offer accepted on 1421 Maple');
    expect(instruction).toContain('sarah@example.com');
    expect(instruction).toContain('we accept');
    // The honest cue: instruction must tell the model NOT to act on noise.
    expect(instruction.toLowerCase()).toContain('noise');
  });

  it('throws so Inngest retries/DLQs when the autonomous dispatch failed', async () => {
    fireRoutineRunMock.mockResolvedValueOnce('error');
    await expect(
      dispatchTrigger({
        triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
        connection: freshConnection(),
        payload: {
          subject: 'Synthetic message',
          from: 'synthetic@example.invalid',
          snippet: 'Please review this synthetic event.',
        },
      }),
    ).rejects.toThrow(/dispatch failed/i);
  });

  it('skips fireRoutineRun when the payload is too thin to act on', async () => {
    const result = await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: {},
    });
    expect(result.dispatched).toBe('noop');
    expect(result.reason).toBe('thin_payload');
    expect(fireRoutineRunMock).not.toHaveBeenCalled();
  });

  it('no-ops for a slug with no dispatch handler', async () => {
    const result = await dispatchTrigger({
      triggerSlug: 'NOT_A_REAL_TRIGGER',
      connection: freshConnection(),
      payload: { anything: 'ok' },
    });
    expect(result.dispatched).toBe('noop');
    expect(result.reason).toBe('no_dispatch');
    expect(fireRoutineRunMock).not.toHaveBeenCalled();
  });
});

// ─── dispatchTrigger → inbound calendar sync wiring (two-way fix) ─────────────

describe('dispatchTrigger — calendar sync wiring', () => {
  const calConn = () => freshConnection({ toolkit: 'googlecalendar' });

  it('runs the inbound sync for the CANCELED_DELETED calendar slug', async () => {
    await dispatchTrigger({
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      connection: calConn(),
      payload: { event_id: 'gcal_evt_1', summary: 'Tour: Sam' },
    });
    expect(syncCalendarEventToTourMock).toHaveBeenCalledTimes(1);
    expect(syncCalendarEventToTourMock.mock.calls[0][0]).toMatchObject({
      spaceId: 'space-1',
      provider: 'googlecalendar',
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
    });
  });

  it('runs the inbound sync for the ATTENDEE_RESPONSE_CHANGED calendar slug', async () => {
    await dispatchTrigger({
      triggerSlug: 'GOOGLECALENDAR_ATTENDEE_RESPONSE_CHANGED_TRIGGER',
      connection: calConn(),
      payload: { event_id: 'gcal_evt_1', responseStatus: 'declined' },
    });
    expect(syncCalendarEventToTourMock).toHaveBeenCalledTimes(1);
  });

  it('still DRAFTs after syncing (CRM correction + guest follow-up both happen)', async () => {
    const result = await dispatchTrigger({
      triggerSlug: 'GOOGLECALENDAR_EVENT_CANCELED_DELETED_TRIGGER',
      connection: calConn(),
      payload: { event_id: 'gcal_evt_1', summary: 'Tour: Sam', startTime: 'soon' },
    });
    // The sync corrects the Tour; the DRAFT drafts the guest-facing note.
    expect(syncCalendarEventToTourMock).toHaveBeenCalledTimes(1);
    expect(result.dispatched).toBe('DRAFT');
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT run the sync for a non-calendar slug', async () => {
    await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { subject: 'Hi', from: 'a@b', snippet: 'x' },
    });
    expect(syncCalendarEventToTourMock).not.toHaveBeenCalled();
  });

  it('does NOT run the sync for the STARTING_SOON reminder slug', async () => {
    await dispatchTrigger({
      triggerSlug: 'GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER',
      connection: calConn(),
      payload: { summary: 'Tour', attendees: [{ email: 'x@y' }] },
    });
    expect(syncCalendarEventToTourMock).not.toHaveBeenCalled();
  });
});

// ─── captureInboundEmail (Phase 3 inbound-email capture) ─────────────────────

// Earlier describes (deleteForConnection/setPaused/summaries) REPLACE
// supabase.from via mockImplementation and the file resets mocks explicitly
// (no clearAllMocks), so those replacements persist. Restore the default
// chain — the one that records calls into supabaseState and honors the shared
// terminal, and crucially includes `ilike` (the Contact email lookup) — before
// each capture test so these run independent of prior mutations.
async function restoreDefaultSupabaseFrom() {
  const { supabase } = await import('@/lib/supabase');
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    const chainCalls: Array<[string, unknown[]]> = [];
    supabaseState.calls.push({ table, chain: chainCalls });
    const chain: Record<string, unknown> = {};
    const passthrough = ['select', 'eq', 'ilike', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
    for (const method of passthrough) {
      chain[method] = vi.fn((...args: unknown[]) => {
        chainCalls.push([method, args]);
        return chain;
      });
    }
    const term = () => Promise.resolve(supabaseState.terminal);
    chain.maybeSingle = vi.fn(term);
    chain.single = vi.fn(term);
    chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
      Promise.resolve(supabaseState.terminal).then(r, e);
    return chain;
  });
}

describe('captureInboundEmail', () => {
  beforeEach(restoreDefaultSupabaseFrom);

  // Point the Contact lookup (the only supabase call in the capture path) at a
  // matched / unmatched contact via the shared terminal.
  function contactFound(id: string) {
    supabaseState.terminal = { data: { id }, error: null };
  }
  function contactNotFound() {
    supabaseState.terminal = { data: null, error: null };
  }

  it('records an inbound email message when the sender resolves to a contact', async () => {
    contactFound('contact-9');
    const outcome = await captureInboundEmail({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: {
        from: 'Sarah <Sarah@Example.com>',
        subject: 'Re: 1421 Maple',
        snippet: 'Still available?',
        message_id: 'gmail_msg_1',
      },
    });

    expect(outcome).toBe('recorded');
    expect(recordInboundMessageMock).toHaveBeenCalledTimes(1);
    expect(recordInboundMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        contactId: 'contact-9',
        channel: 'email',
        subject: 'Re: 1421 Maple',
        body: 'Still available?',
        externalId: 'gmail_msg_1',
      }),
    );
    // Resolution scoped to the connection's space, matched case-insensitively.
    const contactCall = supabaseState.calls.find((c) => c.table === 'Contact');
    expect(contactCall).toBeTruthy();
    const eqSpace = contactCall!.chain.find(([m]) => m === 'eq');
    expect(eqSpace).toEqual(['eq', ['spaceId', 'space-1']]);
    expect(contactCall!.chain.some(([m]) => m === 'ilike')).toBe(true);
    // metadata carries the raw from + the trigger slug.
    const arg = recordInboundMessageMock.mock.calls[0][0] as { metadata: Record<string, unknown> };
    expect(arg.metadata).toMatchObject({
      from: 'Sarah <Sarah@Example.com>',
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
    });
  });

  it('uses the full body over the snippet when both are present', async () => {
    contactFound('contact-9');
    await captureInboundEmail({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'a@b.com', body: 'Full body text', snippet: 'short' },
    });
    const arg = recordInboundMessageMock.mock.calls[0][0] as { body: string };
    expect(arg.body).toBe('Full body text');
  });

  it('skips the message record when no contact matches (and does NOT create one)', async () => {
    contactNotFound();
    const outcome = await captureInboundEmail({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'stranger@nowhere.com', snippet: 'hi', message_id: 'm1' },
    });
    expect(outcome).toBe('no_contact');
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
    // No insert on Contact — we never fabricate a contact for an unknown sender.
    const contactCall = supabaseState.calls.find((c) => c.table === 'Contact');
    expect(contactCall!.chain.some(([m]) => m === 'insert')).toBe(false);
  });

  it('skips when the payload has no resolvable sender email', async () => {
    const outcome = await captureInboundEmail({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { subject: 'No sender here' },
    });
    expect(outcome).toBe('no_sender');
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });

  it('no-ops for a non-email slug', async () => {
    const outcome = await captureInboundEmail({
      triggerSlug: 'SLACK_DIRECT_MESSAGE_RECEIVED',
      connection: freshConnection({ toolkit: 'slack' }),
      payload: { from: 'a@b.com', text: 'hi' },
    });
    expect(outcome).toBe('not_email');
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });

  it('reports a dedupe hit (idempotent on the provider message id)', async () => {
    contactFound('contact-9');
    recordInboundMessageMock.mockResolvedValueOnce({
      threadId: 'thread_1',
      messageId: 'msg_existing',
      deduped: true,
    });
    const outcome = await captureInboundEmail({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'a@b.com', snippet: 'hi', message_id: 'gmail_msg_1' },
    });
    expect(outcome).toBe('deduped');
    expect(recordInboundMessageMock).toHaveBeenCalledTimes(1);
  });

  it('never throws — a record failure returns "error" (best-effort contract)', async () => {
    contactFound('contact-9');
    recordInboundMessageMock.mockRejectedValueOnce(new Error('db down'));
    const outcome = await captureInboundEmail({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'a@b.com', snippet: 'hi' },
    });
    expect(outcome).toBe('error');
  });

  it('reads Outlook sender/body field names + V3-nested payloads', async () => {
    contactFound('contact-9');
    await captureInboundEmail({
      triggerSlug: 'OUTLOOK_MESSAGE_TRIGGER',
      connection: freshConnection({ toolkit: 'outlook' }),
      // V3 nests under `payload`; flattenPayload collapses it.
      payload: { payload: { senderEmail: 'o@x.com', subject: 'Hi', bodyPreview: 'preview', id: 'out_1' } },
    });
    expect(recordInboundMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        contactId: 'contact-9',
        body: 'preview',
        externalId: 'out_1',
      }),
    );
  });
});

// ─── dispatchTrigger → inbound-email capture wiring ──────────────────────────

describe('dispatchTrigger — inbound email capture wiring', () => {
  beforeEach(restoreDefaultSupabaseFrom);

  it('captures the inbound email AND still DRAFTs when the sender matches', async () => {
    // The single supabase call in dispatch's email path is the Contact lookup.
    supabaseState.terminal = { data: { id: 'contact-9' }, error: null };
    const result = await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'sarah@example.com', subject: 'Hi', snippet: 'available?', message_id: 'm1' },
    });
    // Capture happened with the inbound write...
    expect(recordInboundMessageMock).toHaveBeenCalledTimes(1);
    expect(recordInboundMessageMock.mock.calls[0][0]).toMatchObject({
      channel: 'email',
      contactId: 'contact-9',
      externalId: 'm1',
    });
    // ...and the DRAFT dispatch STILL fires (additive — capture doesn't replace it).
    expect(result.dispatched).toBe('DRAFT');
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
  });

  it('skips the message but STILL DRAFTs when the sender is unknown', async () => {
    supabaseState.terminal = { data: null, error: null }; // no contact match
    const result = await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'stranger@nowhere.com', subject: 'Hi', snippet: 'available?' },
    });
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
    expect(result.dispatched).toBe('DRAFT');
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
  });

  it('a capture failure does NOT break the DRAFT dispatch', async () => {
    supabaseState.terminal = { data: { id: 'contact-9' }, error: null };
    recordInboundMessageMock.mockRejectedValueOnce(new Error('db down'));
    const result = await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: { from: 'sarah@example.com', subject: 'Hi', snippet: 'available?' },
    });
    expect(result.dispatched).toBe('DRAFT');
    expect(fireRoutineRunMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT attempt an email capture for a non-email slug', async () => {
    await dispatchTrigger({
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connection: freshConnection(),
      payload: {},
    });
    recordInboundMessageMock.mockClear();
    // A calendar slug should never touch the inbound-email path.
    await dispatchTrigger({
      triggerSlug: 'GOOGLECALENDAR_EVENT_STARTING_SOON_TRIGGER',
      connection: freshConnection({ toolkit: 'googlecalendar' }),
      payload: { summary: 'Tour', attendees: [{ email: 'x@y' }] },
    });
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });
});

// ─── normalizeTriggerEvent (shared feed/dispatch extractor) ───────────────────

describe('normalizeTriggerEvent', () => {
  it('derives title/actor/snippet from the same extractor the instruction uses', () => {
    const out = normalizeTriggerEvent('gmail', 'GMAIL_NEW_GMAIL_MESSAGE', {
      subject: 'Offer accepted on 1421 Maple',
      from: 'sarah@example.com',
      snippet: 'Hi — we accept.',
    });
    expect(out.title).toBe('Offer accepted on 1421 Maple');
    expect(out.actor).toBe('sarah@example.com');
    expect(out.snippet).toBe('Hi — we accept.');
    expect(typeof out.occurredAt).toBe('string');
    expect(Number.isNaN(new Date(out.occurredAt).getTime())).toBe(false);
  });

  it('reads V3-style nested payloads via the same flatten step', () => {
    const out = normalizeTriggerEvent('gmail', 'GMAIL_NEW_GMAIL_MESSAGE', {
      payload: { subject: 'Nested', from: 'a@b.com', snippet: 'hi' },
    });
    expect(out.title).toBe('Nested');
    expect(out.actor).toBe('a@b.com');
  });

  it('prefers a payload timestamp for occurredAt when present', () => {
    const out = normalizeTriggerEvent('gmail', 'GMAIL_NEW_GMAIL_MESSAGE', {
      subject: 'X',
      timestamp: '2026-05-01T12:00:00Z',
    });
    expect(out.occurredAt).toBe('2026-05-01T12:00:00.000Z');
  });

  it('is null-safe: a thin/empty payload yields all-null fields + a fallback occurredAt', () => {
    const out = normalizeTriggerEvent('gmail', 'GMAIL_NEW_GMAIL_MESSAGE', {});
    expect(out.title).toBeNull();
    expect(out.actor).toBeNull();
    expect(out.snippet).toBeNull();
    expect(Number.isNaN(new Date(out.occurredAt).getTime())).toBe(false);
  });

  it('is null-safe for an unknown slug', () => {
    const out = normalizeTriggerEvent('gmail', 'NOT_A_REAL_TRIGGER', { subject: 'X' });
    expect(out).toMatchObject({ title: null, actor: null, snippet: null });
  });
});

// ─── captureEvent — IntegrationEvent persistence (idempotent on deliveryId) ───

describe('captureEvent', () => {
  it('upserts an IntegrationEvent insert-or-ignore on deliveryId (the idempotency contract)', async () => {
    let chainCalls: Array<[string, unknown[]]> = [];
    let table = '';
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((t: string) => {
      table = t;
      chainCalls = [];
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) {
        chain[m] = vi.fn((...args: unknown[]) => {
          chainCalls.push([m, args]);
          return chain;
        });
      }
      const term = () => Promise.resolve({ data: null, error: null });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(r, e);
      return chain;
    });

    const ok = await captureEvent({
      spaceId: 'space-1',
      connectionId: 'conn-1',
      triggerId: 'trg-row-1',
      toolkit: 'gmail',
      slug: 'GMAIL_NEW_GMAIL_MESSAGE',
      payload: { subject: 'Hi', from: 'a@b.com', snippet: 'hey' },
      deliveryId: 'msg_abc',
    });

    expect(ok).toBe(true);
    expect(table).toBe('IntegrationEvent');
    const upsert = chainCalls.find(([m]) => m === 'upsert');
    expect(upsert, 'captureEvent must upsert').toBeTruthy();
    // The row carries the normalized summary + the delivery id.
    const row = upsert![1][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      spaceId: 'space-1',
      connectionId: 'conn-1',
      triggerId: 'trg-row-1',
      toolkit: 'gmail',
      eventType: 'GMAIL_NEW_GMAIL_MESSAGE',
      title: 'Hi',
      actor: 'a@b.com',
      snippet: 'hey',
      status: 'captured',
      deliveryId: 'msg_abc',
    });
    // Idempotency: insert-or-IGNORE on the deliveryId unique index. A retry
    // re-running this is a silent no-op instead of a duplicate row.
    const opts = upsert![1][1] as { onConflict: string; ignoreDuplicates: boolean };
    expect(opts).toEqual({ onConflict: 'deliveryId', ignoreDuplicates: true });
  });

  it('never throws on a DB error — logs and returns false', async () => {
    const { supabase } = await import('@/lib/supabase');
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const passthrough = ['select', 'eq', 'is', 'in', 'order', 'limit', 'upsert', 'delete', 'update', 'insert'];
      for (const m of passthrough) chain[m] = vi.fn(() => chain);
      const term = () => Promise.resolve({ data: null, error: { message: 'boom' } });
      chain.maybeSingle = vi.fn(term);
      chain.single = vi.fn(term);
      chain.then = (r: (v: Terminal) => unknown, e?: (e: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'boom' } }).then(r, e);
      return chain;
    });

    const ok = await captureEvent({
      spaceId: 'space-1',
      connectionId: 'conn-1',
      triggerId: null,
      toolkit: 'gmail',
      slug: 'GMAIL_NEW_GMAIL_MESSAGE',
      payload: { subject: 'Hi' },
      deliveryId: 'msg_err',
    });
    expect(ok).toBe(false);
  });
});
