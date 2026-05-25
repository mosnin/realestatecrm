/**
 * GET /api/agent/usage
 *
 * Returns today's token usage for the space. Two write paths feed this:
 *   - Chat turns insert ChatUsage rows (agent/ledger.py → record_chat_usage,
 *     and lib/usage/record-chat-usage.ts on the TS side). Sum
 *     promptTokens + completionTokens for today.
 *   - Autonomous runs (cron / routines) call agent/security/budget.py
 *     → record_usage, which only writes to Upstash Redis at the key
 *     `agent:budget:{spaceId}:{YYYY-MM-DD}`. Read that too.
 *
 * Sum them. Earlier this route read only Redis (missed the chat path) and
 * then briefly read AgentTask.inputTokens/outputTokens (never populated).
 * ChatUsage + Redis is the actual source of truth.
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

  // Chat path — ChatUsage rows from today.
  const { data: chatRows } = await supabase
    .from('ChatUsage')
    .select('promptTokens, completionTokens')
    .eq('spaceId', space.id)
    .gte('createdAt', `${todayUtc}T00:00:00.000Z`);

  const chatTokens = (chatRows ?? []).reduce(
    (sum: number, row: { promptTokens: number | null; completionTokens: number | null }) =>
      sum + (row.promptTokens ?? 0) + (row.completionTokens ?? 0),
    0,
  );

  // Autonomous path — Upstash Redis counter the Python orchestrator
  // increments. Failure here is silently ignored (chat tokens alone are
  // still a useful answer for the realtor).
  let autonomousTokens = 0;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    try {
      const key = `agent:budget:${space.id}:${todayUtc}`;
      const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      if (res.ok) {
        const { result } = (await res.json()) as { result: string | null };
        autonomousTokens = result ? parseInt(result, 10) : 0;
      }
    } catch {
      // Best-effort — keep chat tokens.
    }
  }

  const used = chatTokens + autonomousTokens;

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
