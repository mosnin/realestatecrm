/**
 * POST /api/agent/briefing/test
 *
 * Send a one-off test brief to the realtor's enabled channels. Composes
 * a fresh brief (or uses today's existing if one's there), persists
 * nothing, never writes to Brief.{email,sms}SentAt so it doesn't
 * clobber the morning send.
 *
 * Rate limit: 3 per UTC day per space, backed by the shared production
 * rate limiter so cold starts and parallel serverless instances cannot reset it.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { composeBrief } from '@/lib/briefing/compose';
import { localDateIn } from '@/lib/briefing/timing';
import { deliverBrief, loadDeliveryContext, getAppOrigin } from '@/lib/briefing/delivery';
import type { Brief } from '@/lib/briefing/types';
import { checkRateLimit } from '@/lib/rate-limit';

const DAILY_LIMIT = 3;
const DEFAULT_TIMEZONE = 'America/New_York';

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await checkRateLimit(
    `brief:test:${space.id}:${dayKey()}`,
    DAILY_LIMIT,
    2 * 24 * 60 * 60,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: 'Test send limit reached for today. Try again tomorrow.' },
      { status: 429 },
    );
  }

  // Compose a fresh brief (don't reuse the saved one — the realtor may
  // be testing right after fixing something they want reflected).
  const { brief } = await composeBrief(space.id);

  // Use a synthetic briefId so the delivery dedup lock doesn't engage
  // against the real morning Brief row. We INSERT a transient row with
  // a "TEST" forDate marker, deliver against it, then leave it for the
  // analytics module to filter out by the synthetic date prefix.
  const tz = await getSpaceTimezone(space.id);
  const realToday = localDateIn(new Date(), tz);
  const syntheticDate = `TEST-${realToday}-${Date.now()}`;

  const { data: row, error } = await supabase
    .from('Brief')
    .insert({
      spaceId: space.id,
      forDate: syntheticDate,
      status: 'pending',
      payload: brief,
      cardMeta: [],
    })
    .select('id')
    .single();

  if (error || !row) {
    return NextResponse.json({ error: 'Could not stage the test brief.' }, { status: 500 });
  }

  const ctx = await loadDeliveryContext(space.id);
  if (!ctx) return NextResponse.json({ error: 'Settings not found.' }, { status: 500 });

  const result = await deliverBrief({
    briefId: row.id as string,
    brief: brief as Brief,
    forDate: realToday,
    space: ctx,
    appOrigin: getAppOrigin(),
  });

  // Clean up the synthetic row — we never want it in the analytics
  // aggregations or in tomorrow's "yesterday" link.
  await supabase.from('Brief').delete().eq('id', row.id);

  return NextResponse.json({ ok: true, result });
}

async function getSpaceTimezone(spaceId: string): Promise<string> {
  const { data } = await supabase
    .from('SpaceSetting')
    .select('timezone')
    .eq('spaceId', spaceId)
    .maybeSingle();
  return (data?.timezone as string | undefined) ?? DEFAULT_TIMEZONE;
}
