/**
 * Request-validation guard layer — shared across the high-risk user-facing
 * routes (free-form AI POSTs, file uploads). This is a GUARD layer only: it
 * never changes behavior for valid input. It exists to reject oversized or
 * malformed payloads BEFORE they reach business logic, the LLM, or storage.
 *
 * Two concerns:
 *   1. Body size — `readJsonWithLimit` reads the body, rejects anything past
 *      a byte cap (checked against Content-Length first, then enforced on the
 *      actual bytes so a lying/absent header can't sneak a huge body through),
 *      and parses it as JSON.
 *   2. Shape — `parseOrBadRequest` runs a zod schema and turns a failure into
 *      a clean, calm, lowercase 400 instead of leaking zod internals.
 *
 * The existing per-route limits (8000-char message cap, 1 MB intake cap, the
 * lib/storage/limits.ts MIME+magic-byte validator) stay where they are — this
 * file complements them, it does not replace them.
 */

import { NextResponse } from 'next/server';
import type { z } from 'zod';

const KB = 1024;

/** Default body-size caps (bytes) by route shape. */
export const BODY_LIMITS = {
  /** Free-form AI/agent text turns. A 8000-char message + history + a handful
   *  of attachment ids is well under this; anything larger is abuse. */
  aiText: 64 * KB,
  /** Small JSON command bodies (directive, goal, etc.). */
  smallJson: 16 * KB,
} as const;

export interface JsonReadOk {
  ok: true;
  data: unknown;
}
export interface JsonReadErr {
  ok: false;
  response: NextResponse;
}
export type JsonReadResult = JsonReadOk | JsonReadErr;

/**
 * Read a request body as JSON, rejecting anything over `maxBytes`.
 *
 * Order matters: we check the declared Content-Length first (cheap, rejects
 * before reading), then re-check the actual decoded byte length (a missing or
 * lying header can't smuggle a large body past the cap). Calm lowercase 400s
 * on failure — never leak parser internals.
 */
export async function readJsonWithLimit(
  req: Request,
  maxBytes: number,
): Promise<JsonReadResult> {
  const declared = parseInt(req.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'request body too large' }, { status: 413 }),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'could not read request body' }, { status: 400 }),
    };
  }

  // Enforce on the actual bytes — the header is advisory and can be absent.
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'request body too large' }, { status: 413 }),
    };
  }

  if (!raw.trim()) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'request body is required' }, { status: 400 }),
    };
  }

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'invalid json body' }, { status: 400 }),
    };
  }
}

/**
 * Read an optional JSON request body. Empty bodies resolve to the provided
 * fallback instead of failing; oversized or malformed non-empty bodies still
 * fail closed.
 */
export async function readOptionalJsonWithLimit(
  req: Request,
  maxBytes: number,
  fallback: unknown = {},
): Promise<JsonReadResult> {
  const declared = parseInt(req.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'request body too large' }, { status: 413 }),
    };
  }

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'could not read request body' }, { status: 400 }),
    };
  }

  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'request body too large' }, { status: 413 }),
    };
  }

  if (!raw.trim()) {
    return { ok: true, data: fallback };
  }

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'invalid json body' }, { status: 400 }),
    };
  }
}

export interface ParseOk<T> {
  ok: true;
  data: T;
}
export interface ParseErr {
  ok: false;
  response: NextResponse;
}
export type ParseResult<T> = ParseOk<T> | ParseErr;

/**
 * Validate `data` against a zod schema. On failure, return a clean 400 with a
 * calm lowercase message and the field paths that failed (no zod internals,
 * no stack, no raw input echoed back).
 */
export function parseOrBadRequest<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): ParseResult<z.infer<S>> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const fields = result.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
  return {
    ok: false,
    response: NextResponse.json(
      { error: 'invalid request', fields },
      { status: 400 },
    ),
  };
}
