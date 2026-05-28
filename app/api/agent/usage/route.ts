/**
 * GET /api/agent/usage
 *
 * Returns today's token usage for the space. Reads the shared helper
 * `lib/usage/today-token-usage.ts` so display and chat-budget
 * enforcement (which routes through the same helper) cannot drift apart.
 */

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { getTodayTokenUsage } from '@/lib/usage/today-token-usage';

export async function GET() {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { total: used } = await getTodayTokenUsage(space.id);

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
