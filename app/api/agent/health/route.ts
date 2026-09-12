import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';

/** Durable outcomes, not generated text or model-estimated time savings. */
export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const space = await getSpaceForUser(auth.userId);
  if (!space) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const scope = { spaceId: space.id };
  const [messages, handoffs, failedRuns, overdue] = await Promise.all([
    tenantTable(supabase, 'ScheduledMessage', scope).select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('updatedAt', since),
    tenantTable(supabase, 'ClientCommitment', scope).select('id', { count: 'exact', head: true }).eq('kind', 'handoff').eq('status', 'completed').gte('completedAt', since),
    tenantTable(supabase, 'AgentRunLedger', scope).select('runId', { count: 'exact', head: true }).eq('status', 'failed').gte('dispatchedAt', since),
    tenantTable(supabase, 'ClientCommitment', scope).select('id', { count: 'exact', head: true }).in('status', ['open', 'accepted']).lt('dueAt', new Date().toISOString()),
  ]);
  if ([messages, handoffs, failedRuns, overdue].some(result => result.error || result.count === null)) {
    return NextResponse.json({ error: 'Outcome metrics are unavailable' }, { status: 503 });
  }
  return NextResponse.json({ days: 7, sentMessages: messages.count, completedHandoffs: handoffs.count, failedRuns: failedRuns.count, overdueCommitments: overdue.count });
}
