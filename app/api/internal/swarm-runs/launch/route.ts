import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { enqueueWorkerTask } from '@/lib/queue';
import { supabase } from '@/lib/supabase';
import { swarmModalRuntimeConfig } from '@/lib/swarm-launch';

export const runtime = 'nodejs';
export const maxDuration = 60;

const identitySchema = z.object({
  runId: z.string().uuid(),
  spaceId: z.string().trim().min(1).max(200),
  launchToken: z.string().uuid(),
}).strict();

const taskSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('swarm-run-launch'),
    payload: identitySchema,
  }).strict(),
  z.object({
    task: z.literal('swarm-run-timeout'),
    payload: identitySchema,
  }).strict(),
]);

interface SwarmRunRow {
  id: string;
  spaceId: string;
  goal: string;
  status: string;
  launchToken: string | null;
  customAgentIds: string[] | null;
}

interface CustomAgentRow {
  id: string;
  name: string;
  systemPrompt: string;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.WORKER_SECRET?.trim();
  return Boolean(secret && req.headers.get('authorization') === `Bearer ${secret}`);
}

export async function POST(req: NextRequest) {
  if (!process.env.WORKER_SECRET?.trim()) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = taskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid swarm task payload' }, { status: 400 });
  }
  const { runId, spaceId, launchToken } = parsed.data.payload;

  if (parsed.data.task === 'swarm-run-timeout') {
    const { data: failed, error } = await supabase.rpc('fail_stale_swarm_launch', {
      p_run_id: runId,
      p_space_id: spaceId,
      p_launch_token: launchToken,
    });
    if (error) {
      logger.error('[internal.swarm-launch] timeout reconciliation failed', {
        runId,
        spaceId,
        error: error.message,
      });
      return NextResponse.json({ error: 'Timeout reconciliation failed' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: failed === true ? 'failed' : 'unchanged' });
  }

  const { data: claimState, error: claimError } = await supabase.rpc('claim_swarm_launch', {
    p_run_id: runId,
    p_space_id: spaceId,
    p_launch_token: launchToken,
  });
  if (claimError) {
    logger.error('[internal.swarm-launch] claim failed', {
      runId,
      spaceId,
      error: claimError.message,
    });
    return NextResponse.json({ error: 'Swarm claim failed' }, { status: 500 });
  }
  if (claimState !== 'claimed') {
    // Terminal, stale, and unknown messages are acknowledged. Retrying them
    // can never make them current and must not create billable work.
    return NextResponse.json({ ok: true, action: 'ignored', claimState });
  }

  const { data: rawRun, error: runError } = await supabase
    .from('SwarmRun')
    .select('id,spaceId,goal,status,launchToken,customAgentIds')
    .eq('id', runId)
    .eq('spaceId', spaceId)
    .eq('launchToken', launchToken)
    .maybeSingle();
  if (runError || !rawRun) {
    logger.error('[internal.swarm-launch] claimed run could not be loaded', {
      runId,
      spaceId,
      error: runError?.message,
    });
    return NextResponse.json({ error: 'Claimed swarm could not be loaded' }, { status: 500 });
  }
  const run = rawRun as SwarmRunRow;

  const requestedIds = Array.isArray(run.customAgentIds) ? run.customAgentIds : [];
  let customAgents: CustomAgentRow[] = [];
  if (requestedIds.length > 0) {
    const { data, error } = await supabase
      .from('CustomAgent')
      .select('id,name,systemPrompt')
      .eq('spaceId', spaceId)
      .eq('isActive', true)
      .in('id', requestedIds);
    if (error) {
      return NextResponse.json({ error: 'Custom agents could not be loaded' }, { status: 500 });
    }
    customAgents = (data ?? []) as CustomAgentRow[];
  }

  const modal = swarmModalRuntimeConfig();
  if (!modal) {
    return NextResponse.json({ error: 'Modal swarm runtime is unavailable' }, { status: 503 });
  }

  let response: Response;
  try {
    response = await fetch(modal.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: modal.secret,
        swarmRunId: runId,
        spaceId,
        launchToken,
        goal: run.goal,
        customAgents,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logger.warn('[internal.swarm-launch] Modal outcome unknown; queue will redeliver', {
      runId,
      spaceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Modal launch outcome unknown' }, { status: 502 });
  }

  const body = (await response.json().catch(() => ({}))) as { status?: unknown; error?: unknown };
  if (!response.ok) {
    logger.warn('[internal.swarm-launch] Modal rejected launch; queue will redeliver', {
      runId,
      spaceId,
      status: response.status,
      error: typeof body.error === 'string' ? body.error.slice(0, 300) : undefined,
    });
    return NextResponse.json({ error: 'Modal rejected swarm launch' }, { status: 502 });
  }
  if (typeof body.status !== 'string') {
    return NextResponse.json({ error: 'Invalid Modal launch receipt' }, { status: 502 });
  }
  if (body.status === 'accepted' || body.status === 'duplicate') {
    const timeoutArmed = await enqueueWorkerTask(
      'swarm-run-timeout',
      { runId, spaceId, launchToken },
      { delaySeconds: 12 * 60 },
    );
    if (!timeoutArmed) {
      // Returning non-2xx makes Cloudflare redeliver the same launch token.
      // Modal will answer duplicate and cannot spawn another worker, while a
      // later successful delivery can still arm this post-acceptance timeout.
      return NextResponse.json({ error: 'Post-acceptance recovery was not armed' }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true, action: body.status });
}
