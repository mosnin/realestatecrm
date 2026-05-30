/**
 * GET /api/cron/daily-briefing
 *
 * Once-daily tick. Scheduled at 7am UTC via vercel.json. Composes a Brief
 * for every active Space and UPSERTs into the Brief table keyed on
 * (spaceId, forDate). Idempotent — re-running the same UTC day overwrites
 * the existing row's payload with a fresh compose.
 *
 * Phase A scope:
 *   - Generates briefs for ALL spaces, UTC-naive. Per-realtor 7am-local is
 *     Phase B (needs a User.timezone column or Space-level pref).
 *   - Internal signal sources only (pipeline / leads / calendar). Phase B
 *     layers Gmail / Calendar-Google / Slack / HubSpot onto SOURCES with
 *     no change to this route.
 *   - No notification fan-out (email / SMS). Phase B opt-in.
 *
 * Bounds:
 *   - MAX_PER_TICK = 1000 spaces; overflow gets caught next day.
 *   - MAX_CONCURRENCY = 8 in-flight composes.
 *
 * Auth: Bearer ${CRON_SECRET}. Disable: CRON_DAILY_BRIEFING_DISABLED=1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { composeBrief } from '@/lib/briefing/compose';

export const runtime = 'nodejs';

const MAX_PER_TICK = 1000;
const MAX_CONCURRENCY = 8;

interface SpaceRow {
  id: string;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function generateOne(spaceId: string, forDate: string): Promise<'ok' | 'failed'> {
  try {
    const brief = await composeBrief(spaceId);
    const { error } = await supabase
      .from('Brief')
      .upsert(
        {
          spaceId,
          forDate,
          status: 'pending',
          payload: brief,
        },
        { onConflict: 'spaceId,forDate' },
      );
    if (error) {
      console.error(`[cron/daily-briefing] upsert failed for ${spaceId}:`, error.message);
      return 'failed';
    }
    return 'ok';
  } catch (err) {
    console.error(`[cron/daily-briefing] compose failed for ${spaceId}:`, err);
    return 'failed';
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/daily-briefing] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_DAILY_BRIEFING_DISABLED) {
    console.log('[cron/daily-briefing] CRON_DAILY_BRIEFING_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();
  const forDate = todayUtcDate();

  const { data: spaces, error } = await supabase
    .from('Space')
    .select('id')
    .limit(MAX_PER_TICK);

  if (error) {
    console.error('[cron/daily-briefing] space lookup failed:', error.message);
    return NextResponse.json({ error: 'Space lookup failed' }, { status: 500 });
  }

  if (!spaces || spaces.length === 0) {
    return NextResponse.json({ status: 'no-spaces', forDate, durationMs: Date.now() - startedAt });
  }

  // Bounded concurrency — a worker pool with promise.all over chunks. Each
  // compose hits Supabase ~5 times; without bounds we'd hammer the pool.
  const rows = spaces as SpaceRow[];
  const counts = { ok: 0, failed: 0 };

  for (let i = 0; i < rows.length; i += MAX_CONCURRENCY) {
    const chunk = rows.slice(i, i + MAX_CONCURRENCY);
    const results = await Promise.all(chunk.map((row) => generateOne(row.id, forDate)));
    for (const r of results) counts[r] += 1;
  }

  return NextResponse.json({
    status: 'ok',
    forDate,
    total: rows.length,
    succeeded: counts.ok,
    failed: counts.failed,
    durationMs: Date.now() - startedAt,
  });
}
