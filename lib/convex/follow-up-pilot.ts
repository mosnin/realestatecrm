import 'server-only';
export type FollowUpReference = { spaceId: string; routineId: string; scheduledFor: string };
export type FollowUpState = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'uncertain';
export type FollowUpReceipt = { jobId: string; state: FollowUpState };

/** One explicit pilot routine. Selection remains sticky if configuration breaks: never fall back to another sender. */
export function usesConvexFollowUp(routineId: string): boolean {
  return Boolean(routineId) && process.env.CONVEX_FOLLOW_UP_ROUTINE_ID === routineId;
}
export async function callFollowUpCoordinator(operation: 'enqueue' | 'claim' | 'list', args: object): Promise<unknown> {
  const site = process.env.CONVEX_HTTP_URL;
  const secret = process.env.CHIPPI_CONVEX_SECRET;
  if (!site || !secret) throw new Error('Convex follow-up pilot is not configured');
  const url = new URL(`/follow-ups/${operation}`, site);
  if (url.protocol !== 'https:') throw new Error('Convex requires HTTPS');
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Convex follow-up coordinator unavailable');
  return response.json();
}
export async function enqueueFollowUp(reference: FollowUpReference): Promise<FollowUpReceipt> {
  const result = await callFollowUpCoordinator('enqueue', reference) as Partial<FollowUpReceipt> | null;
  if (!result || typeof result.jobId !== 'string' || !result.jobId || !['queued', 'running', 'completed', 'failed', 'skipped', 'uncertain'].includes(result.state ?? '')) throw new Error('Invalid Convex receipt');
  return result as FollowUpReceipt;
}
