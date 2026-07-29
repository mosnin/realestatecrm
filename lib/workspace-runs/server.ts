import 'server-only';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { inngest } from '@/lib/inngest/client';
import type { WorkspaceRunView } from './types';
import { rankWorkspaceComparisons, selectWorkspaceTarget, type WorkspaceProperty } from './packet';

const MAX_GOAL = 1_000;
const LAUNCH_LEASE_MS = 120_000;
function cell(value: unknown): string { return typeof value === 'string' || typeof value === 'number' ? String(value).replace(/[\r\n,]/g, ' ').slice(0, 180) : ''; }
function evidence(value: unknown): string { if (!value) return 'No property analysis was available.'; const raw = typeof value === 'string' ? value : JSON.stringify(value); const urls = raw.match(/https?:\/\/[^\s"']+/g)?.slice(0, 4) ?? []; return `${raw.replace(/\s+/g, ' ').slice(0, 700)}${urls.length ? ` Sources: ${urls.join(', ')}` : ''}`; }
async function preparePacket(spaceId: string, goal: string) {
  const [{ data: space }, { data: properties }] = await Promise.all([
    supabase.from('Space').select('name').eq('id', spaceId).maybeSingle(),
    supabase.from('Property').select('*').eq('spaceId', spaceId).order('updatedAt', { ascending: false }).limit(50),
  ]);
  const sourceRows = (properties ?? []) as WorkspaceProperty[];
  const target = selectWorkspaceTarget(goal, sourceRows);
  const comparisons = rankWorkspaceComparisons(target, sourceRows);
  const targetLabel = target ? `${cell(target.address)}${target.mlsNumber ? ` (MLS ${cell(target.mlsNumber)})` : ''}` : 'Unresolved target — review the candidate comparison set.';
  const propertyNotes = comparisons.length ? comparisons.map(({ row, basis }) => `- ${cell(row.address)}${row.city ? `, ${cell(row.city)}` : ''} — ${basis}`).join('\n') : '- No tenant-scoped comparison candidates were available.';
  const rows = comparisons.map(({ row }) => ({ address: cell(row.address), city: cell(row.city), state: cell(row.stateRegion), price: cell(row.listPrice ?? row.price), status: cell(row.listingStatus) }));
  return {
    brief: `# Listing Intelligence Brief\n\n**Workspace:** ${cell(space?.name) || 'Chippy'}\n\n**Objective:** ${goal}\n\n## Target selection\n${targetLabel}\n\n## Candidate comparison basis\n${propertyNotes}\n\n## Available evidence\n${evidence(target?.analysis ?? target?.areaReport)}\n\n## Decision frame\nConfirm the target property, pricing narrative, required disclosures, and launch owner before external publication.\n`,
    checklist: `# Launch Checklist\n\n- Confirm target listing facts, disclosures, and seller approval\n- Verify media rights, photography, and public-facing copy\n- Review pricing narrative against current comparable evidence\n- Assign launch owner and approval checkpoint\n- Schedule communications only after explicit approval\n`,
    comps: `address,city,state,list_price,status\n${rows.map((row) => [row.address,row.city,row.state,row.price,row.status].map((v) => `"${v.replace(/"/g,'""')}"`).join(',')).join('\n')}\n`,
    handoff: `# Handoff\n\nThis packet was prepared from the tenant-scoped Chippy workspace context for: ${goal}\n\nNo CRM records, messages, listings, or external systems were changed. Verify factual data and approve any action before publishing.\n`,
  };
}
export async function createWorkspaceRun(input: { id: string; workSessionId: string; spaceId: string; goal: string }) {
  const { data, error } = await supabase.from('WorkspaceRun').insert({ id: input.id, workSessionId: input.workSessionId, spaceId: input.spaceId, goal: input.goal.slice(0, MAX_GOAL) }).select('*').maybeSingle();
  if (data) return data;
  if (error && error.code !== '23505') throw error;
  const { data: existing, error: lookupError } = await supabase.from('WorkspaceRun').select('*').eq('workSessionId', input.workSessionId).eq('spaceId', input.spaceId).single();
  if (!existing) throw lookupError ?? new Error('workspace run was not persisted'); return existing;
}
export async function getWorkspaceRun(runId: string, spaceId: string): Promise<WorkspaceRunView | null> {
  const { data: run } = await supabase.from('WorkspaceRun').select('*').eq('id', runId).eq('spaceId', spaceId).maybeSingle(); if (!run) return null;
  const [{ data: events }, { data: files }] = await Promise.all([supabase.from('WorkspaceRunEvent').select('*').eq('runId', runId).order('sequence').limit(100), supabase.from('WorkspaceRunFile').select('*').eq('runId', runId).eq('spaceId', spaceId).order('createdAt').limit(16)]);
  // A partially published packet is never a deliverable. The terminal RPC is
  // the only authority allowed to expose the manifest.
  return { ...run, events: events ?? [], files: run.status === 'completed' ? files ?? [] : [] } as WorkspaceRunView;
}
export async function requestWorkspaceRunCancellation(runId: string, spaceId: string): Promise<boolean> {
  const { data: run, error: lookupError } = await supabase.from('WorkspaceRun').select('workSessionId').eq('id', runId).eq('spaceId', spaceId).maybeSingle();
  if (lookupError || !run) return false;
  const { data, error } = await supabase.rpc('cancel_workspace_run_and_session', { p_session_id: run.workSessionId, p_space_id: spaceId });
  if (error) throw error; return data === true;
}
/** Awaited acceptance: callers never report a started workspace before Modal returns HTTP acceptance. */
export async function dispatchWorkspaceRun(input: { runId: string; spaceId: string; workSessionId: string; goal: string; answer?: string | null }): Promise<void> {
  // Atomic launch fence: only the queued winner is allowed to contact Modal.
  // Retried Inngest execution sees launching/running and reuses that run.
  const launchToken = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabase.rpc('claim_workspace_launch', { p_run_id: input.runId, p_space_id: input.spaceId, p_token: launchToken });
  if (claimError) throw claimError;
  if (!claimed) {
    // A prior delivery may have claimed the lease but crashed before queuing
    // recovery. Repair that precise send window using its durable token.
    const { data: pending, error: pendingError } = await supabase.from('WorkspaceRun').select('status,launchToken').eq('id', input.runId).eq('spaceId', input.spaceId).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending?.status === 'launching' && pending.launchToken) await scheduleWorkspaceLaunchRecovery(input.workSessionId, input.runId, pending.launchToken);
    return;
  }
  const endpoint = process.env.MODAL_WORKSPACE_RUN_URL; const secret = process.env.CHIPPI_WORKSPACE_MODAL_SECRET;
  if (!endpoint || !secret) { await markWorkspaceTerminal(input, 'failed', 'Workspace runtime is not configured.'); return; }
  let url: URL; try { url = new URL(endpoint); } catch { await markWorkspaceTerminal(input, 'failed', 'Workspace runtime URL is invalid.'); return; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.modal.run')) { await markWorkspaceTerminal(input, 'failed', 'Workspace runtime URL is invalid.'); return; }
  const requestId = crypto.createHash('sha256').update(input.runId).digest('hex');
  try {
    const resolvedGoal = [input.goal, input.answer ? `Property clarification: ${input.answer}` : ''].filter(Boolean).join('\n');
    const packet = await preparePacket(input.spaceId, resolvedGoal);
    const response = await fetch(url, { method: 'POST', headers: { 'content-type':'application/json','x-chippy-workspace-request': requestId }, body: JSON.stringify({ secret, run_id: input.runId, space_id: input.spaceId, work_session_id: input.workSessionId, goal: resolvedGoal.slice(0, MAX_GOAL), packet, launch_token: launchToken }), signal: AbortSignal.timeout(10_000) });
    if (response.status !== 202) {
      await markWorkspaceTerminal(input, 'failed', `Workspace runtime rejected launch (${response.status}).`);
      return;
    }
  } catch (error) {
    logger.error('[workspace-run] Modal launch outcome is unknown; lease recovery will decide', { runId: input.runId }, error);
  }
  // A 202 only proves the acceptor replied. It can still crash before its
  // spawned worker emits callbacks, so every launch has this same recovery.
  // If this send throws, an Inngest retry reaches the !claimed repair above.
  await scheduleWorkspaceLaunchRecovery(input.workSessionId, input.runId, launchToken);
}

export async function scheduleWorkspaceLaunchRecovery(sessionId: string, runId: string, launchToken: string): Promise<void> {
  const at = Date.now() + LAUNCH_LEASE_MS + 5_000;
  await inngest.send({ id: `workspace-launch-recovery:${runId}:${launchToken}`, name: 'work-session/execute', ts: at, data: { sessionId, workspaceRunId: runId, reason: 'launch_lease_recovery' } });
}
export async function markWorkspaceTerminal(input: { runId: string; spaceId: string; workSessionId: string }, status: 'failed' | 'completed' | 'cancelled', error: string | null) {
  await supabase.rpc('finish_workspace_run_and_session', { p_run_id: input.runId, p_space_id: input.spaceId, p_outcome: status, p_error: error });
}
