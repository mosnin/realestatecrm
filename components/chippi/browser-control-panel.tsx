'use client';

/**
 * `BrowserControlPanel` — compact oversight surface for browser control:
 * live connection/session status, the recent action log, and a big Stop
 * button. Designed to drop into a chat side panel while the agent is
 * driving the realtor's browser.
 *
 * NOT wired into RightPanel's existing 'browser' tab
 * (components/chippi/right-panel-tabs.tsx / right-panel-embeds.ts) — that
 * tab is a DIFFERENT, pre-existing feature: an in-panel read-only iframe web
 * view backed by lib/browser-proxy (see components/chippi/browser-view.tsx).
 * Mounting THIS panel as a new RightPanel tab/mode touches right-panel.tsx +
 * right-panel-tabs.tsx + right-panel-embeds.ts, none of which are in this
 * track's ownership for this wave — flagged as a follow-up integration
 * point, not done here.
 *
 * Live data sources:
 *   - Connection/session status: polled from the existing, Clerk-authed
 *     `GET /api/browser-control/status` (Track B). Honest by construction —
 *     "Active" is only ever shown after a confirmed fetch says so.
 *   - Recent action log: there is no server-side history endpoint for
 *     BrowserAction rows (Track B's surface is status / pair/code /
 *     pair/redeem / link / poll — no `/actions` list route), so this
 *     component takes recent entries as a prop instead of fetching its own.
 *     The natural sources are each `control_browser` tool result (summary +
 *     ok + actionType — see `lib/ai-tools/tools/control-browser.ts`) AND
 *     each step of a `browser_task` tool result's `data.steps` (same shape:
 *     step/action/detail/ok/summary — see `lib/ai-tools/tools/browser-task.ts`);
 *     the caller flattens both into `actions` in chronological order. With
 *     no entries passed, the panel shows an honest "No browser actions yet"
 *     empty state rather than fabricating activity.
 *   - Live view: polled from `GET /api/browser-control/frame` (added this
 *     wave) once a second WHILE a session is active — the caller's active
 *     control session's latest pushed viewport frame, or `{ frame: null }`
 *     honestly when there is no active session or the extension hasn't
 *     pushed a frame yet (see `getLatestFrame` in
 *     `lib/browser-control/session.ts`). Polling stops the instant the
 *     session goes idle, so this never burns a request loop against a dead
 *     session.
 *
 * Stop button: the only server-side kill switch available today is
 * `DELETE /api/browser-control/link/[id]` (full revoke — see that route's
 * header comment), and `/status` doesn't report which linkId owns the
 * active session. So Stop only enables when there is exactly ONE paired
 * device (the unambiguous case); with more than one, it's disabled with a
 * tooltip pointing at Settings → Browser control, where each device has its
 * own Revoke button. Flagged as a follow-up: if `/status` starts returning
 * `session.linkId`, Stop can target precisely regardless of device count.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, Square, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL, BODY_COMPACT, CAPTION } from '@/lib/typography';
import type { BrowserActionType } from '@/lib/browser-control/protocol';

export interface BrowserActionLogEntry {
  id: string;
  type: BrowserActionType;
  summary: string;
  timestamp: string;
  ok: boolean;
}

interface StatusLink {
  id: string;
  deviceLabel: string | null;
  tokenPrefix: string;
}

interface StatusResponse {
  links: StatusLink[];
  connected: boolean;
  session: { id: string; status: string; startedAt: string } | null;
}

interface LiveFrameData {
  image: string;
  pageUrl?: string;
  pageTitle?: string;
  at: string;
}

const POLL_MS = 4_000;
/** ~1/s while a session is active — matches the extension's own capture
 *  cadence (extension/background.js), so polling faster wouldn't show a
 *  fresher frame anyway. */
const FRAME_POLL_MS = 1_000;

