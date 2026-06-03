/**
 * Guards for the shared request-validation layer (lib/validation.ts).
 *
 * These pin the contract the high-risk routes depend on:
 *   - oversized bodies are rejected with 413 whether or not Content-Length
 *     is honest (a lying/absent header must not smuggle a huge body through),
 *   - malformed / empty JSON yields a calm lowercase 400,
 *   - zod failures yield a clean 400 with field paths and no zod internals,
 *   - valid input passes through untouched.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });
}

describe('readJsonWithLimit', () => {
  it('parses a valid JSON body within the limit', async () => {
    const res = await readJsonWithLimit(jsonRequest('{"a":1}'), BODY_LIMITS.smallJson);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ a: 1 });
  });

  it('rejects an honest oversized Content-Length with 413', async () => {
    const res = await readJsonWithLimit(
      jsonRequest('{}', { 'content-length': String(BODY_LIMITS.smallJson + 1) }),
      BODY_LIMITS.smallJson,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(413);
  });

  it('rejects an oversized body even when the header lies (no/short length)', async () => {
    const huge = JSON.stringify({ x: 'a'.repeat(BODY_LIMITS.smallJson + 100) });
    // Deliberately do NOT set a truthful content-length — force the
    // post-read byte check to do the work.
    const res = await readJsonWithLimit(jsonRequest(huge), BODY_LIMITS.smallJson);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(413);
  });

  it('rejects an empty body with 400', async () => {
    const res = await readJsonWithLimit(jsonRequest('   '), BODY_LIMITS.smallJson);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(400);
  });

  it('rejects malformed JSON with a calm lowercase 400', async () => {
    const res = await readJsonWithLimit(jsonRequest('{not json'), BODY_LIMITS.smallJson);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(400);
      const payload = (await res.response.json()) as { error: string };
      expect(payload.error).toBe('invalid json body');
    }
  });
});

describe('parseOrBadRequest', () => {
  const schema = z.object({ name: z.string().min(1), count: z.number() });

  it('passes valid data through', () => {
    const res = parseOrBadRequest(schema, { name: 'x', count: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ name: 'x', count: 2 });
  });

  it('returns a clean 400 with field paths on failure', async () => {
    const res = parseOrBadRequest(schema, { name: '', count: 'nope' });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(400);
      const payload = (await res.response.json()) as {
        error: string;
        fields: Array<{ path: string; message: string }>;
      };
      expect(payload.error).toBe('invalid request');
      const paths = payload.fields.map((f) => f.path).sort();
      expect(paths).toEqual(['count', 'name']);
    }
  });
});
