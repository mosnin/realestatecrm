/**
 * Tests for `handleComposioTrigger` — the Inngest function that takes a
 * verified Composio delivery and routes it to the dispatcher.
 *
 * The functionality audit flagged this as the most-important untested
 * file in the feature. These tests lock in:
 *   - The in-handler dedupe claim short-circuits on duplicate delivery
 *   - Missing/inactive connection → drop without dispatch
 *   - Missing/paused trigger row → drop without dispatch
 *   - Toolkit mismatch between event and connection → drop
 *   - Daily-per-space cap → drop above threshold
 *   - Happy path: dispatch + stampFired
 *
 * We exercise the function by calling its internal handler directly
 * (the same shape Inngest invokes), since the Inngest runtime itself
 * isn't part of what we're testing here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// lib/inngest/functions.ts now imports lib/realtime/ably.ts, which is marked
// `import 'server-only'` — a build-time guard that throws under vitest's Node
// environment. Stub it so the handler under test can be imported. The Ably
// publish path no-ops without ABLY_API_KEY, so this changes nothing we assert.
vi.mock('server-only', () => ({}));

// ── Mocks ──────────────────────────────────────────────────────────────

const { findByComposioIdMock } = vi.hoisted(() => ({
  findByComposioIdMock: vi.fn(),
}));
vi.mock('@/lib/integrations/connections', () => ({
  findByComposioId: findByComposioIdMock,
}));

const { dispatchMock, findTriggerMock, stampFiredMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  findTriggerMock: vi.fn(),
  stampFiredMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/integrations/triggers', () => ({
  dispatchTrigger: dispatchMock,
  findByComposioTriggerId: findTriggerMock,
  stampFired: stampFiredMock,
}));

// IntegrationEvent capture layer. captureEvent persists the delivery
// (idempotent on deliveryId in the real impl — tested directly in
// integrations-triggers.test.ts); setEventStatus stamps the dispatch
// outcome. Here we spy on the calls to assert capture happens once, before
// the cap gate, and carries the right status.
const { captureEventMock, setEventStatusMock } = vi.hoisted(() => ({
  captureEventMock: vi.fn(async () => true),
  setEventStatusMock: vi.fn(async () => undefined),
}));
vi.mock('@/lib/integrations/events', () => ({
  captureEvent: captureEventMock,
  setEventStatus: setEventStatusMock,
}));

const { redisSetMock, redisIncrMock, redisExpireMock } = vi.hoisted(() => ({
  redisSetMock: vi.fn(),
  redisIncrMock: vi.fn(),
  redisExpireMock: vi.fn(async () => 1),
}));
vi.mock('@/lib/redis', () => ({
  redis: { set: redisSetMock, incr: redisIncrMock, expire: redisExpireMock },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Inngest stub — replace createFunction so we can extract the handler
// and call it directly. step.run is a passthrough that immediately
// invokes its fn (real Inngest memoises across retries; for unit tests
// we want the synchronous behaviour).
vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      handler: (ctx: { event: unknown; step: { run: (id: string, fn: () => unknown) => unknown } }) => unknown,
    ) => ({ handler }),
    send: vi.fn(),
  },
}));

// Re-stub modules that the inngest functions file imports but we don't
// care about in this test (publish-scheduled-post side).
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn() })) },
}));
vi.mock('@/lib/storage', () => ({ getSignedDownloadUrl: vi.fn() }));
vi.mock('@/lib/studio/publish', () => ({ publishToPlatform: vi.fn() }));

import { handleComposioTrigger } from '@/lib/inngest/functions';

// Helper: invoke the Inngest function as if a delivery arrived.
async function invoke(eventData: Record<string, unknown>) {
  const handler = (handleComposioTrigger as unknown as {
    handler: (ctx: {
      event: { data: Record<string, unknown> };
      step: { run: (id: string, fn: () => unknown) => unknown };
    }) => Promise<unknown>;
  }).handler;
  return handler({
    event: { data: eventData },
    step: { run: async (_id: string, fn: () => unknown) => fn() },
  });
}

function activeConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    spaceId: 'space-1',
    userId: 'user-1',
    toolkit: 'gmail',
    composioConnectionId: 'ca-1',
    status: 'active',
    ...overrides,
  };
}

function activeTrigger(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trg-row-1',
    connectionId: 'conn-1',
    composioTriggerId: 'ctrg-1',
    triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
    status: 'active',
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId: 'msg_abc',
    triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
    toolkitSlug: 'gmail',
    composioConnectionId: 'ca-1',
    composioTriggerId: 'ctrg-1',
    userId: 'user-1',
    payload: { subject: 'Hi' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults: claim succeeds, connection found + active, trigger found + active,
  // daily count = 1, dispatch returns DRAFT, capture succeeds.
  redisSetMock.mockResolvedValue('OK');
  redisIncrMock.mockResolvedValue(1);
  findByComposioIdMock.mockResolvedValue(activeConnection());
  findTriggerMock.mockResolvedValue(activeTrigger());
  dispatchMock.mockResolvedValue({ dispatched: 'DRAFT' });
  captureEventMock.mockResolvedValue(true);
  setEventStatusMock.mockResolvedValue(undefined);
});

describe('handleComposioTrigger', () => {
  it('happy path: claim → resolve → daily-cap → dispatch → stampFired', async () => {
    const result = await invoke(event());

    expect(result).toMatchObject({
      dispatched: 'DRAFT',
      deliveryId: 'msg_abc',
      triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE',
      connectionId: 'conn-1',
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(stampFiredMock).toHaveBeenCalledWith('trg-row-1');
  });

  it('short-circuits on duplicate handler invocation (deliveryId claim already set)', async () => {
    // The dedupe claim returns null = already claimed = duplicate.
    redisSetMock.mockResolvedValueOnce(null);

    const result = await invoke(event());

    expect(result).toMatchObject({
      dispatched: 'noop',
      reason: 'duplicate_handler',
    });
    expect(findByComposioIdMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(stampFiredMock).not.toHaveBeenCalled();
  });

  it('drops when the connection no longer exists', async () => {
    findByComposioIdMock.mockResolvedValueOnce(null);
    const result = await invoke(event());
    expect(result).toMatchObject({ dispatched: 'noop', reason: 'no_connection' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('drops when the connection is not active', async () => {
    findByComposioIdMock.mockResolvedValueOnce(activeConnection({ status: 'expired' }));
    const result = await invoke(event());
    expect(result).toMatchObject({ dispatched: 'noop', reason: 'connection_inactive' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('drops on toolkit mismatch between event and connection (defense-in-depth)', async () => {
    findByComposioIdMock.mockResolvedValueOnce(activeConnection({ toolkit: 'hubspot' }));
    const result = await invoke(event({ toolkitSlug: 'gmail' }));
    expect(result).toMatchObject({ dispatched: 'noop', reason: 'toolkit_mismatch' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('drops when no IntegrationTrigger row matches the composioTriggerId', async () => {
    findTriggerMock.mockResolvedValueOnce(null);
    const result = await invoke(event());
    expect(result).toMatchObject({ dispatched: 'noop', reason: 'no_trigger' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('drops when the trigger row is paused', async () => {
    findTriggerMock.mockResolvedValueOnce(activeTrigger({ status: 'paused' }));
    const result = await invoke(event());
    expect(result).toMatchObject({ dispatched: 'noop', reason: 'trigger_paused' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('drops when the per-space daily cap is exceeded', async () => {
    redisIncrMock.mockResolvedValueOnce(101); // over the cap of 100
    const result = await invoke(event());
    expect(result).toMatchObject({ dispatched: 'noop', reason: 'space_daily_cap' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('sets the daily-cap TTL only on the first event of the window (count===1)', async () => {
    redisIncrMock.mockResolvedValueOnce(1);
    await invoke(event());
    expect(redisExpireMock).toHaveBeenCalled();
  });

  it('does NOT stamp lastFiredAt when dispatch returns noop', async () => {
    dispatchMock.mockResolvedValueOnce({ dispatched: 'noop', reason: 'thin_payload' });
    await invoke(event());
    expect(stampFiredMock).not.toHaveBeenCalled();
  });

  // ── IntegrationEvent capture ─────────────────────────────────────────

  it('captures exactly one IntegrationEvent and still dispatches on the happy path', async () => {
    await invoke(event());

    // Exactly one capture, with the resolved connection/trigger context and
    // status 'captured'.
    expect(captureEventMock).toHaveBeenCalledTimes(1);
    expect(captureEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'space-1',
        connectionId: 'conn-1',
        triggerId: 'trg-row-1',
        toolkit: 'gmail',
        slug: 'GMAIL_NEW_GMAIL_MESSAGE',
        deliveryId: 'msg_abc',
        payload: { subject: 'Hi' },
        status: 'captured',
      }),
    );
    // Capture does NOT replace dispatch — both happen.
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    // Outcome stamped 'dispatched' on a real dispatch.
    expect(setEventStatusMock).toHaveBeenCalledWith('msg_abc', 'dispatched');
  });

  it('is idempotent on a repeated deliveryId — second invocation captures nothing', async () => {
    // Real dedupe behaviour: the first claim succeeds, a redelivery of the
    // SAME deliveryId finds the claim already set (Redis NX → null) and the
    // handler short-circuits before capture. Net: exactly one row written
    // across both deliveries, first still dispatched. (The DB unique index +
    // ignoreDuplicates is the second line of defense, tested directly against
    // captureEvent in integrations-triggers.test.ts.)
    redisSetMock.mockResolvedValueOnce('OK'); // 1st delivery claims
    const first = await invoke(event());
    redisSetMock.mockResolvedValueOnce(null); // 2nd delivery: already claimed
    const second = await invoke(event());

    expect(first).toMatchObject({ dispatched: 'DRAFT' });
    expect(second).toMatchObject({ dispatched: 'noop', reason: 'duplicate_handler' });
    // Exactly one capture total across the repeated deliveryId.
    expect(captureEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('captures BEFORE the daily cap gate — capped events are persisted then marked skipped', async () => {
    redisIncrMock.mockResolvedValueOnce(101); // over the cap of 100
    const result = await invoke(event());

    expect(result).toMatchObject({ dispatched: 'noop', reason: 'space_daily_cap' });
    // Capture still happened even though dispatch was skipped by the cap.
    expect(captureEventMock).toHaveBeenCalledTimes(1);
    // And the event was moved to 'skipped'.
    expect(setEventStatusMock).toHaveBeenCalledWith('msg_abc', 'skipped');
    // Dispatch was NOT invoked.
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('marks the event skipped when dispatch returns a noop (thin payload)', async () => {
    dispatchMock.mockResolvedValueOnce({ dispatched: 'noop', reason: 'thin_payload' });
    await invoke(event());
    expect(captureEventMock).toHaveBeenCalledTimes(1);
    expect(setEventStatusMock).toHaveBeenCalledWith('msg_abc', 'skipped');
  });

  it('marks the event failed and rethrows when dispatch throws', async () => {
    dispatchMock.mockRejectedValueOnce(new Error('modal down'));
    await expect(invoke(event())).rejects.toThrow('modal down');
    // Event was captured first, then flipped to 'failed' before the rethrow.
    expect(captureEventMock).toHaveBeenCalledTimes(1);
    expect(setEventStatusMock).toHaveBeenCalledWith('msg_abc', 'failed');
  });

  it('does NOT capture when the trigger is paused (capture follows trigger resolution)', async () => {
    findTriggerMock.mockResolvedValueOnce(activeTrigger({ status: 'paused' }));
    await invoke(event());
    expect(captureEventMock).not.toHaveBeenCalled();
  });
});
