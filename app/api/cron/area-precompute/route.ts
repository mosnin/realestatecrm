/**
 * GET /api/cron/area-precompute
 *
 * Nightly warm-up of the GLOBAL area cache for high-traffic metros, so the
 * common Property IQ lookups are instant and the research cost is amortized to
 * a batch instead of paid on a realtor's click. Bounded per run (rotates
 * coverage across nights) and skips areas already fresh.
 *
 * Auth: Bearer ${CRON_SECRET} (matches the other cron routes).
 * No-op when web-research keys are absent — degrades cleanly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { precomputeSeedAreas } from '@/lib/area-precompute';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** How many cold areas to warm per nightly tick. Bounds cost + wall-clock. */
const PER_RUN = 4;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/area-precompute] CRON_SECRET is not set — rejecting');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await precomputeSeedAreas({ limit: PER_RUN });
  return NextResponse.json({ ok: true, ...result });
}
