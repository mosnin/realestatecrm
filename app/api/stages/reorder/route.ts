import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';

export async function PATCH(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json();
  const { stageIds } = body;

  if (!Array.isArray(stageIds) || stageIds.length === 0) {
    return NextResponse.json({ error: 'stageIds must be a non-empty array' }, { status: 400 });
  }

  if (!stageIds.every((id) => typeof id === 'string' && id.trim().length > 0)) {
    return NextResponse.json({ error: 'All stageIds must be non-empty strings' }, { status: 400 });
  }

  // Reject duplicate stageIds to prevent ambiguous position assignment
  const uniqueStageIds = Array.from(new Set(stageIds as string[]));
  if (uniqueStageIds.length !== stageIds.length) {
    return NextResponse.json({ error: 'stageIds must not contain duplicates' }, { status: 400 });
  }

  // Validate all stageIds belong to the caller's space
  const { data: existingStages, error: fetchError } = await tenantTable(supabase, 'DealStage', { spaceId: space.id })
    .select('id')
    .in('id', stageIds);

  if (fetchError) throw fetchError;

  const foundIds = new Set((existingStages ?? []).map((s: { id: string }) => s.id));
  const allBelongToSpace = stageIds.every((id) => foundIds.has(id));
  if (!allBelongToSpace) {
    return NextResponse.json({ error: 'One or more stageIds not found in this space' }, { status: 403 });
  }

  // Update each stage's position to its index in the ordered array; surface any DB errors
  const results = await Promise.all(
    stageIds.map((id, index) =>
      tenantTable(supabase, 'DealStage', { spaceId: space.id })
        .update({ position: index })
        .eq('id', id),
    ),
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw firstError;

  return NextResponse.json({ ok: true });
}
