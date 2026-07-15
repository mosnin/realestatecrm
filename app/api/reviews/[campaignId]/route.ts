/**
 * GET /api/reviews/[campaignId] — public click-tracking redirect.
 *
 * The review link inside the drafted ask points here (an unguessable campaign
 * UUID is the capability — there is no auth on a public client click). On a
 * hit we stamp clickedAt + status 'clicked' on the ReviewCampaign, then
 * 302-redirect to the realtor's stored reviewUrl (Google/Zillow/etc). The
 * stamp is what suppresses the nudge cron's follow-up and feeds the Brief's
 * "Y clicked" number.
 *
 * The campaign row is looked up by its primary-key UUID only — that opaque id
 * is the capability token, so no spaceId scope is available or appropriate
 * (mirrors other public capability routes). A malformed id or unknown campaign
 * returns 404 rather than leaking anything.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

// The campaign id is a gen_random_uuid()::text primary key. Validate the shape
// before touching the DB so a garbage path never runs a query.
const CAMPAIGN_ID_RE = /^[0-9a-fA-F-]{20,64}$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  const { campaignId } = await params;

  if (!campaignId || !CAMPAIGN_ID_RE.test(campaignId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: campaign, error } = await supabase
    .from('ReviewCampaign')
    .select('id, reviewUrl, clickedAt')
    .eq('id', campaignId)
    .maybeSingle();

  if (error) {
    logger.error('[reviews/redirect] lookup failed', { campaignId, err: error.message });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  const row = campaign as { id: string; reviewUrl: string | null; clickedAt: string | null } | null;
  const reviewUrl = (row?.reviewUrl ?? '').trim();
  if (!row || !reviewUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Stamp the click. Only advance to 'clicked' on the FIRST hit so a completed
  // campaign isn't dragged backward; a repeat click just refreshes nothing.
  // Best-effort — a failed stamp must never break the client's redirect.
  if (!row.clickedAt) {
    const nowIso = new Date().toISOString();
    const { error: stampErr } = await supabase
      .from('ReviewCampaign')
      .update({ status: 'clicked', clickedAt: nowIso, updatedAt: nowIso })
      .eq('id', campaignId);
    if (stampErr) {
      logger.warn('[reviews/redirect] click stamp failed', { campaignId, err: stampErr.message });
    }
  }

  // 302 (temporary) — the destination is the realtor's live review URL, which
  // can change; never cache this hop.
  return NextResponse.redirect(reviewUrl, { status: 302 });
}
