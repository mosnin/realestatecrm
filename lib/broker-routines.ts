/** Brokerage runs use a verified owner workspace and the broker tool registry. */

import { supabase } from '@/lib/supabase';
import {
  recordDispatch,
} from '@/lib/agent/run-ledger';
import { dispatchAgentRun } from '@/lib/agent/dispatch-run';
import type { RoutineRunStatus } from '@/lib/routines';

/**
 * Resolve a spaceId to key the run-ledger row against. The ledger schema
 * requires a spaceId; a broker routine has none of its own, so we use the
 * brokerage owner's Space.id. Returns null if it can't be resolved (no owner
 * space yet) — the caller treats that as a dispatch error.
 */
async function resolveBrokerageLedgerSpaceId(brokerageId: string): Promise<string | null> {
  const { data: brokerage } = await supabase
    .from('Brokerage')
    .select('ownerId')
    .eq('id', brokerageId)
    .maybeSingle();
  const ownerId = (brokerage as { ownerId?: string } | null)?.ownerId;
  if (!ownerId) return null;

  const { data: space } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', ownerId)
    .eq('brokerageId', brokerageId)
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  let spaceId = (space as { id?: string } | null)?.id;
  // Fall back to any space the owner has, even if not brokerage-tagged.
  if (!spaceId) {
    const { data: anySpace } = await supabase
      .from('Space')
      .select('id')
      .eq('ownerId', ownerId)
      .order('createdAt', { ascending: true })
      .limit(1)
      .maybeSingle();
    spaceId = (anySpace as { id?: string } | null)?.id;
  }
  return spaceId ?? null;
}

export async function fireBrokerRoutineRun(
  brokerageId: string,
  instruction: string,
  userId?: string,
): Promise<RoutineRunStatus> {
  // Read env at call time, not module load.
  const url = process.env.MODAL_WEBHOOK_URL ?? '';
  const secret = process.env.AGENT_INTERNAL_SECRET ?? '';
  if (!url || !secret) {
    console.error('[broker-routines] MODAL_WEBHOOK_URL or AGENT_INTERNAL_SECRET missing');
    return 'error';
  }

  // The run ledger is keyed by spaceId. Resolve the brokerage owner's space.
  const ledgerSpaceId = await resolveBrokerageLedgerSpaceId(brokerageId);
  if (!ledgerSpaceId) {
    console.error('[broker-routines] could not resolve a ledger spaceId', { brokerageId });
    return 'error';
  }

  // Correlate the dispatch, worker result and trajectory with one run ID.
  const runId = await recordDispatch(ledgerSpaceId, 'broker_routine');

  // Broker-mode dispatch body. brokerage_id + mode:'broker' are the
  // authoritative scope the Modal orchestrator must support.
  const body: Record<string, unknown> = {
    space_id: ledgerSpaceId,
    brokerage_id: brokerageId,
    mode: 'broker',
    secret,
    instruction,
    run_id: runId,
  };
  if (userId) body.user_id = userId;

  return dispatchAgentRun(url, secret, body, runId);
}
