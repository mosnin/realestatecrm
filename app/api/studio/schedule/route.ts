/**
 * GET  /api/studio/schedule — connected social platforms + scheduled posts.
 * POST /api/studio/schedule — queue a post (image + caption + platforms + time).
 *
 * The connected-platform list comes from the same IntegrationConnection
 * records the Integrations tab reads: active toolkits, filtered to the
 * catalog's `social` category.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { uploadObject, deleteObject, buildKey } from '@/lib/storage';
import { validateUpload } from '@/lib/storage/limits';
import { activeToolkits } from '@/lib/integrations/connections';
import { findIntegration } from '@/lib/integrations/catalog';
import { inngest } from '@/lib/inngest/client';

export const runtime = 'nodejs';

const MAX_CAPTION = 2200;

/** The realtor's connected social accounts — active toolkits that live in
 *  the catalog's `social` category. Same source the Integrations tab reads. */
async function connectedSocials(
  spaceId: string,
  userId: string,
): Promise<Array<{ toolkit: string; name: string }>> {
  const toolkits = await activeToolkits({ spaceId, userId });
  const out: Array<{ toolkit: string; name: string }> = [];
  for (const slug of toolkits) {
    const app = findIntegration(slug);
    if (app && app.category === 'social') {
      out.push({ toolkit: app.toolkit, name: app.name });
    }
  }
  return out;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const space = await getSpaceForUser(auth.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [platforms, postsRes] = await Promise.all([
    connectedSocials(space.id, auth.userId),
    supabase
      .from('StudioPost')
      .select('id, caption, platforms, scheduledAt, status, createdAt')
      .eq('spaceId', space.id)
      .order('scheduledAt', { ascending: true })
      .limit(100),
  ]);
  if (postsRes.error) {
    logger.error('[studio.schedule] list failed', { spaceId: space.id }, postsRes.error);
    return NextResponse.json({ error: 'Could not load scheduled posts.' }, { status: 500 });
  }

  return NextResponse.json({ platforms, posts: postsRes.data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const captionRaw = formData.get('caption');
  const caption = typeof captionRaw === 'string' ? captionRaw.trim() : '';
  const scheduledAtRaw = String(formData.get('scheduledAt') ?? '');

  let requested: string[] = [];
  try {
    const parsed: unknown = JSON.parse(String(formData.get('platforms') ?? '[]'));
    if (Array.isArray(parsed)) {
      requested = parsed.filter((p): p is string => typeof p === 'string');
    }
  } catch {
    requested = [];
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'The post needs an image.' }, { status: 400 });
  }
  if (caption.length > MAX_CAPTION) {
    return NextResponse.json({ error: 'That caption is too long.' }, { status: 400 });
  }

  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Pick a valid date and time.' }, { status: 400 });
  }
  if (scheduledAt.getTime() < Date.now()) {
    return NextResponse.json({ error: 'Pick a time in the future.' }, { status: 400 });
  }

  // Only allow platforms the realtor has actually connected.
  const connected = new Set((await connectedSocials(space.id, userId)).map((p) => p.toolkit));
  const targets = requested.filter((p) => connected.has(p));
  if (targets.length === 0) {
    return NextResponse.json(
      { error: 'Pick at least one connected social account.' },
      { status: 400 },
    );
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const validation = validateUpload({ mimeType: file.type, sizeBytes: file.size, header });
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }
  if (validation.category !== 'image') {
    return NextResponse.json({ error: 'The post image must be an image file.' }, { status: 400 });
  }

  // Store the image as a File.
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileId = crypto.randomUUID();
  const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
  const name = `post-${fileId.slice(0, 8)}.${ext}`;
  const storageKey = buildKey('studio', space.id, `${fileId}-${name}`);

  try {
    await uploadObject({ key: storageKey, body: buffer, contentType: file.type, isPublic: false });
  } catch (err) {
    logger.error('[studio.schedule] upload failed', { spaceId: space.id }, err as Error);
    return NextResponse.json({ error: 'Could not schedule the post. Please try again.' }, { status: 500 });
  }

  const { error: fileErr } = await supabase.from('File').insert({
    id: fileId,
    spaceId: space.id,
    userId,
    storageKey,
    name,
    mimeType: file.type,
    category: 'image',
    sizeBytes: buffer.length,
    isPublic: false,
  });
  if (fileErr) {
    await deleteObject(storageKey).catch(() => undefined);
    logger.error('[studio.schedule] file insert failed', { spaceId: space.id }, fileErr);
    return NextResponse.json({ error: 'Could not schedule the post. Please try again.' }, { status: 500 });
  }

  const { data: post, error: postErr } = await supabase
    .from('StudioPost')
    .insert({
      id: crypto.randomUUID(),
      spaceId: space.id,
      userId,
      fileId,
      caption,
      platforms: targets,
      scheduledAt: scheduledAt.toISOString(),
      status: 'scheduled',
    })
    .select('id, caption, platforms, scheduledAt, status, createdAt')
    .single();
  if (postErr) {
    logger.error('[studio.schedule] post insert failed', { spaceId: space.id }, postErr);
    return NextResponse.json({ error: 'Could not schedule the post. Please try again.' }, { status: 500 });
  }

  // Hand the post to Inngest — a delayed event fires the publish at the
  // scheduled time. If the send fails the post would never go out, so mark
  // it failed rather than leave a silent zombie.
  try {
    const sent = await inngest.send({
      name: 'studio/post.scheduled',
      data: { postId: post.id },
      ts: scheduledAt.getTime(),
    });
    const eventId = sent.ids?.[0];
    if (eventId) {
      await supabase
        .from('StudioPost')
        .update({ inngestEventId: eventId })
        .eq('id', post.id);
    }
  } catch (err) {
    logger.error('[studio.schedule] inngest send failed', { spaceId: space.id }, err as Error);
    await supabase
      .from('StudioPost')
      .update({ status: 'failed', updatedAt: new Date().toISOString() })
      .eq('id', post.id);
    return NextResponse.json(
      { error: 'Could not schedule the post. Please try again.' },
      { status: 500 },
    );
  }

  return NextResponse.json(post, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const space = await getSpaceForUser(auth.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing post id' }, { status: 400 });
  }

  // Only a still-scheduled post in this space can be canceled. The Inngest
  // publish function skips any post that is not 'scheduled', so flipping the
  // status is the whole cancel mechanism.
  const { data, error } = await supabase
    .from('StudioPost')
    .update({ status: 'canceled', updatedAt: new Date().toISOString() })
    .eq('id', id)
    .eq('spaceId', space.id)
    .eq('status', 'scheduled')
    .select('id')
    .maybeSingle();
  if (error) {
    logger.error('[studio.schedule] cancel failed', { spaceId: space.id }, error);
    return NextResponse.json({ error: 'Could not cancel the post.' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'That post can no longer be canceled.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ id, status: 'canceled' });
}
