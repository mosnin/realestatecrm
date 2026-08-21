/**
 * GET /api/agent/today
 *
 * Returns the day's items for the dispatch console's "What's coming" section:
 *   - followUpsDue: contacts whose followUpAt is in the past or today
 *   - toursUpcoming: scheduled or confirmed tours from now forward
 *
 * One endpoint, one shape — keeps the dispatch console rendering one fetch
 * per section instead of N. Realtor space only (not brokerage-routed).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';

export interface FollowUpDue {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string | null;
  followUpAt: string;
  leadScore: number | null;
  scoreLabel: string | null;
}

export interface UpcomingTour {
  id: string;
  guestName: string | null;
  startsAt: string;
  endsAt: string | null;
  propertyAddress: string | null;
  status: string;
}

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nowIso = new Date().toISOString();

  const [followUpsRes, toursRes] = await Promise.all([
    tenantTable(supabase, 'Contact', { spaceId: space.id })
      .select('id, name, phone, email, type, followUpAt, leadScore, scoreLabel')
      .is('brokerageId', null)
      .not('followUpAt', 'is', null)
      .lte('followUpAt', nowIso)
      .order('followUpAt', { ascending: true })
      .limit(10),
    tenantTable(supabase, 'Tour', { spaceId: space.id })
      .select('id, guestName, startsAt, endsAt, propertyAddress, status')
      .gte('startsAt', nowIso)
      .in('status', ['scheduled', 'confirmed'])
      .order('startsAt', { ascending: true })
      .limit(6),
  ]);

  return NextResponse.json({
    followUpsDue: (followUpsRes.data ?? []) as FollowUpDue[],
    toursUpcoming: (toursRes.data ?? []) as UpcomingTour[],
  });
}
