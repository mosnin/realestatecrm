/**
 * POST /api/studio/generate — generate an image or video with fal.ai.
 *
 * The result is stored as a File row (so it lands in the realtor's one media
 * library, the Files page) and logged in StudioGeneration with its dollar
 * cost, which lib/usage/queries.ts sums into the realtor's usage.
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
import {
  generateImage,
  generateVideo,
  falConfigured,
  type GeneratedAsset,
} from '@/lib/studio/fal';
import { STUDIO_MODELS, DEFAULT_IMAGE_MODEL } from '@/lib/studio/models';

export const runtime = 'nodejs';
// Video models run for a few minutes — give the request room.
export const maxDuration = 300;

const MAX_PROMPT = 2000;

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
      { error: 'Generation is not configured yet.' },
      { status: 503 },
    );
  }

  const { allowed } = await checkRateLimit(`studio:generate:${userId}`, 60, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many generations. Try again in a little while.' },
      { status: 429 },
    );
  }

  let body: { prompt?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'A prompt is required.' }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT) {
    return NextResponse.json({ error: 'That prompt is too long.' }, { status: 400 });
  }

  const modelSlug =
    typeof body.model === 'string' && body.model in STUDIO_MODELS
      ? body.model
      : DEFAULT_IMAGE_MODEL;
  const model = STUDIO_MODELS[modelSlug];

  // Brand kit — fold the realtor's palette into the prompt so output comes
  // out on-brand. The original prompt is what gets logged; fal sees the augment.
  let effectivePrompt = prompt;
  const { data: brand } = await supabase
    .from('StudioBrand')
    .select('colors')
    .eq('spaceId', space.id)
    .maybeSingle();
  const brandColors = (brand?.colors as string[] | null) ?? [];
  if (brandColors.length > 0) {
    effectivePrompt = `${prompt}\n\nUse a color palette of ${brandColors.join(', ')}.`;
  }

  const generationId = crypto.randomUUID();

  const { error: genErr } = await supabase.from('StudioGeneration').insert({
    id: generationId,
    spaceId: space.id,
    userId,
    kind: model.kind,
    model: model.id,
    prompt,
    status: 'running',
    costUsd: 0,
  });
  if (genErr) {
    logger.error('[studio.generate] log insert failed', { spaceId: space.id }, genErr);
    return NextResponse.json(
      { error: 'Could not start generation. Please try again.' },
      { status: 500 },
    );
  }

  const markFailed = async (message: string): Promise<void> => {
    await supabase
      .from('StudioGeneration')
      .update({
        status: 'failed',
        errorMessage: message,
        completedAt: new Date().toISOString(),
      })
      .eq('id', generationId);
  };

  // ── Generate ────────────────────────────────────────────────────────────
  let asset: GeneratedAsset;
  try {
    asset =
      model.kind === 'video'
        ? await generateVideo({ modelId: model.id, prompt: effectivePrompt })
        : await generateImage({ modelId: model.id, prompt: effectivePrompt });
  } catch (err) {
    logger.error(
      '[studio.generate] fal failed',
      { spaceId: space.id, model: model.id },
      err as Error,
    );
    await markFailed(err instanceof Error ? err.message : 'Generation failed');
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 502 });
  }

  // ── Copy the bytes out of fal's temporary URL into our own storage ──────
  let buffer: Buffer;
  let contentType = asset.contentType;
  try {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`asset fetch ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
    contentType = res.headers.get('content-type') ?? contentType;
  } catch (err) {
    logger.error('[studio.generate] asset fetch failed', { spaceId: space.id }, err as Error);
    await markFailed('Could not retrieve the generated asset.');
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 502 });
  }

  // ── Store as a File ─────────────────────────────────────────────────────
  const fileId = crypto.randomUUID();
  const ext =
    model.kind === 'video'
      ? 'mp4'
      : contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : 'jpg';
  const name = `studio-${generationId.slice(0, 8)}.${ext}`;
  const storageKey = buildKey('studio', space.id, `${fileId}-${name}`);

  try {
    await uploadObject({ key: storageKey, body: buffer, contentType, isPublic: false });
  } catch (err) {
    logger.error('[studio.generate] upload failed', { spaceId: space.id }, err as Error);
    await markFailed('Could not store the generated asset.');
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 });
  }

  const { error: fileErr } = await supabase.from('File').insert({
    id: fileId,
    spaceId: space.id,
    userId,
    storageKey,
    name,
    mimeType: contentType,
    category: model.kind === 'video' ? 'video' : 'image',
    sizeBytes: buffer.length,
    isPublic: false,
  });
  if (fileErr) {
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[studio.generate] file insert failed', { spaceId: space.id }, fileErr);
    await markFailed('Could not record the generated asset.');
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 });
  }

  await supabase
    .from('StudioGeneration')
    .update({
      status: 'completed',
      fileId,
      costUsd: model.costUsd,
      completedAt: new Date().toISOString(),
    })
    .eq('id', generationId);

  const url = await getSignedDownloadUrl(storageKey);

  return NextResponse.json(
    { generationId, fileId, url, kind: model.kind, model: model.id, costUsd: model.costUsd },
    { status: 201 },
  );
}
