/**
 * Route-level tests for `GET /api/cron/extraction-backfill`.
 *
 * The hourly tick loads Attachment rows stuck at extractionStatus='pending',
 * fetches their stored bytes, runs the shared extractor, and writes the
 * result. Behavioral, not source-grep: the supabase client, storage signing,
 * fetch, and the extractor are mocked; we assert on the summary and on the
 * per-row update payloads.
 *
 * Mock strategy mirrors tests/api/cron-next-moves.test.ts: a queue-driven
 * chainable supabase stub, env snapshot/restore, secrets asserted fail-closed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { getSignedDownloadUrlMock, extractMock } = vi.hoisted(() => ({
  getSignedDownloadUrlMock: vi.fn(),
  extractMock: vi.fn(),
}));

// ── Supabase mock ───────────────────────────────────────────────────────────
type Terminal = { data?: unknown; error?: unknown };
let supabaseQueue: Terminal[] = [];
const supabaseCalls: Array<{ table: string; chain: Array<[string, unknown[]]> }> = [];

vi.mock('@/lib/supabase', () => {
  function makeChain(table: string): Record<string, unknown> {
    const calls: Array<[string, unknown[]]> = [];
    const terminal = supabaseQueue.shift() ?? { data: [], error: null };
    supabaseCalls.push({ table, chain: calls });

    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'or', 'not', 'order', 'limit', 'update']) {
      chain[method] = vi.fn((...args: unknown[]) => {
        calls.push([method, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: Terminal) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve, reject);
    return chain;
  }
  return { supabase: { from: vi.fn((table: string) => makeChain(table)) } };
});

vi.mock('@/lib/storage', () => ({ getSignedDownloadUrl: getSignedDownloadUrlMock }));
vi.mock('@/lib/extraction/extract', () => ({ extractAttachmentText: extractMock }));

import { GET } from '@/app/api/cron/extraction-backfill/route';

// ── fetch mock (byte download) ───────────────────────────────────────────────
type FetchBehavior = 'ok' | 'notFound' | 'throw';
let fetchByUrl: (url: string) => FetchBehavior;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  supabaseQueue = [];
  supabaseCalls.length = 0;

  getSignedDownloadUrlMock.mockImplementation(async (key: string) => `https://signed/${key}`);
  extractMock.mockResolvedValue({ text: 'extracted text', status: 'done' });
  fetchByUrl = () => 'ok';

  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    const behavior = fetchByUrl(url);
    if (behavior === 'throw') throw new Error('network down');
    if (behavior === 'notFound') {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('file bytes').buffer,
    } as unknown as Response;
  }) as unknown as typeof fetch;

  snapshotEnv();
  process.env.CRON_SECRET = 'test-secret';
  delete process.env.CRON_EXTRACTION_BACKFILL_DISABLED;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv();
});

// ── Env helpers ─────────────────────────────────────────────────────────────
const ENV_KEYS = ['CRON_SECRET', 'CRON_EXTRACTION_BACKFILL_DISABLED'] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
function snapshotEnv() {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
}
function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function invoke(authHeader?: string) {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers.Authorization = authHeader;
  const req = new Request('http://localhost/api/cron/extraction-backfill', {
    method: 'GET',
    headers,
  });
  return GET(req as unknown as Parameters<typeof GET>[0]);
}

interface Row {
  id: string;
  spaceId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
}
function row(id: string, over: Partial<Row> = {}): Row {
  return {
    id,
    spaceId: `sp_${id}`,
    storagePath: `chat-attachments/sp_${id}/${id}-doc.pdf`,
    filename: `${id}-doc.pdf`,
    mimeType: 'application/pdf',
    ...over,
  };
}

/** Find every Attachment update call and its {payload, id}. */
function updateCalls(): Array<{ id: unknown; payload: Record<string, unknown> }> {
  return supabaseCalls
    .filter((c) => c.table === 'Attachment' && c.chain.some(([m]) => m === 'update'))
    .map((c) => {
      const update = c.chain.find(([m]) => m === 'update');
      const eq = c.chain.find(([m]) => m === 'eq');
      return {
        id: eq?.[1]?.[1],
        payload: (update?.[1]?.[0] ?? {}) as Record<string, unknown>,
      };
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('GET /api/cron/extraction-backfill — auth & kill switch', () => {
  it('rejects a missing Authorization header → 401, no DB read', async () => {
    const res = await invoke(undefined);
    expect(res.status).toBe(401);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('rejects the wrong secret → 401', async () => {
    const res = await invoke('Bearer nope');
    expect(res.status).toBe(401);
    expect(supabaseCalls).toHaveLength(0);
  });

  it('missing CRON_SECRET env fails closed → 500', async () => {
    delete process.env.CRON_SECRET;
    const res = await invoke('Bearer test-secret');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Server misconfigured' });
    expect(supabaseCalls).toHaveLength(0);
  });

  it('CRON_EXTRACTION_BACKFILL_DISABLED short-circuits → 200 disabled, no DB read', async () => {
    process.env.CRON_EXTRACTION_BACKFILL_DISABLED = '1';
    supabaseQueue = [{ data: [row('a1')], error: null }];
    const res = await invoke('Bearer test-secret');
    expect(await res.json()).toEqual({ status: 'disabled' });
    expect(supabaseCalls).toHaveLength(0);
  });
});

describe('GET /api/cron/extraction-backfill — selection', () => {
  it('no pending rows → 200 zeroed, only the Attachment read runs', async () => {
    supabaseQueue = [{ data: [], error: null }];
    const res = await invoke('Bearer test-secret');
    const body = await res.json();
    expect(body).toMatchObject({ pending: 0, done: 0, failed: 0, skipped: 0, fetchSkipped: 0 });
    expect(supabaseCalls.map((c) => c.table)).toEqual(['Attachment']);
  });

  it('the due query targets pending rows with a storagePath, oldest first, capped at 50', async () => {
    supabaseQueue = [{ data: [], error: null }];
    await invoke('Bearer test-secret');
    const chain = supabaseCalls[0].chain;
    expect(chain).toContainEqual(['eq', ['extractionStatus', 'pending']]);
    expect(chain).toContainEqual(['not', ['storagePath', 'is', null]]);
    expect(chain).toContainEqual(['order', ['createdAt', { ascending: true }]]);
    expect(chain).toContainEqual(['limit', [50]]);
  });
});

describe('GET /api/cron/extraction-backfill — processing', () => {
  it('extracts a pending row and writes the text + done status', async () => {
    supabaseQueue = [{ data: [row('a1')], error: null }];
    extractMock.mockResolvedValue({ text: 'hello world', status: 'done' });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    expect(body).toMatchObject({ pending: 1, done: 1, failed: 0, skipped: 0, fetchSkipped: 0 });
    expect(extractMock).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', 'a1-doc.pdf');
    const updates = updateCalls();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      id: 'a1',
      payload: { extractedText: 'hello world', extractionStatus: 'done' },
    });
  });

  it('marks a genuine parse failure as failed (terminal)', async () => {
    supabaseQueue = [{ data: [row('bad')], error: null }];
    extractMock.mockResolvedValue({ text: null, status: 'failed' });

    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    expect(body).toMatchObject({ pending: 1, done: 0, failed: 1, fetchSkipped: 0 });
    const updates = updateCalls();
    expect(updates[0].payload).toEqual({ extractedText: null, extractionStatus: 'failed' });
  });

  it('leaves a row pending (no update) when its bytes cannot be fetched', async () => {
    supabaseQueue = [{ data: [row('unreachable')], error: null }];
    fetchByUrl = () => 'notFound';

    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    expect(body).toMatchObject({ pending: 1, done: 0, failed: 0, fetchSkipped: 1 });
    // No extraction attempted, and crucially NO update — the row stays pending.
    expect(extractMock).not.toHaveBeenCalled();
    expect(updateCalls()).toHaveLength(0);
  });

  it('leaves a row pending when the signed-URL fetch throws', async () => {
    supabaseQueue = [{ data: [row('flaky')], error: null }];
    fetchByUrl = () => 'throw';

    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    expect(body).toMatchObject({ pending: 1, fetchSkipped: 1 });
    expect(updateCalls()).toHaveLength(0);
  });

  it('one failure never aborts the batch — mixed rows each get their own outcome', async () => {
    supabaseQueue = [
      { data: [row('ok1'), row('unreachable'), row('bad'), row('ok2')], error: null },
    ];
    // ok1/ok2 succeed; unreachable can't be fetched; bad fails to parse.
    fetchByUrl = (url) => (url.includes('unreachable') ? 'notFound' : 'ok');
    extractMock.mockImplementation(async (_buf: Buffer, _mime: string, filename: string) =>
      filename.startsWith('bad')
        ? { text: null, status: 'failed' }
        : { text: `text-${filename}`, status: 'done' },
    );

    const res = await invoke('Bearer test-secret');
    const body = await res.json();

    expect(body).toMatchObject({ pending: 4, done: 2, failed: 1, skipped: 0, fetchSkipped: 1 });
    const updates = updateCalls();
    // Three writes: ok1, ok2 (done) and bad (failed). unreachable is never written.
    expect(updates).toHaveLength(3);
    const byId = Object.fromEntries(updates.map((u) => [u.id, u.payload]));
    expect(byId['ok1']).toMatchObject({ extractionStatus: 'done' });
    expect(byId['ok2']).toMatchObject({ extractionStatus: 'done' });
    expect(byId['bad']).toMatchObject({ extractionStatus: 'failed' });
    expect(byId['unreachable']).toBeUndefined();
  });
});
