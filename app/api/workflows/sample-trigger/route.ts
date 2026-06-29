/**
 * GET /api/workflows/sample-trigger?type=<TriggerType>
 *
 * Returns real sample data for the trigger type, using the most recent record
 * from the DB (a real Contact or Deal). Mirrors the token keys used by
 * TRIGGER_SAMPLE_DATA in the workflow builder so the user sees their actual
 * data — not placeholder text — when building conditions and {{token}} values.
 *
 * Falls back gracefully to empty for trigger types that have no real records
 * (schedule, webhook, integration_event) — the builder shows static samples for
 * those.
 *
 * Security: scoped by spaceId from the session — same guard as all workflow
 * routes. No ownership checks beyond spaceId are needed because the Contact /
 * Deal queries are already scoped.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { TriggerType } from '@/lib/workflows/schema';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') as TriggerType | null;
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 });

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const space = await getSpaceForUser(authResult.userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const data = await loadSample(space.id, type);
    return NextResponse.json({ data, isReal: Object.keys(data).length > 0 });
  } catch (error) {
    logger.error('[workflows/sample-trigger] failed', { spaceId: space.id, type }, error);
    return NextResponse.json({ data: {}, isReal: false });
  }
}

async function loadSample(
  spaceId: string,
  type: TriggerType,
): Promise<Record<string, string | number>> {
  if (type === 'lead_created' || type === 'lead_score_threshold' || type === 'inbound_message' || type === 'contact_updated') {
    const { data: contacts } = await supabase
      .from('Contact')
      .select('id, name, email, phone, leadScore, scoreLabel, sourceLabel, preferences, createdAt')
      .eq('spaceId', spaceId)
      .not('name', 'is', null)
      .order('createdAt', { ascending: false })
      .limit(1);

    const c = contacts?.[0];
    if (!c) return {};

    const base: Record<string, string | number> = {
      'lead.name': c.name ?? '',
      'lead.email': c.email ?? '',
      'lead.phone': c.phone ?? '',
      'lead.source': c.sourceLabel ?? 'Direct',
      'lead.propertyInterest': c.preferences ?? '',
    };
    if (c.leadScore != null) base['lead.score'] = c.leadScore;
    if (c.scoreLabel) base['lead.scoreLabel'] = c.scoreLabel;
    if (c.createdAt) base['lead.createdAt'] = c.createdAt;
    if (type === 'lead_score_threshold') base['lead.previousScore'] = Math.max(0, (c.leadScore ?? 0) - 12);

    return base;
  }

  if (type === 'deal_stage_changed' || type === 'tour_completed' || type === 'deal_created') {
    const { data: deals } = await supabase
      .from('Deal')
      .select('id, stage, amount, contactId, updatedAt, Contact(name, email, phone)')
      .eq('spaceId', spaceId)
      .order('updatedAt', { ascending: false })
      .limit(1);

    const d = deals?.[0] as Record<string, unknown> | undefined;
    if (!d) return {};

    const contact = d.Contact as Record<string, unknown> | null;
    const base: Record<string, string | number> = {
      'deal.stage': String(d.stage ?? ''),
      'deal.previousStage': 'showing',
    };
    if (d.amount) base['deal.amount'] = Number(d.amount);
    if (d.updatedAt) base['deal.changedAt'] = String(d.updatedAt);
    if (contact?.name) base['lead.name'] = String(contact.name);
    if (contact?.email) base['lead.email'] = String(contact.email);
    if (contact?.phone) base['lead.phone'] = String(contact.phone);

    return base;
  }

  // schedule, webhook, integration_event — no real records to fetch; caller
  // will show static sample data from TRIGGER_SAMPLE_DATA instead.
  return {};
}
