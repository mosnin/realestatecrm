/**
 * POST /api/swarm  — atomically claim a SwarmRun and enqueue its fenced Modal launch
 * GET  /api/swarm?spaceId=... — list the last 20 swarm runs for a space
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { assertSpaceEnabled } from '@/lib/agent/kill-switch';
import { checkRateLimit } from '@/lib/rate-limit';
import { getTodayTokenUsage } from '@/lib/usage/today-token-usage';
import { z } from 'zod';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';
import { createAndEnqueueSwarmRun, swarmLaunchConfigured } from '@/lib/swarm-launch';

/** Shape guard for a swarm run. The 2000-char goal limit and "required"
 *  ordering are preserved below; this bounds the field types and caps the
 *  customAgentIds array so an unbounded list can't be parsed into memory. */
const swarmBodySchema = z.object({
  spaceId: z.string().max(200).optional(),
  goal: z.string().max(5000).optional(),
  customAgentIds: z.array(z.string().max(200)).max(50).optional(),
});

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

  // Verify the space belongs to the calling user.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('SwarmRun')
    .select('*')
    .eq('spaceId', spaceId)
    .order('createdAt', { ascending: false })
    .limit(20);

  if (error) {
    console.error('[swarm/GET] query error:', error);
    return NextResponse.json({ error: 'Failed to fetch swarm runs' }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}

// ── POST /api/swarm ───────────────────────────────────────────────────────────
// Create a token-fenced SwarmRun and dispatch it through the durable queue.

interface PostBody {
  spaceId?: string;
  goal?: string;
  customAgentIds?: string[];
}

export async function POST(req: NextRequest) {
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const parsed = parseOrBadRequest(swarmBodySchema, read.data);
  if (!parsed.ok) return parsed.response;
  const body: PostBody = parsed.data;

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

  // Verify the space belongs to the calling user.
  const space = await getSpaceForUser(userId);
  if (!space || space.id !== spaceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await assertSpaceEnabled(spaceId);
  } catch {
    return NextResponse.json({ error: 'Space is disabled' }, { status: 403 });
  }

  // Validate the complete Modal boundary before creating a durable row. A
  // queued row without a callable, authenticated runtime cannot ever advance.
  if (!swarmLaunchConfigured()) {
    console.error('[swarm/POST] durable swarm runtime is not configured correctly');
    return NextResponse.json({ error: 'Swarm runtime is not configured' }, { status: 503 });
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

  const launch = await createAndEnqueueSwarmRun({
    spaceId: space.id,
    goal,
    customAgentIds,
  });
  if (launch.state === 'concurrent') {
    return NextResponse.json({ error: launch.error }, { status: 409 });
  }
  if (launch.state === 'unavailable') {
    return NextResponse.json({ error: launch.error }, { status: 503 });
  }
  if (launch.state === 'failed') {
    return NextResponse.json({ error: launch.error }, { status: 500 });
  }
  return NextResponse.json(
    {
      swarmRunId: launch.runId,
      delivery: launch.state === 'queued' ? 'queued' : 'unconfirmed_recovery_armed',
    },
    { status: launch.state === 'queued' ? 201 : 202 },
  );
}
