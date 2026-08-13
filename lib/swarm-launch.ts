import { randomUUID } from 'node:crypto';

import { logger } from '@/lib/logger';
import { enqueueWorkerTask, workerQueueConfigured } from '@/lib/queue';
import { supabase } from '@/lib/supabase';

export interface SwarmLaunchIdentity {
  runId: string;
  spaceId: string;
  launchToken: string;
}

export type SwarmLaunchOutcome =
  | ({ state: 'queued' | 'delivery_unknown'; reused?: boolean } & SwarmLaunchIdentity)
  | ({ state: 'already_exists'; status: string; reused: true } & SwarmLaunchIdentity)
  | { state: 'concurrent'; error: string }
  | { state: 'unavailable'; error: string }
  | { state: 'failed'; error: string };

export interface SwarmLaunchIdempotencyIdentity {
  /** Opaque, server-derived UUID. Never accept this value from a model. */
  runId: string;
  /** Opaque, server-derived token paired with runId. */
  launchToken: string;
}

export function swarmModalRuntimeConfig(): { url: URL; secret: string } | null {
  const endpoint = process.env.MODAL_SWARM_URL?.trim();
  const secret = process.env.AGENT_INTERNAL_SECRET?.trim();
  if (!endpoint || !secret) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run')) return null;
    return { url, secret };
  } catch {
    return null;
  }
}

export function swarmLaunchConfigured(): boolean {
  return workerQueueConfigured() && swarmModalRuntimeConfig() !== null;
}

/**
 * Commit a server-minted identity and launch token before either queue send.
 *
 * The delayed timeout is armed first. Therefore a network-unknown launch send
 * can never leave the row active forever: either the launch message arrived,
 * or the already-accepted timeout message closes the same token after 11m.
 */
export async function createAndEnqueueSwarmRun(input: {
  spaceId: string;
  goal: string;
  conversationId?: string | null;
  customAgentIds?: string[];
  /**
   * Optional deterministic identity for a trusted, retryable server caller.
   * The database remains authoritative: a replay is accepted only when every
   * immutable field matches the row already stored under this identity.
   */
  idempotencyIdentity?: SwarmLaunchIdempotencyIdentity;
}): Promise<SwarmLaunchOutcome> {
  if (!swarmLaunchConfigured()) {
    return { state: 'unavailable', error: 'Swarm runtime or durable queue is not configured.' };
  }

  const runId = input.idempotencyIdentity?.runId ?? randomUUID();
  const launchToken = input.idempotencyIdentity?.launchToken ?? randomUUID();
  const customAgentIds = [...new Set(input.customAgentIds ?? [])];
  const { data: claimState, error: claimError } = await supabase.rpc(
    'create_claimed_swarm_run',
    {
      p_run_id: runId,
      p_space_id: input.spaceId,
      p_goal: input.goal,
      p_conversation_id: input.conversationId ?? '',
      p_custom_agent_ids: customAgentIds,
      p_launch_token: launchToken,
    },
  );

  if (claimError) {
    logger.error('[swarm.launch] database claim failed', {
      spaceId: input.spaceId,
      error: claimError.message,
    });
    return { state: 'failed', error: 'The specialist run could not be created.' };
  }
  let reused = false;
  if (claimState === 'concurrent' && input.idempotencyIdentity) {
    // A provider retry can race the first request after the durable claim but
    // before either queue send. Resolve only the exact deterministic row. A
    // different goal/conversation/token is a conflict, never a reusable run.
    const { data: existing, error: existingError } = await supabase
      .from('SwarmRun')
      .select('id,spaceId,goal,conversationId,customAgentIds,launchToken,status,modalAcceptedAt')
      .eq('id', runId)
      .eq('spaceId', input.spaceId)
      .maybeSingle();
    if (existingError) {
      logger.error('[swarm.launch] idempotent replay lookup failed', {
        spaceId: input.spaceId,
        runId,
        error: existingError.message,
      });
      return { state: 'failed', error: 'The specialist run retry could not be verified.' };
    }
    const sameCustomAgents =
      JSON.stringify([...(existing?.customAgentIds ?? [])].sort()) ===
      JSON.stringify([...customAgentIds].sort());
    const exactReplay = Boolean(
      existing &&
        existing.id === runId &&
        existing.spaceId === input.spaceId &&
        existing.goal === input.goal &&
        (existing.conversationId ?? null) === (input.conversationId ?? null) &&
        existing.launchToken === launchToken &&
        sameCustomAgents,
    );
    if (!exactReplay) {
      return { state: 'concurrent', error: 'Another specialist run is already active.' };
    }
    reused = true;
    if (
      !['queued', 'planning', 'running', 'auditing'].includes(String(existing?.status)) ||
      existing?.modalAcceptedAt
    ) {
      return {
        state: 'already_exists',
        status: String(existing?.status ?? 'unknown'),
        reused: true,
        runId,
        spaceId: input.spaceId,
        launchToken,
      };
    }
  } else if (claimState === 'concurrent') {
    return { state: 'concurrent', error: 'Another specialist run is already active.' };
  }
  if (claimState !== 'claimed' && !reused) {
    logger.error('[swarm.launch] database rejected claim', {
      spaceId: input.spaceId,
      claimState,
    });
    return { state: 'failed', error: 'The specialist run request was invalid.' };
  }

  const identity: SwarmLaunchIdentity = { runId, spaceId: input.spaceId, launchToken };

  // Arm recovery before sending anything that can start billable work.
  const timeoutArmed = await enqueueWorkerTask('swarm-run-timeout', identity, {
    delaySeconds: 12 * 60,
  });
  if (!timeoutArmed) {
    const { error: failError } = await supabase.rpc('fail_unaccepted_swarm_launch', {
      p_run_id: runId,
      p_space_id: input.spaceId,
      p_launch_token: launchToken,
      p_reason: 'Specialist launch recovery could not be armed.',
    });
    if (failError) {
      logger.error('[swarm.launch] failed to close unarmed launch', {
        spaceId: input.spaceId,
        runId,
        error: failError.message,
      });
    }
    return { state: 'unavailable', error: 'The durable specialist queue is unavailable.' };
  }

  const launchQueued = await enqueueWorkerTask('swarm-run-launch', identity);
  if (!launchQueued) {
    logger.warn('[swarm.launch] launch delivery unknown; timeout recovery remains armed', {
      spaceId: input.spaceId,
      runId,
    });
    return { state: 'delivery_unknown', ...identity, reused };
  }
  return { state: 'queued', ...identity, reused };
}
