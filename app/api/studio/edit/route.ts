/**
 * POST /api/studio/edit — transform an image with fal.ai: upscale,
 * background removal, or an instruction restyle.
 *
 * Multipart body: `file` (the source image), `tool` (slug), and `prompt`
 * for tools that need an instruction. Both the source and the result are
 * stored as File rows; the run is logged in StudioGeneration with
 * sourceFileId set and its dollar cost metered into usage.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, requireActiveSubscription } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  uploadObject,
  deleteObject,
  buildKey,
  getSignedDownloadUrl,
} from '@/lib/storage';
import { validateUpload } from '@/lib/storage/limits';
import { transformImage, falConfigured, type GeneratedAsset } from '@/lib/studio/fal';
import { STUDIO_EDIT_TOOLS } from '@/lib/studio/models';

export const runtime = 'nodejs';

const MAX_PROMPT = 2000;

function extFor(mime: string): string {
  return mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
}

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subCheck = await requireActiveSubscription(space, userId);
  if (subCheck) return subCheck;

  if (!falConfigured()) {
    return NextResponse.json(
      { error: 'Image editing is not configured yet.' },
      { status: 503 },
    );
  }

  const { allowed } = await checkRateLimit(`studio:edit:${userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many edits. Try again in a little while.' },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const tool = STUDIO_EDIT_TOOLS[String(formData.get('tool') ?? '')];
  const promptRaw = formData.get('prompt');
  const prompt = typeof promptRaw === 'string' ? promptRaw.trim() : '';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 });
  }
  if (!tool) {
    return NextResponse.json({ error: 'Unknown edit tool.' }, { status: 400 });
  }
  if (tool.needsPrompt && !prompt) {
    return NextResponse.json({ error: 'This tool needs an instruction.' }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json({ error: 'That instruction is too long.' }, { status: 400 });
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const validation = validateUpload({ mimeType: file.type, sizeBytes: file.size, header });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }
  if (validation.category !== 'image') {
    return NextResponse.json({ error: 'Only images can be edited.' }, { status: 400 });
  }

  // ── Store the source image as a File ──────────────────────────────────
  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  const sourceId = crypto.randomUUID();
  const sourceName = `source-${sourceId.slice(0, 8)}.${extFor(file.type)}`;
  const sourceKey = buildKey('studio', space.id, `${sourceId}-${sourceName}`);

  try {
    await uploadObject({ key: sourceKey, body: sourceBuffer, contentType: file.type, isPublic: false });
  } catch (err) {
    logger.error('[studio.edit] source upload failed', { spaceId: space.id }, err as Error);
    return NextResponse.json({ error: 'Could not start the edit. Please try again.' }, { status: 500 });
  }

  const { error: srcErr } = await supabase.from('File').insert({
    id: sourceId,
    spaceId: space.id,
    userId,
    storageKey: sourceKey,
    name: sourceName,
    mimeType: file.type,
    category: 'image',
    sizeBytes: sourceBuffer.length,
    isPublic: false,
  });
  if (srcErr) {
    await deleteObject(sourceKey).catch(() => undefined);
    logger.error('[studio.edit] source insert failed', { spaceId: space.id }, srcErr);
    return NextResponse.json({ error: 'Could not start the edit. Please try again.' }, { status: 500 });
  }

  // fal fetches the source by URL — a signed URL is valid long enough.
  const sourceUrl = await getSignedDownloadUrl(sourceKey);

  // ── Log the generation ────────────────────────────────────────────────
  const generationId = crypto.randomUUID();
  const { error: genErr } = await supabase.from('StudioGeneration').insert({
    id: generationId,
    spaceId: space.id,
    userId,
    kind: 'image',
    model: tool.id,
    prompt: prompt || null,
    sourceFileId: sourceId,
    status: 'running',
    costUsd: 0,
  });
  if (genErr) {
    logger.error('[studio.edit] log insert failed', { spaceId: space.id }, genErr);
    return NextResponse.json({ error: 'Could not start the edit. Please try again.' }, { status: 500 });
  }

  const markFailed = async (message: string): Promise<void> => {
    await supabase
      .from('StudioGeneration')
      .update({ status: 'failed', errorMessage: message, completedAt: new Date().toISOString() })
      .eq('id', generationId);
  };

  // ── Transform ─────────────────────────────────────────────────────────
  let out: GeneratedAsset;
  try {
    out = await transformImage({
      modelId: tool.id,
      imageUrl: sourceUrl,
      prompt: tool.needsPrompt ? prompt : undefined,
    });
  } catch (err) {
    logger.error('[studio.edit] fal failed', { spaceId: space.id, model: tool.id }, err as Error);
    await markFailed(err instanceof Error ? err.message : 'Edit failed');
    return NextResponse.json({ error: 'The edit failed. Please try again.' }, { status: 502 });
  }

  // ── Store the result as a File ────────────────────────────────────────
  let buffer: Buffer;
  let contentType = out.contentType;
  try {
    const res = await fetch(out.url);
    if (!res.ok) throw new Error(`asset fetch ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = res.headers.get('content-type') ?? contentType;
  } catch (err) {
    logger.error('[studio.edit] result fetch failed', { spaceId: space.id }, err as Error);
    await markFailed('Could not retrieve the edited image.');
    return NextResponse.json({ error: 'The edit failed. Please try again.' }, { status: 502 });
  }

  const resultId = crypto.randomUUID();
  const resultName = `studio-${generationId.slice(0, 8)}.${extFor(contentType)}`;
  const resultKey = buildKey('studio', space.id, `${resultId}-${resultName}`);

  try {
    await uploadObject({ key: resultKey, body: buffer, contentType, isPublic: false });
  } catch (err) {
    logger.error('[studio.edit] result upload failed', { spaceId: space.id }, err as Error);
    await markFailed('Could not store the edited image.');
    return NextResponse.json({ error: 'The edit failed. Please try again.' }, { status: 500 });
  }

  const { error: fileErr } = await supabase.from('File').insert({
    id: resultId,
    spaceId: space.id,
    userId,
    storageKey: resultKey,
    name: resultName,
    mimeType: contentType,
    category: 'image',
    sizeBytes: buffer.length,
    isPublic: false,
  });
  if (fileErr) {
    await deleteObject(resultKey).catch(() => undefined);
    logger.error('[studio.edit] result insert failed', { spaceId: space.id }, fileErr);
    await markFailed('Could not record the edited image.');
    return NextResponse.json({ error: 'The edit failed. Please try again.' }, { status: 500 });
  }

  await supabase
    .from('StudioGeneration')
    .update({
      status: 'completed',
      fileId: resultId,
      costUsd: tool.costUsd,
      completedAt: new Date().toISOString(),
    })
    .eq('id', generationId);

  const url = await getSignedDownloadUrl(resultKey);

  return NextResponse.json(
    { generationId, fileId: resultId, sourceFileId: sourceId, url, costUsd: tool.costUsd },
    { status: 201 },
  );
}
