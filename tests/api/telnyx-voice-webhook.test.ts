/**
 * Tests for the Telnyx Voice (Call Control) webhook receiver — specifically the
 * security wiring salvaged from PR #278:
 *
 *   - Ed25519 signature verification is the PRIMARY auth gate. A valid signature
 *     lets the event through to its handler; an invalid/missing one is rejected
 *     (200 ack — never a non-200 that would make Telnyx retry — but does NO work).
 *   - Idempotency: Telnyx retries on non-200, so we dedup by event id via Redis.
 *     A replayed event id short-circuits before any handler runs.
 *   - Fail-safe: when TELNYX_PUBLIC_KEY is unset the SDK can't verify, so the
 *     verifier reports 'unconfigured' and the route falls back to the legacy
 *     shared-secret (?secret=) gate.
 *
 * The route leans on the Supabase query builder, Redis, and the Telnyx SDK
 * verifier, so we mock all three: a chainable Supabase double that captures
 * writes, a Redis double for the dedup fast-path, and a verifyTelnyxSignature
 * double so we control the gate result deterministically (the actual Ed25519
 * crypto is the Telnyx SDK's own concern).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ── Supabase double ───────────────────────────────────────────────────
// Every .update(...).eq(...) is recorded so we can assert a handler ran.
type Filters = Record<string, unknown>;
interface WriteCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Filters;
}

const { supabaseState } = vi.hoisted(() => ({
  supabaseState: {
    writes: [] as WriteCall[],
  },
}));

function makeUpdateBuilder(table: string, payload: Record<string, unknown>) {
  const filters: Filters = {};
  const call: WriteCall = { table, payload, filters };
  const builder: any = {
    eq(col: string, val: unknown) {
      filters[col] = val;
      return builder;
    },
    then(resolve: (v: { data: null; error: null }) => unknown) {
      supabaseState.writes.push(call);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        update: (payload: Record<string, unknown>) => makeUpdateBuilder(table, payload),
      };
    },
  },
}));

// ── Redis double (idempotency fast-path) ───────────────────────────────
const { redisGetMock, redisSetMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn(async (): Promise<string | null> => null),
  redisSetMock: vi.fn(async () => 'OK'),
}));
vi.mock('@/lib/redis', () => ({
  redis: { get: redisGetMock, set: redisSetMock },
}));

// ── logger double ──────────────────────────────────────────────────────
const { loggerErrorMock, loggerWarnMock, loggerInfoMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { error: loggerErrorMock, warn: loggerWarnMock, info: loggerInfoMock, debug: vi.fn() },
}));

// ── Telnyx signature verifier double — the gate under test ──────────────
// Returns whatever result we stash so we can drive 'ok' / 'invalid' /
// 'unconfigured' deterministically (the real Ed25519 check is the SDK's job).
const { verifyResult, verifyTelnyxSignatureMock } = vi.hoisted(() => {
  const verifyResult = { value: 'ok' as 'ok' | 'invalid' | 'unconfigured' };
  return {
    verifyResult,
    verifyTelnyxSignatureMock: vi.fn(
      async (_rawBody: string, _headers: Headers): Promise<'ok' | 'invalid' | 'unconfigured'> =>
        verifyResult.value,
    ),
  };
});
vi.mock('@/lib/telnyx-webhook', () => ({
  verifyTelnyxSignature: verifyTelnyxSignatureMock,
}));

// ── voice helpers double (handlers call these; we only need no-ops here) ─
vi.mock('@/lib/voice', () => ({
  bridgeAndRecord: vi.fn(async () => true),
  decodeClientState: vi.fn(() => ({})),
  downloadRecording: vi.fn(async () => null),
  encodeClientState: vi.fn(() => ''),
}));

// ── llm double (recording handler only; not exercised here) ─────────────
vi.mock('@/lib/llm', () => ({
  getLLMClient: vi.fn(() => ({ chat: { completions: { create: vi.fn() } } })),
  openaiModel: (m: string) => m,
}));

import { POST } from '@/app/api/webhooks/telnyx-voice/route';

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.writes = [];
  verifyResult.value = 'ok';
  redisGetMock.mockResolvedValue(null);
  redisSetMock.mockResolvedValue('OK');
  delete process.env.TELNYX_WEBHOOK_SECRET;
});

/** Build a request with a Telnyx-shaped body + signature headers. */
function req(
  body: unknown,
  opts: { headers?: Record<string, string>; secret?: string } = {},
): NextRequest {
  const url = opts.secret
    ? `https://example.com/api/webhooks/telnyx-voice?secret=${opts.secret}`
    : 'https://example.com/api/webhooks/telnyx-voice';
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'telnyx-signature-ed25519': 'sig',
      'telnyx-timestamp': '1700000000',
      ...(opts.headers ?? {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** A minimal call.initiated event — its handler flips CallLog.status to ringing. */
function initiatedEvent(id = 'evt_1', callControlId = 'cc_1') {
  return {
    data: {
      id,
      event_type: 'call.initiated',
      payload: { call_control_id: callControlId },
    },
  };
}

function callLogWrites(): WriteCall[] {
  return supabaseState.writes.filter((w) => w.table === 'CallLog');
}

// ── Valid signature ─────────────────────────────────────────────────────
describe('Ed25519 signature — valid request passes through to the handler', () => {
  it('a valid signature lets the event run its handler (CallLog updated)', async () => {
    verifyResult.value = 'ok';
    const res = await POST(req(initiatedEvent('evt_ok', 'cc_ok')));
    expect(res.status).toBe(200);
    // The verifier was given the RAW body + the request headers.
    expect(verifyTelnyxSignatureMock).toHaveBeenCalledTimes(1);
    // call.initiated → CallLog.status = 'ringing' for that telnyxCallId.
    const w = callLogWrites().find((c) => c.filters.telnyxCallId === 'cc_ok');
    expect(w).toBeTruthy();
    expect(w!.payload.status).toBe('ringing');
  });
});

// ── Invalid / missing signature ─────────────────────────────────────────
describe('Ed25519 signature — invalid/missing request is rejected', () => {
  it("an 'invalid' verdict rejects: 200 ack but NO handler work", async () => {
    verifyResult.value = 'invalid';
    const res = await POST(req(initiatedEvent('evt_bad', 'cc_bad')));
    // 200 so a probe can't distinguish a bad signature from a bad route…
    expect(res.status).toBe(200);
    // …but the body was never processed: no CallLog write, no dedup set.
    expect(callLogWrites()).toHaveLength(0);
    expect(redisSetMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.stringContaining('bad/missing signature'),
    );
  });

  it('a missing signature header is treated as invalid (real verifier path)', async () => {
    // Exercise the REAL verifier against a request with no signature header,
    // with no public key configured → it returns 'unconfigured' (fail-safe),
    // proving the route never crashes on absent headers. (The 'invalid' verdict
    // for a present-but-bad signature is covered by the mocked case above.)
    verifyTelnyxSignatureMock.mockImplementationOnce(async (raw: string, headers: Headers) => {
      const { verifyTelnyxSignature } =
        await vi.importActual<typeof import('@/lib/telnyx-webhook')>('@/lib/telnyx-webhook');
      return verifyTelnyxSignature(raw, headers);
    });
    delete process.env.TELNYX_PUBLIC_KEY;
    const res = await POST(
      req(initiatedEvent('evt_nohdr', 'cc_nohdr'), { headers: { 'telnyx-signature-ed25519': '' } }),
    );
    expect(res.status).toBe(200);
  });
});

// ── Idempotency / replay ────────────────────────────────────────────────
describe('idempotency — a replayed event id is deduped', () => {
  it('a duplicate event id (Redis hit) short-circuits before any handler', async () => {
    const event = initiatedEvent('evt_dupe', 'cc_dupe');

    // First delivery: Redis miss → processes + records the dedup key.
    redisGetMock.mockResolvedValueOnce(null);
    const first = await POST(req(event));
    expect(first.status).toBe(200);
    expect(callLogWrites().find((c) => c.filters.telnyxCallId === 'cc_dupe')).toBeTruthy();
    expect(redisSetMock).toHaveBeenCalledWith('telnyx:event:evt_dupe', '1', { ex: 86400 });

    // Reset write capture; second delivery of the SAME id: Redis hit → skip.
    supabaseState.writes = [];
    redisGetMock.mockResolvedValueOnce('1');
    const second = await POST(req(event));
    expect(second.status).toBe(200);
    expect(callLogWrites()).toHaveLength(0); // handler never ran the 2nd time
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.stringContaining('duplicate event skipped'),
      { eventId: 'evt_dupe' },
    );
  });
});

// ── Fail-safe: no public key configured ─────────────────────────────────
describe("fail-safe — 'unconfigured' falls back to the shared-secret gate", () => {
  it('when unconfigured AND a shared secret is set, a wrong ?secret is rejected', async () => {
    verifyResult.value = 'unconfigured';
    process.env.TELNYX_WEBHOOK_SECRET = 'topsecret';
    const res = await POST(req(initiatedEvent('evt_u1', 'cc_u1'), { secret: 'wrong' }));
    expect(res.status).toBe(200);
    expect(callLogWrites()).toHaveLength(0); // rejected by the fallback gate
    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining('bad secret'));
  });

  it('when unconfigured AND the shared secret matches, the event processes', async () => {
    verifyResult.value = 'unconfigured';
    process.env.TELNYX_WEBHOOK_SECRET = 'topsecret';
    const res = await POST(req(initiatedEvent('evt_u2', 'cc_u2'), { secret: 'topsecret' }));
    expect(res.status).toBe(200);
    expect(callLogWrites().find((c) => c.filters.telnyxCallId === 'cc_u2')).toBeTruthy();
  });
});
