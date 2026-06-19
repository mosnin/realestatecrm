/**
 * Route-level test for GET /api/cron/notification-digest.
 *
 * The cron sends the opt-in roll-up email and is the centerpiece of the digest
 * feature. Tests cover:
 *   - Auth (Bearer CRON_SECRET; unset → 500, wrong → 401)
 *   - Kill switch (CRON_DIGEST_DISABLED)
 *   - Redis day-lock idempotency (second invocation same day → skipped)
 *   - DEFAULT-OFF: no opted-in rows → sends to nobody
 *   - Happy path: a daily opt-in with events → ONE digest sent + lastDigestAt stamped
 *   - Per-period idempotency: a target whose lastDigestAt is within the window
 *     is skipped even if the lock is bypassed
 *   - Weekly cadence only runs on Mondays
 *
 * resolveEffectivePrefs / buildDigestSections / sendNotificationDigest / redis
 * are mocked so the test exercises the cron's ORCHESTRATION + idempotency,
 * which is the logic that lives in the route. The batching itself is covered in
 * tests/lib/notify-digest.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────
const sendNotificationDigest = vi.fn(async (..._a: any[]) => undefined);
vi.mock('@/lib/email', () => ({ sendNotificationDigest: (...a: any[]) => sendNotificationDigest(...a) }));

const resolveEffectivePrefs = vi.fn();
vi.mock('@/lib/notify-prefs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notify-prefs')>('@/lib/notify-prefs');
  return { ...actual, resolveEffectivePrefs: (...a: any[]) => resolveEffectivePrefs(...a) };
});

const buildDigestSections = vi.fn();
vi.mock('@/lib/notify-digest', async () => {
  const actual = await vi.importActual<typeof import('@/lib/notify-digest')>('@/lib/notify-digest');
  return { ...actual, buildDigestSections: (...a: any[]) => buildDigestSections(...a) };
});

// Redis lock: configurable per test (OK = claimed, null = already locked).
let lockResult: string | null = 'OK';
const redisSet = vi.fn(async (..._a: any[]) => lockResult);
vi.mock('@/lib/redis', () => ({ redis: { set: (...a: any[]) => redisSet(...a) } }));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Sentry wrapper passthrough so monitorCron doesn't phone home.
vi.mock('@sentry/nextjs', () => ({
  captureCheckIn: vi.fn(() => 'check-in-id'),
  captureException: vi.fn(),
}));

// ── Supabase table-routed mock ───────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
// Per-table queue of terminals for SELECT reads (consumed in call order).
let selectQueue: Record<string, Terminal[]> = {};
// Recorded UPDATE calls: { table, set, eqs }.
const updates: Array<{ table: string; set: Record<string, unknown>; eqs: Array<[string, unknown]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const eqs: Array<[string, unknown]> = [];
    let isUpdate = false;
    let updateSet: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {};

    chain.select = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.update = vi.fn((set: Record<string, unknown>) => {
      isUpdate = true;
      updateSet = set;
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      eqs.push([col, val]);
      return chain;
    });

    const nextSelect = (): Terminal => (selectQueue[table] ?? []).shift() ?? { data: [], error: null };
    chain.maybeSingle = vi.fn(() => Promise.resolve(nextSelect()));
    chain.then = (resolve: (v: Terminal) => unknown) => {
      // Updates resolve to {error:null}; selects pull from the queue. The update
      // is recorded here (when awaited) so ALL its .eq() filters are captured.
      if (isUpdate) {
        updates.push({ table, set: updateSet, eqs: [...eqs] });
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
      return Promise.resolve(nextSelect()).then(resolve);
    };
    return chain;
  }
  return { supabase: { from: vi.fn((t: string) => makeChain(t)) } };
});

import { GET } from '@/app/api/cron/notification-digest/route';

// ── Helpers ──────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/notification-digest', { method: 'GET', headers });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

const dailyPrefs = {
  channels: { email: true, sms: false, push: true },
  eventTypes: { newLeads: true, tourBookings: true, newDeals: true, followUps: true },
  digestCadence: 'daily' as const,
};

const SAVED = {
  secret: process.env.CRON_SECRET,
  disabled: process.env.CRON_DIGEST_DISABLED,
  kvUrl: process.env.KV_REST_API_URL,
  kvToken: process.env.KV_REST_API_TOKEN,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  selectQueue = {};
  updates.length = 0;
  lockResult = 'OK';
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_DIGEST_DISABLED;
  // Redis configured by default so the day-lock path is exercised; the
  // Redis-absent behavior is covered explicitly in its own test.
  process.env.KV_REST_API_URL = 'https://kv.example';
  process.env.KV_REST_API_TOKEN = 'kv-token';
  // Default stubs; individual tests override.
  resolveEffectivePrefs.mockResolvedValue(dailyPrefs);
  buildDigestSections.mockResolvedValue([{ label: 'New leads', href: '/leads', items: ['Jane'] }]);
});

afterEach(() => {
  for (const [k, v] of [
    ['CRON_SECRET', SAVED.secret],
    ['CRON_DIGEST_DISABLED', SAVED.disabled],
    ['KV_REST_API_URL', SAVED.kvUrl],
    ['KV_REST_API_TOKEN', SAVED.kvToken],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('GET /api/cron/notification-digest — auth', () => {
  it('missing Authorization → 401', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(sendNotificationDigest).not.toHaveBeenCalled();
  });
  it('wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
  });
  it('unset CRON_SECRET → 500 server misconfigured', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
  });
});

describe('GET /api/cron/notification-digest — guards', () => {
  it('CRON_DIGEST_DISABLED=1 → 200 disabled, no work', async () => {
    process.env.CRON_DIGEST_DISABLED = '1';
    const res = await invoke('Bearer test-secret');
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(redisSet).not.toHaveBeenCalled();
  });

  it('day-lock already held → 200 skipped, sends nothing', async () => {
    lockResult = null; // SETNX returns null when the key exists
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.skipped).toBe('already_ran_today');
    expect(sendNotificationDigest).not.toHaveBeenCalled();
  });

  it('Redis unconfigured → does NOT no-op; proceeds and relies on per-target stamps', async () => {
    // Without KV env vars, redis.set returns null (no-op proxy) just like a held
    // lock. The cron must NOT treat that as "already ran" — it should run the
    // sweep so the per-target lastDigestAt guard does the deduping.
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
    lockResult = null;
    selectQueue = {
      SpaceSetting: [{ data: [{ spaceId: 'space_1', digestCadence: 'daily', lastDigestAt: null }], error: null }],
      NotificationPreference: [{ data: [], error: null }],
      Space: [
        { data: [{ id: 'space_1', ownerId: 'user_1' }], error: null },
        { data: { name: 'Acme', slug: 'acme', ownerId: 'user_1' }, error: null },
      ],
      User: [
        { data: [{ id: 'user_1', clerkId: 'clerk_1' }], error: null },
        { data: { email: 'owner@acme.com' }, error: null },
      ],
    };

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.skipped).toBeUndefined();
    expect(body.sent).toBe(1);
    expect(sendNotificationDigest).toHaveBeenCalledTimes(1);
    // The lock SETNX should not even be attempted when Redis is unconfigured.
    expect(redisSet).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/notification-digest — default-off changes nothing', () => {
  it('no opted-in rows → sends to nobody', async () => {
    // SpaceSetting + NotificationPreference both empty.
    selectQueue = { SpaceSetting: [{ data: [], error: null }], NotificationPreference: [{ data: [], error: null }] };
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.targets).toBe(0);
    expect(body.sent).toBe(0);
    expect(sendNotificationDigest).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/notification-digest — happy path + idempotency', () => {
  function queueOneSpaceOptIn(lastDigestAt: string | null) {
    selectQueue = {
      SpaceSetting: [{ data: [{ spaceId: 'space_1', digestCadence: 'daily', lastDigestAt }], error: null }],
      NotificationPreference: [{ data: [], error: null }],
      // Space + User lookups for owner clerk resolution, then resolveRecipient.
      Space: [
        { data: [{ id: 'space_1', ownerId: 'user_1' }], error: null }, // owner resolution (.in)
        { data: { name: 'Acme', slug: 'acme', ownerId: 'user_1' }, error: null }, // resolveRecipient (.maybeSingle)
      ],
      User: [
        { data: [{ id: 'user_1', clerkId: 'clerk_1' }], error: null }, // owner clerk resolution (.in)
        { data: { email: 'owner@acme.com' }, error: null }, // resolveRecipient owner email (.maybeSingle)
      ],
    };
  }

  it('a daily space opt-in with events → ONE digest sent + lastDigestAt stamped', async () => {
    queueOneSpaceOptIn(null);
    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    expect(body.sent).toBe(1);
    expect(sendNotificationDigest).toHaveBeenCalledTimes(1);
    expect(sendNotificationDigest).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'owner@acme.com', cadence: 'daily', spaceSlug: 'acme' }),
    );
    // Idempotency stamp written to SpaceSetting for this space.
    const stamp = updates.find((u) => u.table === 'SpaceSetting');
    expect(stamp).toBeDefined();
    expect(stamp!.set).toHaveProperty('lastDigestAt');
    expect(stamp!.eqs).toContainEqual(['spaceId', 'space_1']);
  });

  it('lastDigestAt earlier today (same UTC date) → skipped, no second send', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T08:00:00.000Z')); // Wednesday, mid-morning UTC
    // Stamped earlier the SAME UTC day → already sent this calendar period.
    queueOneSpaceOptIn('2026-06-17T00:30:00.000Z');
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skippedAlreadySent).toBe(1);
    expect(sendNotificationDigest).not.toHaveBeenCalled();
  });

  it('JITTER-PROOF: lastDigestAt ~23h59m ago but on the PREVIOUS UTC day → still sends', async () => {
    // Regression guard for the idempotency drift bug: an elapsed-ms window of
    // exactly 24h would skip this (gap < 24h), dropping the day's digest. The
    // calendar-bucket check correctly sends because it's a new UTC date.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T07:59:00.000Z'));
    queueOneSpaceOptIn('2026-06-16T08:00:00.000Z'); // ~23h59m earlier, prior day
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.skippedAlreadySent).toBe(0);
    expect(sendNotificationDigest).toHaveBeenCalledTimes(1);
  });

  it('empty period (no events) → no email, but lastDigestAt still stamped', async () => {
    queueOneSpaceOptIn(null);
    buildDigestSections.mockResolvedValueOnce([]); // nothing notable
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.skippedEmpty).toBe(1);
    expect(sendNotificationDigest).not.toHaveBeenCalled();
    // Still stamped so we don't re-scan this target all period.
    expect(updates.find((u) => u.table === 'SpaceSetting')).toBeDefined();
  });
});

describe('GET /api/cron/notification-digest — weekly cadence', () => {
  function queueWeeklyMemberOptIn() {
    selectQueue = {
      SpaceSetting: [{ data: [], error: null }],
      NotificationPreference: [
        { data: [{ spaceId: 'space_1', userId: 'clerk_member', digestCadence: 'weekly', lastDigestAt: null }], error: null },
      ],
      Space: [{ data: { name: 'Acme', slug: 'acme', ownerId: 'user_1' }, error: null }],
      User: [{ data: { email: 'member@acme.com' }, error: null }],
    };
    resolveEffectivePrefs.mockResolvedValue({ ...dailyPrefs, digestCadence: 'weekly' });
  }

  it('weekly target on a Monday → sent', async () => {
    // 2026-06-15 is a Monday (UTC).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
    queueWeeklyMemberOptIn();

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(sendNotificationDigest).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'member@acme.com', cadence: 'weekly' }),
    );
    // Member stamp goes to NotificationPreference, scoped by (space, user).
    const stamp = updates.find((u) => u.table === 'NotificationPreference');
    expect(stamp).toBeDefined();
    expect(stamp!.eqs).toContainEqual(['spaceId', 'space_1']);
    expect(stamp!.eqs).toContainEqual(['userId', 'clerk_member']);
  });

  it('weekly target on a non-Monday → skipped (not the weekly day)', async () => {
    // 2026-06-17 is a Wednesday.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T08:00:00.000Z'));
    queueWeeklyMemberOptIn();

    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(sendNotificationDigest).not.toHaveBeenCalled();
  });
});
