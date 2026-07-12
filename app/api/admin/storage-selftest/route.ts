/**
 * GET /api/admin/storage-selftest — one-click diagnosis for "photos are broken."
 *
 * Property photos can fail two different ways that look identical to a user:
 * the UPLOAD write failing (missing/wrong Wasabi env), or the upload
 * succeeding while the public URL 403s (bucket not serving public reads /
 * wrong public base URL) — in which case every photo on the properties pages
 * renders broken regardless of file type or size.
 *
 * This route walks the whole chain and reports each step:
 *   1. env      — which WASABI_* vars are present (names only, never values)
 *   2. write    — PUT a 1-pixel PNG with public-read ACL
 *   3. public   — unauthenticated HTTP GET of its public URL (what a
 *                 visitor's <img> tag does). 200 = photos will render;
 *                 403 = bucket is blocking public reads → the smoking gun.
 *   4. signed   — GET via a presigned URL (proves creds/bucket are right
 *                 even when public access is the broken part)
 *   5. cleanup  — delete the test object
 *
 * Platform-admin only. The test object lives under `files/<diagnostic id>` and
 * is removed on the way out (best-effort).
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requirePlatformAdmin } from '@/lib/permissions';
import {
  uploadObject,
  getPublicUrl,
  getSignedDownloadUrl,
  deleteObject,
  buildKey,
} from '@/lib/storage';
import { isWasabiConfigured } from '@/lib/storage/client';

export const runtime = 'nodejs';

// A valid 1x1 transparent PNG (67 bytes).
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type StepResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

export async function GET() {
  try {
    await requirePlatformAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const steps: Record<string, StepResult> = {};

  // 1. Env presence — names only. The most common failure is simply a var
  //    missing in the deployment environment.
  const ENV_KEYS = [
    'WASABI_ACCESS_KEY_ID',
    'WASABI_SECRET_ACCESS_KEY',
    'WASABI_BUCKET',
    'WASABI_ENDPOINT',
    'WASABI_REGION',
    'WASABI_PUBLIC_BASE_URL',
  ] as const;
  const missing = ENV_KEYS.filter((k) => !process.env[k]);
  const required = missing.filter((k) => k !== 'WASABI_PUBLIC_BASE_URL');
  steps.env = required.length
    ? { ok: false, detail: `Missing required env: ${required.join(', ')}` }
    : {
        ok: true,
        detail: missing.includes('WASABI_PUBLIC_BASE_URL')
          ? 'All required vars set (no WASABI_PUBLIC_BASE_URL — public URLs use endpoint/bucket form)'
          : 'All vars set, including WASABI_PUBLIC_BASE_URL',
      };
  if (!isWasabiConfigured()) {
    return NextResponse.json({ verdict: 'Storage env is not configured — uploads cannot work.', steps });
  }

  const key = buildKey('files', 'diagnostics', `selftest-${crypto.randomUUID().slice(0, 8)}.png`);
  let publicUrl: string | null = null;

  // 2. Write with public-read ACL — same call the photo upload makes.
  try {
    await uploadObject({ key, body: PIXEL, contentType: 'image/png', isPublic: true });
    publicUrl = getPublicUrl(key);
    steps.write = { ok: true, detail: `PUT ok → ${publicUrl}` };
  } catch (err) {
    steps.write = {
      ok: false,
      detail: `PUT failed: ${err instanceof Error ? err.message : String(err)}`,
    };
    return NextResponse.json({
      verdict: 'The storage WRITE is failing — uploads error out. Check credentials, bucket name, endpoint, and region.',
      steps,
    });
  }

  // 3. Public GET — exactly what a visitor's <img src> does. This is the step
  //    that catches "uploads work but every photo shows broken."
  try {
    const res = await fetch(publicUrl!, { cache: 'no-store' });
    steps.public = res.ok
      ? { ok: true, detail: `GET ${res.status} — public URLs render` }
      : {
          ok: false,
          detail: `GET ${res.status} — the bucket is NOT serving public reads (or the public base URL is wrong)`,
        };
  } catch (err) {
    steps.public = {
      ok: false,
      detail: `GET failed: ${err instanceof Error ? err.message : String(err)} — public URL unreachable (endpoint/base URL wrong?)`,
    };
  }

  // 4. Signed GET — separates "creds fine, public access broken" from
  //    "everything broken."
  try {
    const signed = await getSignedDownloadUrl(key, 120);
    const res = await fetch(signed, { cache: 'no-store' });
    steps.signed = res.ok
      ? { ok: true, detail: `GET ${res.status} via signed URL — credentials and bucket are correct` }
      : { ok: false, detail: `Signed GET ${res.status} — credentials or bucket likely wrong` };
  } catch (err) {
    steps.signed = {
      ok: false,
      detail: `Signed GET failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 5. Cleanup — best-effort; a leftover 67-byte pixel is harmless.
  try {
    await deleteObject(key);
    steps.cleanup = { ok: true, detail: 'Test object deleted' };
  } catch {
    steps.cleanup = { ok: false, detail: `Could not delete ${key} (harmless, 67 bytes)` };
  }

  const verdict = !steps.public.ok && steps.signed.ok
    ? 'DIAGNOSIS: uploads succeed but PUBLIC reads are blocked — every photo renders broken. Enable public access on the bucket (or front it with a CDN and set WASABI_PUBLIC_BASE_URL).'
    : !steps.public.ok
      ? 'DIAGNOSIS: storage is misconfigured — both public and signed reads fail. Re-check all WASABI_* values.'
      : 'All storage steps pass — if photos still fail, the problem is not storage; capture the exact on-screen error next.';

  return NextResponse.json({ verdict, steps });
}
