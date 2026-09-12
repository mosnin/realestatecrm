import { markConfirmed, markFailed, markInFlight } from '@/lib/agent/run-ledger';
import type { RoutineRunStatus } from '@/lib/routines';

/** One dispatch only. A lost response is not proof that an action did not run. */
export async function dispatchAgentRun(url: string, secret: string, body: Record<string, unknown>, runId: string): Promise<RoutineRunStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ ...body, secret, run_id: runId }),
      signal: controller.signal,
    });
    const receipt = await response.json().catch(() => null);
    if (receipt?.ok === true && receipt.run_id === runId && response.ok) {
      await markConfirmed(runId);
      return 'ok';
    }
    if (receipt?.error || (response.status >= 400 && response.status < 500)) {
      await markFailed(runId, String(receipt?.error ?? `Worker rejected request (${response.status})`));
      return 'error';
    }
    // Includes old workers without a correlated receipt and proxy 5xx errors.
    // Keep the run unresolved for exact-trajectory reconciliation; never replay.
    await markInFlight(runId);
    return 'error';
  } catch {
    await markInFlight(runId);
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}
