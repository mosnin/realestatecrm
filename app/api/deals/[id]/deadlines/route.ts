/**
 * GET /api/deals/[id]/deadlines
 *
 * Read-only view of a deal's contract-to-close deadlines for the deal-detail
 * cockpit. A "deadline" is a `DealChecklistItem` that carries scheduling
 * (dueAt) and reminder metadata (assignedRoles, reminderLeadDays); this route
 * returns the deal's items ordered by due date so the client can refresh the
 * deadlines view without re-reading the whole deal.
 *
 * Minimal by intent (app/api/deals/* is protected): auth + space ownership +
 * a single select. Mirrors GET /api/deals/[id]/checklist, ordered by dueAt
 * rather than position because the cockpit reads as a dated timeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSpaceForUser } from '@/lib/space';
import { requireAuth } from '@/lib/api-auth';
import { logger } from '@/lib/logger';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { id } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Confirm the deal is in the caller's space before returning its rows — an
  // out-of-space id would otherwise leak another realtor's deadlines.
  const { data: deal, error: dealErr } = await supabase
    .from('Deal')
    .select('id')
    .eq('id', id)
    .eq('spaceId', space.id)
    .maybeSingle();
  if (dealErr) {
    logger.error('[deals/deadlines] deal lookup failed', { dealId: id }, dealErr);
    return NextResponse.json({ error: 'Failed to load deadlines' }, { status: 500 });
  }
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('DealChecklistItem')
    .select('*')
    .eq('dealId', id)
    .eq('spaceId', space.id)
    .order('dueAt', { ascending: true, nullsFirst: false })
    .order('position', { ascending: true });
  if (error) {
    logger.error('[deals/deadlines] fetch failed', { dealId: id }, error);
    return NextResponse.json({ error: 'Failed to load deadlines' }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
