import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 200);
  const agentType = req.nextUrl.searchParams.get('agentType');
  const outcome = req.nextUrl.searchParams.get('outcome');

  let query = tenantTable(supabase, 'AgentActivityLog', { spaceId: space.id })
    .select(`
      id, runId, agentType, actionType, reasoning, outcome,
      relatedContactId, relatedDealId, reversible, reversedAt, metadata, createdAt,
      Contact:relatedContactId ( id, name ),
      Deal:relatedDealId ( id, title )
    `)
    .order('createdAt', { ascending: false })
    .limit(limit);

  if (agentType) query = query.eq('agentType', agentType);
  if (outcome) query = query.eq('outcome', outcome);

  const { data, error } = await query;
  if (error) throw error;
  return NextResponse.json(data ?? []);
}
