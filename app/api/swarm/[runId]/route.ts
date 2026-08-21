import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { tenantTable } from '@/lib/tenant-db';

// ── GET /api/swarm/[runId] ────────────────────────────────────────────────────
// Fetch a swarm run and its member list.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { runId } = await params;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the run and verify it belongs to the calling user's space.
  const { data: run, error: runError } = await tenantTable(supabase, 'SwarmRun', { spaceId: space.id })
    .select(
      'id,spaceId,goal,status,plan,result,errorMessage,totalCostCents,createdAt,completedAt',
    )
    .eq('id', runId)
    .maybeSingle();

  if (runError) {
    console.error('[swarm/[runId]/GET] run fetch error:', runError);
    return NextResponse.json({ error: 'Failed to fetch run' }, { status: 500 });
  }
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Fetch all members for this run.
  const { data: members, error: membersError } = await supabase
    .from('SwarmMember')
    .select(
      'id,swarmRunId,customAgentId,name,role,task,status,output,wave,costCents,startedAt,completedAt,createdAt',
    )
    .eq('swarmRunId', runId)
    .order('wave', { ascending: true })
    .order('createdAt', { ascending: true });

  if (membersError) {
    console.error('[swarm/[runId]/GET] members fetch error:', membersError);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }

  return NextResponse.json({ run, members: members ?? [] });
}
