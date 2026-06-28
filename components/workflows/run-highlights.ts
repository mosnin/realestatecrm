/**
 * run-highlights — map a run's steps to per-node outcomes for the canvas.
 *
 * Each graph step persists its source node id in `detail.nodeId` (the executor
 * writes it). This reduces a step list to `{ nodeId → 'ok' | 'failed' |
 * 'skipped' }` so the canvas can light up the executed path: which nodes ran and
 * how they turned out. Steps with no nodeId (the linear path, or malformed
 * detail) are ignored. Pure + tested.
 */

export type NodeRunStatus = 'ok' | 'failed' | 'skipped';

/** The minimal step shape we read — matches both the test-run + run-history rows. */
export interface RunStepLike {
  status: string;
  detail?: unknown;
}

function nodeIdOf(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const id = (detail as { nodeId?: unknown }).nodeId;
  return typeof id === 'string' && id ? id : null;
}

function normalizeStatus(status: string): NodeRunStatus {
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'skipped') return 'skipped';
  return 'ok';
}

/**
 * Build the nodeId→status map from a run's steps. When a node somehow has
 * multiple steps, the LAST one wins (the run's final word on that node).
 */
export function highlightsFromSteps(steps: RunStepLike[]): Record<string, NodeRunStatus> {
  const out: Record<string, NodeRunStatus> = {};
  for (const step of steps) {
    const nodeId = nodeIdOf(step.detail);
    if (!nodeId) continue;
    out[nodeId] = normalizeStatus(step.status);
  }
  return out;
}
