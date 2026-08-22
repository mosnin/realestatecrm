/**
 * GET /api/agent/deal/[id]
 *
 * Returns agent intelligence context for a single deal:
 *   - memories (facts + observations stored about this deal)
 *   - recent agent activity log entries for this deal
 *
 * Secured with Clerk auth. Deal must belong to the caller's space.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { id: dealId } = await params;

  // Verify deal belongs to this space
  const { data: deal, error: dealError } = await tenantTable(supabase, 'Deal', { spaceId: space.id })
    .select('id, title')
    .eq('id', dealId)
    .maybeSingle();

  if (dealError) throw dealError;
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });

  const [memoriesResult, activityResult] = await Promise.all([
    tenantTable(supabase, 'AgentMemory', { spaceId: space.id })
      .select('id, memoryType, content, importance, createdAt')
      .eq('entityType', 'deal')
      .eq('entityId', dealId)
      .order('importance', { ascending: false })
      .order('createdAt', { ascending: false })
      .limit(20),

    tenantTable(supabase, 'AgentActivityLog', { spaceId: space.id })
      .select('id, agentType, action, outcome, summary, dealId, createdAt')
      .eq('dealId', dealId)
      .order('createdAt', { ascending: false })
      .limit(15),
  ]);

  return NextResponse.json({
    dealId,
    memories: memoriesResult.data ?? [],
    activity: activityResult.data ?? [],
  });
}
