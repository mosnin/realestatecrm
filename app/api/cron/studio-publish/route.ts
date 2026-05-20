/**
 * GET /api/cron/studio-publish
 *
 * Every 5 minutes: pick up StudioPost rows whose scheduled time has passed
 * and publish them to the realtor's connected social accounts via Composio.
 *
 * Auth: Bearer ${CRON_SECRET} — matches the other crons in vercel.json.
 *
 * Resilient by construction: each post is claimed (status → 'publishing')
 * before work starts so an overlapping run can't double-post; a per-platform
 * failure is recorded in platformResults and never blocks the other platforms
 * or the other posts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { publishToPlatform } from '@/lib/studio/publish';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Bounded so a run stays well under maxDuration. The cron's 5-minute cadence
// drains any backlog quickly enough.
const MAX_POSTS_PER_RUN = 15;

interface DuePost {
  id: string;
  spaceId: string;
  userId: string;
  fileId: string;
  caption: string;
  platforms: string[];
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/studio-publish] CRON_SECRET not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: due, error } = await supabase
    .from('StudioPost')
    .select('id, spaceId, userId, fileId, caption, platforms')
    .eq('status', 'scheduled')
    .lte('scheduledAt', new Date().toISOString())
    .order('scheduledAt', { ascending: true })
    .limit(MAX_POSTS_PER_RUN);
  if (error) {
    console.error('[cron/studio-publish] query failed', error);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const posts = (due ?? []) as DuePost[];
  let posted = 0;
  let failed = 0;

  for (const post of posts) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential by design: don't hammer Composio
      const result = await publishOne(post);
      if (result === 'posted') posted += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error('[cron/studio-publish] post errored', post.id, err);
      // eslint-disable-next-line no-await-in-loop -- error path, bounded loop
      await supabase
        .from('StudioPost')
        .update({
          status: 'failed',
          platformResults: { error: err instanceof Error ? err.message : String(err) },
          updatedAt: new Date().toISOString(),
        })
        .eq('id', post.id);
    }
  }

  const summary = { due: posts.length, posted, failed };
  console.log('[cron/studio-publish] run complete', summary);
  return NextResponse.json(summary);
}

async function publishOne(post: DuePost): Promise<'posted' | 'failed'> {
  // Claim the post so an overlapping run can't pick it up again.
  await supabase
    .from('StudioPost')
    .update({ status: 'publishing', updatedAt: new Date().toISOString() })
    .eq('id', post.id);

  // The post's image File — sign a URL the social platforms can fetch.
  const { data: file } = await supabase
    .from('File')
    .select('storageKey')
    .eq('id', post.fileId)
    .maybeSingle();
  if (!file?.storageKey) {
    await supabase
      .from('StudioPost')
      .update({
        status: 'failed',
        platformResults: { error: 'The post image is missing.' },
        updatedAt: new Date().toISOString(),
      })
      .eq('id', post.id);
    return 'failed';
  }
  const imageUrl = await getSignedDownloadUrl(file.storageKey as string, 3600);

  const results: Record<string, { status: string; error?: string }> = {};
  let anyOk = false;
  for (const toolkit of post.platforms) {
    // eslint-disable-next-line no-await-in-loop -- sequential per-platform, max 3
    const outcome = await publishToPlatform({
      toolkit,
      entityId: post.userId,
      imageUrl,
      caption: post.caption,
    });
    results[toolkit] = outcome.ok
      ? { status: 'posted' }
      : { status: 'failed', error: outcome.error };
    if (outcome.ok) anyOk = true;
  }

  await supabase
    .from('StudioPost')
    .update({
      status: anyOk ? 'posted' : 'failed',
      platformResults: results,
      postedAt: anyOk ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', post.id);

  return anyOk ? 'posted' : 'failed';
}
