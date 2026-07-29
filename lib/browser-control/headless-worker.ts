import 'server-only';

import crypto from 'crypto';
import { isResearchWorkspaceEnabled } from '@/lib/chippi/research-workspace-flag';
import { claimHeadlessWorkerLaunch, finishHeadlessWorker } from './session';

/** Cloud browser workers are deliberately short-lived, never always-warm. */
// This is a heartbeat fence, not the Modal runtime limit. A worker that
// crashes must stop looking live within one short lease, while Modal itself
// remains bounded at fifteen minutes.
const WORKER_LEASE_SECONDS = 30;

export type HeadlessWorkerLaunch =
  | { ok: true; started: boolean }
  | { ok: false; reason: 'disabled' | 'not_configured' | 'launch_failed' };

/**
 * Start at most one Modal Playwright worker for an already-created headless
 * BrowserSession. The lease is claimed before network I/O; a second concurrent
 * chat tool sees `started:false` and reuses the worker instead of creating a
 * duplicate browser. A failed HTTP launch does not fabricate availability.
 */
export async function ensureHeadlessResearchWorker(sessionId: string): Promise<HeadlessWorkerLaunch> {
  if (!isResearchWorkspaceEnabled()) return { ok: false, reason: 'disabled' };

  const endpoint = process.env.MODAL_HEADLESS_BROWSER_URL;
  const secret = process.env.CHIPPI_BROWSER_WORKER_SECRET;
  if (!endpoint || !secret) return { ok: false, reason: 'not_configured' };
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, reason: 'not_configured' };
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.modal.run')) {
    return { ok: false, reason: 'not_configured' };
  }

  const leaseToken = crypto.randomUUID();
  let claimed = false;
  try {
    claimed = await claimHeadlessWorkerLaunch({
      sessionId,
      leaseToken,
      leaseSeconds: WORKER_LEASE_SECONDS,
    });
  } catch {
    // A feature flag without its staged migration is not a usable runtime.
    // Fail closed before an action is queued rather than letting it expire.
    return { ok: false, reason: 'launch_failed' };
  }
  if (!claimed) return { ok: true, started: false };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret, session_id: sessionId, lease_token: leaseToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await finishHeadlessWorker({ sessionId, leaseToken, error: `Modal launch returned ${response.status}` }).catch(() => {});
      return { ok: false, reason: 'launch_failed' };
    }
    return { ok: true, started: true };
  } catch {
    await finishHeadlessWorker({ sessionId, leaseToken, error: 'Modal launch request failed' }).catch(() => {});
    return { ok: false, reason: 'launch_failed' };
  }
}

export const HEADLESS_WORKER_LEASE_SECONDS = WORKER_LEASE_SECONDS;