export function BrowserControlPanel({
  actions = [],
  className,
}: {
  /** Recent control_browser tool results for this conversation, newest last. */
  actions?: BrowserActionLogEntry[];
  className?: string;
}) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);

  const [frame, setFrame] = useState<LiveFrameData | null>(null);
  const [frameChecked, setFrameChecked] = useState(false);
  const [frameError, setFrameError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/browser-control/status');
      if (res.ok) {
        setStatus((await res.json()) as StatusResponse);
      }
    } catch {
      // Keep last-known status on a transient failure — the indicator below
      // only ever reflects a CONFIRMED fetch, so this never flips optimistic.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const active = status?.session?.status === 'active';
  const links = status?.links ?? [];

  const fetchFrame = useCallback(async () => {
    try {
      const res = await fetch('/api/browser-control/frame');
      if (!res.ok) {
        setFrameError(true);
        return;
      }
      const data = (await res.json()) as { frame: LiveFrameData | null };
      setFrameError(false);
      setFrame(data.frame);
    } catch {
      setFrameError(true);
    } finally {
      setFrameChecked(true);
    }
  }, []);

  // Only poll the screencast while a session is confirmed active — never
  // guess a live view exists, and never keep a poll loop running against a
  // session that just went idle.
  useEffect(() => {
    if (!active) {
      setFrame(null);
      setFrameChecked(false);
      setFrameError(false);
      return;
    }
    fetchFrame();
    const id = setInterval(fetchFrame, FRAME_POLL_MS);
    return () => clearInterval(id);
  }, [active, fetchFrame]);
  const soleLink = links.length === 1 ? links[0] : null;
  const ambiguousStop = links.length > 1;

  async function handleStop() {
    if (!soleLink) return;
    const label = soleLink.deviceLabel || 'this browser';
    if (
      !confirm(
        `Stop Chippi and disconnect ${label}? You'll need to pair again to reconnect.`,
      )
    ) {
      return;
    }
    setStopping(true);
    try {
      const res = await fetch(`/api/browser-control/link/${soleLink.id}`, { method: 'DELETE' });
      if (res.ok) await fetchStatus();
    } finally {
      setStopping(false);
    }
  }

  const recent = actions.slice(-8).reverse();

  return (
    <div className={cn('rounded-2xl bg-muted/50 p-4 space-y-3', className)}>
      {/* ── Status row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <p className={SECTION_LABEL}>Browser control</p>
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-medium',
              active ? 'text-[#F25A00]' : 'text-muted-foreground',
            )}
          >
            <Circle
              className={cn(
                'h-2 w-2',
                active ? 'fill-[#F25A00] text-[#F25A00]' : 'fill-muted-foreground/40 text-muted-foreground/40',
              )}
            />
            {active ? 'Active' : links.length > 0 ? 'Paired, idle' : 'Not connected'}
          </span>
        )}
      </div>

      {links.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {links.length === 1
              ? soleLink!.deviceLabel || soleLink!.tokenPrefix
              : `${links.length} browsers paired`}
          </span>
        </div>
      )}

      {/* ── Live view ──────────────────────────────────────────────────── */}
      {active && (
        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Live view</p>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black/85 flex items-center justify-center">
            {frame ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL screencast frame, not a Next-optimizable asset */}
                <img
                  src={frame.image}
                  alt={frame.pageTitle || frame.pageUrl || 'Live browser view'}
                  className="h-full w-full object-contain"
                />
                {(frame.pageTitle || frame.pageUrl) && (
                  <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1">
                    <p className="truncate text-[11px] text-white/90">{frame.pageTitle || frame.pageUrl}</p>
                  </div>
                )}
              </>
            ) : (
              <p className={cn(CAPTION, 'px-4 text-center text-white/60')}>
                {frameError
                  ? "Couldn't load the live view."
                  : frameChecked
                    ? 'No live view yet — waiting for the browser to send a frame.'
                    : 'Loading live view…'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Recent action log ─────────────────────────────────────────── */}
      <div className="space-y-1.5">
        {recent.length === 0 ? (
          <p className={cn(CAPTION, 'py-1')}>No browser actions yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {recent.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    a.ok ? 'bg-emerald-500' : 'bg-destructive',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className={cn(BODY_COMPACT, 'truncate')}>{a.summary}</p>
                  <p className={CAPTION}>
                    {a.type} · {new Date(a.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Stop ───────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleStop}
        disabled={!active || !soleLink || stopping}
        title={
          ambiguousStop
            ? 'Multiple browsers paired — stop a specific one from Settings → Browser control.'
            : undefined
        }
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 rounded-xl h-10 text-sm font-semibold',
          'bg-destructive text-white hover:bg-destructive/90 transition-colors duration-150',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        {stopping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
        Stop
      </button>
    </div>
  );
}
