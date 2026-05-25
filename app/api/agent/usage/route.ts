/**
 * GET /api/agent/usage
 *
 * Returns today's token usage for the space. Sums AgentTask rows so the
 * display matches what the chat path actually enforces against — Redis
 * is only written by the autonomous Python orchestrator, so a chat-heavy
 * user would see 0% even after burning through real tokens.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const todayUtc = new Date().toISOString().slice(0, 10);
  const { data: usageRows } = await supabase
    .from('AgentTask')
    .select('inputTokens, outputTokens')
    .eq('spaceId', space.id)
    .gte('createdAt', `${todayUtc}T00:00:00.000Z`);

  const used = (usageRows ?? []).reduce(
    (sum: number, row: { inputTokens: number | null; outputTokens: number | null }) =>
      sum + (row.inputTokens ?? 0) + (row.outputTokens ?? 0),
    0,
  );

  const { data: agentSettings } = await supabase
    .from('AgentSettings')
    .select('dailyTokenBudget')
    .eq('spaceId', space.id)
    .maybeSingle();

  const limit = (agentSettings?.dailyTokenBudget as number | null) ?? 50_000;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  // Reset time: midnight UTC today
  const now = new Date();
  const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

  return NextResponse.json({ used, limit, pct, resetsAt });
}
