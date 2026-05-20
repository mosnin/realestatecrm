/**
 * GET  /api/files               — list files in current space.
 * POST /api/files                — upload a file.
 *
 * Per-file: validates mime + magic bytes + category size cap.
 * Per-space: enforces the plan-tier total storage quota.
 * Per-user: 50 uploads / hour rate limit.
 *
 * Files are stored privately. The Files page fetches per-file signed URLs
 * lazily via /api/files/[id] when the user clicks Download.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { uploadObject, deleteObject, buildKey, getPublicUrl } from '@/lib/storage';
import {
  validateUpload,
  quotaForPlan,
  formatBytes,
  MIME_RULES,
} from '@/lib/storage/limits';

export const runtime = 'nodejs';

/** Strip path separators + control chars + trim length. Falls back to
 *  "file" if everything is stripped. */
function sanitizeFilename(raw: string): string {
  const cleaned = raw
    .replace(/[\\/]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/\.\.+/g, '.')
    .trim();
  return cleaned.slice(0, 200) || 'file';
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const category = req.nextUrl.searchParams.get('category');
  let query = supabase
    .from('File')
    .select('id, name, mimeType, category, sizeBytes, isPublic, createdAt')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(500);

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    logger.error('[files] list failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
  }

  // Compute current quota usage in the same response so the page header
  // can render the gauge without a second round trip.
  const { data: totals } = await supabase
    .from('File')
    .select('sizeBytes')
    .eq('spaceId', space.id);
  const usedBytes = (totals ?? []).reduce(
    (sum, r) => sum + Number(r.sizeBytes ?? 0),
    0,
  );

  // Plan tier may not exist yet in main — graceful default to 'free' until
  // the Plan migration lands. Cast through unknown for the optional column.
  const planId = ((space as unknown) as { planId?: string }).planId ?? 'free';
  const quota = quotaForPlan(planId);

  return NextResponse.json({
    files: data ?? [],
    quota: {
      planId,
      totalBytes: quota.totalBytes,
      usedBytes,
      remainingBytes: Math.max(quota.totalBytes - usedBytes, 0),
      label: quota.label,
    },
  });
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`files:upload:${userId}`, 50, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many uploads. Try again in an hour.' }, { status: 429 });
  }

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Pull the first 16 bytes for the magic-byte check before reading the
  // whole file into memory. Keeps the validator honest on huge uploads
  // that we'd reject anyway.
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const validation = validateUpload({
    mimeType: file.type,
    sizeBytes: file.size,
    header,
  });
  if (!validation.ok) {
    const status = validation.reason?.startsWith('Unsupported') ? 415 : 400;
    return NextResponse.json({ error: validation.reason }, { status });
  }
  const category = validation.category!;

  // Quota check — sum existing rows + new size against the plan limit.
  const planId = ((space as unknown) as { planId?: string }).planId ?? 'free';
  const quota = quotaForPlan(planId);
  const { data: existing } = await supabase
    .from('File')
    .select('sizeBytes')
    .eq('spaceId', space.id);
  const usedBytes = (existing ?? []).reduce(
    (sum, r) => sum + Number(r.sizeBytes ?? 0),
    0,
  );
  if (usedBytes + file.size > quota.totalBytes) {
    const remaining = Math.max(quota.totalBytes - usedBytes, 0);
    return NextResponse.json(
      {
        error: `Storage quota exceeded. Your plan allows ${quota.label}; ${formatBytes(remaining)} remaining.`,
        quota: { totalBytes: quota.totalBytes, usedBytes, remainingBytes: remaining },
      },
      { status: 413 },
    );
  }

  const id = crypto.randomUUID();
  const sanitized = sanitizeFilename(file.name || `file.${MIME_RULES[file.type]?.extension ?? 'bin'}`);
  const storageKey = buildKey('files', space.id, `${id}-${sanitized}`);

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject({
      key: storageKey,
      body: buffer,
      contentType: file.type,
      isPublic: false,
    });
  } catch (err) {
    logger.error('[files] upload failed', { spaceId: space.id }, err as Error);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from('File')
    .insert({
      id,
      spaceId: space.id,
      userId,
      storageKey,
      name: sanitized,
      mimeType: file.type,
      category,
      sizeBytes: file.size,
      isPublic: false,
    })
    .select('id, name, mimeType, category, sizeBytes, isPublic, createdAt')
    .single();

  if (insertError) {
    // Best-effort rollback so we don't leak storage objects.
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[files] insert failed', { spaceId: space.id }, insertError);
    return NextResponse.json({ error: 'Failed to record file' }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 201 });
}
