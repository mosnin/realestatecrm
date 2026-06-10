/**
 * POST /api/swarm  — create a SwarmRun and fire-and-forget to the Modal swarm runner
 * GET  /api/swarm?spaceId=... — list the last 20 swarm runs for a space
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTodayTokenUsage } from '@/lib/usage/today-token-usage';

// ── GET /api/swarm?spaceId=... ───────────────────────────────────────────────
// List recent swarm runs for a space, newest-first, capped at 20.

export async function GET(req: NextRequest) {
  const spaceId = req.nextUrl.searchParams.get('spaceId');
  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`swarm:list:${userId}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Verify the space belongs to the calling user. Accept the space's id OR
  // slug — pages pass the URL slug; the strict id-only check 403'd them all.
  // The value is only compared against the AUTHED user's own space.
  const space = await getSpaceForUser(userId);
  if (!space || (space.id !== spaceId && space.slug !== spaceId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(space.id);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('SwarmRun')
    .select('*')
    .eq('spaceId', space.id)
    .order('createdAt', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[swarm/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch swarm runs' }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}

// ── POST /api/swarm ───────────────────────────────────────────────────────────
// Create a SwarmRun row (status: 'queued') and trigger the Modal swarm runner.

interface PostBody {
  spaceId?: string;
  goal?: string;
  customAgentIds?: string[];
}

interface CustomAgentRow {
  id: string;
  name: string;
  systemPrompt: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const spaceId = typeof body.spaceId === 'string' ? body.spaceId.trim() : '';
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const customAgentIds = Array.isArray(body.customAgentIds) ? body.customAgentIds : [];

  if (!spaceId) {
    return NextResponse.json({ error: 'spaceId required' }, { status: 400 });
  }
  if (!goal) {
    return NextResponse.json({ error: 'goal required' }, { status: 400 });
  }
  if (goal.length > 2000) {
    return NextResponse.json({ error: 'goal must be 2000 characters or fewer' }, { status: 400 });
  }

  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const rl = await checkRateLimit(`swarm:create:${userId}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Verify the space belongs to the calling user. Accept id OR slug — the
  // Swarm launch form passes the URL slug, and the strict id-only check made
  // every manual launch 403 (a slug never equals the UUID).
  const space = await getSpaceForUser(userId);
  if (!space || (space.id !== spaceId && space.slug !== spaceId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(space.id);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  // Daily token budget — the chat route enforces this, but swarm dispatch (a
  // multi-agent run, the costliest path) did not, so a space already over its
  // cap could launch unlimited swarms. Gate it the same way. Fails open on a DB
  // error so a transient blip can't block a legitimate run.
  try {
    const { data: settingsRow } = await supabase
      .from('AgentSettings')
      .select('dailyTokenBudget')
      .eq('spaceId', space.id)
      .maybeSingle();
    const dailyTokenBudget = (settingsRow?.dailyTokenBudget as number | null | undefined) ?? 50_000;
    const { total: todayTokens } = await getTodayTokenUsage(space.id);
    if (todayTokens >= dailyTokenBudget) {
      return NextResponse.json({ error: 'Daily token budget exceeded' }, { status: 429 });
    }
  } catch (err) {
    console.error('[swarm/POST] budget check failed — continuing', err);
  }

  // Fetch custom agents if IDs were provided.
  let agents: CustomAgentRow[] = [];
  if (customAgentIds.length > 0) {
    const { data: agentRows, error: agentError } = await supabase
      .from('CustomAgent')
      .select('id, name, systemPrompt')
      .in('id', customAgentIds)
      .eq('spaceId', space.id)
      .eq('isActive', true);

    if (agentError) {
      console.error('[swarm/POST] custom agent fetch error:', agentError);
      return NextResponse.json({ error: 'Failed to fetch custom agents' }, { status: 500 });
    }

    agents = (agentRows ?? []) as CustomAgentRow[];
  }

  // Insert the SwarmRun row.
  const { data: run, error: insertError } = await supabase
    .from('SwarmRun')
    .insert({ spaceId: space.id, goal, status: 'queued' })
    .select()
    .single();

  if (insertError || !run) {
    console.error('[swarm/POST] insert error:', insertError);
    return NextResponse.json({ error: 'Failed to create swarm run' }, { status: 500 });
  }

  // Fire-and-forget to Modal swarm runner — but never SILENTLY. The old
  // .catch logged and walked away, leaving the run 'queued' forever while
  // the UI said "working on it" and the stream span a 10-minute spinner.
  // Any dispatch failure (network, non-2xx, missing URL) now flips the run
  // to failed + writes the terminal SwarmEvent so the stream ends honestly.
  const failDispatch = async (why: string) => {
    console.error('[swarm] dispatch failed:', why);
    // Status-guarded: only a still-queued run can be failed by dispatch —
    // never clobber one the orchestrator already picked up.
    await supabase
      .from('SwarmRun')
      .update({ status: 'failed', errorMessage: why, completedAt: new Date().toISOString() })
      .eq('id', run.id)
      .eq('status', 'queued');
    await supabase
      .from('SwarmEvent')
      .insert({ swarmRunId: run.id, type: 'swarm_failed', data: { error: why } });
  };

  const swarmUrl = process.env.MODAL_SWARM_URL;
  if (!swarmUrl) {
    await failDispatch('Swarm backend is not configured');
    return NextResponse.json({ error: 'Swarm backend is not configured' }, { status: 503 });
  }

  fetch(swarmUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      secret: process.env.AGENT_INTERNAL_SECRET,
      swarmRunId: run.id,
      goal,
      spaceId: space.id,
      customAgents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        systemPrompt: a.systemPrompt,
      })),
    }),
  })
    .then((res) => {
      if (!res.ok) return failDispatch(`Swarm backend refused the job (${res.status})`);
    })
    .catch(() => failDispatch('Could not reach the swarm backend'));
  // Do NOT await the dispatch itself — the stream carries progress.

  return NextResponse.json({ swarmRunId: run.id }, { status: 201 });
}
