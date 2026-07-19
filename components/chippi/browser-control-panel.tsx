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
 *
 * Source-aware oversight (this wave): `/status`'s `session.source` tells us
 * WHICH browser is acting — the realtor's own paired extension, or a fresh
 * Chippi cloud (headless) browser with no logins. Honest UI (CLAUDE.md #5)
 * means the panel always says which one out loud; the two carry very
 * different trust implications (a logged-in browser vs. an anonymous cloud
 * one). `source` is read defensively — an older/absent value degrades to a
 * neutral "Browser" label rather than guessing or crashing (see
 * `sourceLabel` below).
 *
 * Headless sessions have no in-page kill switch (there is no user tab to
 * show a banner on), so this panel's Stop button is the ONLY control for
 * them — rendered more prominently than the extension's Stop, with its own
 * explanation. There is not yet a dedicated server route to end a headless
 * session on demand (`endHeadlessSession` in `lib/browser-control/session.ts`
 * is only called internally, from the poll route's kill-signal path — see
 * that file). This panel calls a same-shaped `POST
 * /api/browser-control/headless/stop` optimistically and degrades honestly
 * (disables with an explanation, mirroring the settings page's
 * `rotateUnavailable` pattern for `/link/[id]/rotate`) the first time that
 * 404s, rather than pretending Stop always works. FLAGGED: that route does
 * not exist yet — this is a Track B / deploy-gated follow-up. Until it
 * ships, a headless session still ends itself automatically after a few
 * minutes idle (`STALE_AFTER_SECONDS` in session.ts), which the disabled
 * state's copy says honestly.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, Cloud, Square, Circle } from 'lucide-react';
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

/**
 * Mirrors `BrowserSessionSource` from `lib/browser-control/session.ts`
 * (kept as a local literal union rather than an import — this panel takes
 * no build-time dependency on that module, matching how `StatusResponse`
 * below already shapes its own view of the `/status` JSON rather than
 * importing server types).
 */
export type BrowserSessionSource = 'extension' | 'headless';

interface StatusLink {
  id: string;
  deviceLabel: string | null;
  tokenPrefix: string;
}

interface StatusResponse {
  links: StatusLink[];
  connected: boolean;
  // `source` is optional + typed loosely (not narrowed to the union) on
  // purpose: `/status` is a Track B surface this panel doesn't control the
  // rollout of, so a missing or unrecognized value must degrade gracefully
  // (via `sourceLabel`'s default branch) instead of throwing or lying.
  session: { id: string; status: string; source?: string; startedAt: string } | null;
}

interface LiveFrameData {
  image: string;
  pageUrl?: string;
  pageTitle?: string;
  at: string;
}

export interface SourceLabelInfo {
  /** Short badge text, e.g. "Your browser" / "Chippi cloud browser". */
  label: string;
  /** One-line honest explanation of what that badge means. */
  description: string;
}

/**
 * Pure mapping from a session's `source` to what the panel tells the user.
 * Exported for tests; also the single place this wording lives so the
 * settings page and panel never drift.
 *
 * Unknown/absent input (older `/status` payloads, a future source value we
 * don't recognize yet) maps to a neutral "Browser" label rather than
 * guessing which runtime is acting — honest UI over a confident-looking
 * wrong answer.
 */
export function sourceLabel(source: string | null | undefined): SourceLabelInfo {
  if (source === 'headless') {
    return {
      label: 'Chippi cloud browser',
      description: 'A fresh cloud browser — not logged into any of your accounts.',
    };
  }
  if (source === 'extension') {
    return {
      label: 'Your browser',
      description: 'Your own paired browser, using your logins.',
    };
  }
  return { label: 'Browser', description: '' };
}

/**
 * Pure classification of the live-view empty state, source-aware. Exported
 * for tests. Priority: a confirmed fetch error beats "still loading" beats
 * "loaded, nothing there yet" — matches the JSX's existing ternary, just
 * pulled out so it's independently testable without a DOM harness.
 */
export function liveViewEmptyStateMessage(params: {
  source: string | null | undefined;
  frameChecked: boolean;
  frameError: boolean;
}): string {
  if (params.frameError) return "Couldn't load the live view.";
  if (!params.frameChecked) return 'Loading live view…';
  return params.source === 'headless'
    ? "No live view yet — the cloud browser hasn't sent a frame."
    : 'No live view yet — waiting for your browser to send a frame.';
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

  // Whether ending a headless session on demand isn't wired up server-side
  // yet — learned honestly from a 404 on first attempt, never assumed
  // upfront. See the header comment for why this route may not exist yet.
  const [headlessStopUnavailable, setHeadlessStopUnavailable] = useState(false);

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
  // Only meaningful once a session is confirmed active — an idle/absent
  // session has no runtime "acting" to label.
  const sessionSource = active ? status?.session?.source : undefined;
  const isHeadless = sessionSource === 'headless';
  const source = sourceLabel(sessionSource);

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

  // Headless sessions aren't tied to a paired link, so the link-revoke Stop
  // above doesn't apply. This is the ONLY stop control for a cloud browser
  // (no user tab to show an in-page kill switch on) — see header comment on
  // why the endpoint it calls may not exist yet, and how this degrades.
  async function handleStopHeadless() {
    if (!status?.session) return;
    if (!confirm('Stop the Chippi cloud browser? This ends the session immediately.')) {
      return;
    }
    setStopping(true);
    try {
      const res = await fetch('/api/browser-control/headless/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: status.session.id }),
      });
      if (res.status === 404) {
        setHeadlessStopUnavailable(true);
        return;
      }
      if (res.ok) await fetchStatus();
    } catch {
      // Transient — leave the button as-is so the user can retry.
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
          <Loader2 aria-hidden className="h-3 w-3 animate-spin motion-reduce:animate-none text-muted-foreground" />
        ) : (
          <span
            aria-live="polite"
            className={cn(
              'inline-flex items-center gap-1.5 text-[11px] font-medium',
              active ? 'text-[#F25A00]' : 'text-muted-foreground',
            )}
          >
            <Circle
              aria-hidden
              className={cn(
                'h-2 w-2',
                active ? 'fill-[#F25A00] text-[#F25A00]' : 'fill-muted-foreground/40 text-muted-foreground/40',
              )}
            />
            {active ? 'Active' : links.length > 0 ? 'Paired, idle' : 'Not connected'}
          </span>
        )}
      </div>

      {/* Source badge — WHICH browser is acting, always shown while a
          session is confirmed active. Honest UI: this is the single most
          important thing on the panel, since an action in the realtor's own
          logged-in browser and one in a fresh cloud browser are very
          different things (see header comment). */}
      {active && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs',
            isHeadless ? 'bg-[#F25A00]/10 text-[#F25A00]' : 'bg-foreground/[0.04] text-foreground',
          )}
        >
          {isHeadless ? (
            <Cloud aria-hidden className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <MonitorSmartphone aria-hidden className="h-3.5 w-3.5 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{source.label}</p>
            {source.description && <p className={cn(CAPTION, 'truncate')}>{source.description}</p>}
          </div>
        </div>
      )}

      {!active && links.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MonitorSmartphone aria-hidden className="h-3.5 w-3.5 shrink-0" />
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
              <p aria-live="polite" className={cn(CAPTION, 'px-4 text-center text-white/60')}>
                {liveViewEmptyStateMessage({ source: sessionSource, frameChecked, frameError })}
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
                    {/* Failure is never color-only — the dot above is decorative
                        (aria-hidden), this text is the real signal for both
                        screen-reader and colorblind-safe reading. */}
                    {!a.ok && <span className="font-medium text-destructive"> · Failed</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Stop ───────────────────────────────────────────────────────── */}
      {isHeadless ? (
        // The cloud browser has no in-page kill switch — this button is the
        // ONLY way to stop it, so it gets its own explanation rather than
        // sharing the terser extension copy below.
        <div className="space-y-1.5">
          <p className={CAPTION}>
            No in-page kill switch for a cloud browser — this is the only way to stop it.
          </p>
          <button
            type="button"
            onClick={handleStopHeadless}
            disabled={!active || stopping || headlessStopUnavailable}
            title={
              headlessStopUnavailable
                ? "Stopping the cloud browser on demand isn't available yet — it ends automatically after a few minutes idle."
                : undefined
            }
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 rounded-xl h-10 text-sm font-semibold',
              'bg-destructive text-white hover:bg-destructive/90 transition-colors duration-150 motion-reduce:transition-none',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {stopping ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Square aria-hidden className="h-3.5 w-3.5 fill-current" />
            )}
            Stop cloud browser
          </button>
          {headlessStopUnavailable && (
            <p className={CAPTION}>
              Stopping on demand isn&apos;t available yet — this session ends automatically after a
              few minutes of inactivity.
            </p>
          )}
        </div>
      ) : (
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
            'bg-destructive text-white hover:bg-destructive/90 transition-colors duration-150 motion-reduce:transition-none',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          {stopping ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Square aria-hidden className="h-3.5 w-3.5 fill-current" />
          )}
          Stop
        </button>
      )}
    </div>
  );
}
