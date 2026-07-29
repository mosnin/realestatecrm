'use client';

/**
 * `BrowserControlPanel` — compact oversight surface for browser control:
 * live connection/session status, the recent action log, and a big Stop
 * button. Designed to drop into a chat side panel while the agent is
 * driving the realtor's browser.
 *
 * Wired as the feature-gated RightPanel Research tab. It stays separate from
 * the existing Browser tab, which is an in-panel read-only iframe backed by
 * lib/browser-proxy (see components/chippi/browser-view.tsx).
 *
 * Live data sources:
 *   - Connection/session status: polled in the backend's exact cloud-source
 *     mode. "Active" is only ever shown after a confirmed fetch says so.
 *   - Recent action log: loaded from the bounded, tenant-scoped `/actions`
 *     route and supplemented by streamed tool results until the next poll.
 *   - Live view: polled from the exact headless-frame endpoint while this
 *     session is active. A frame must match both session id and source before
 *     it is displayed.
 *
 * The Stop control affects only the cloud research session. A paired browser
 * remains in the existing Browser experience and is never exposed here.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Cloud, Square, Circle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL, BODY_COMPACT, CAPTION } from '@/lib/typography';
import type { BrowserActionType } from '@/lib/browser-control/protocol';
import {
  boundedResearchSources,
  toResearchSourceLink,
  type ResearchSourceLink,
} from '@/lib/chippi/research-workspace';

export interface BrowserActionLogEntry {
  id: string;
  type: BrowserActionType;
  summary: string;
  timestamp: string;
  ok: boolean;
  /** Server queue state when available; local completed results use done/error. */
  status?: 'queued' | 'running' | 'done' | 'error' | 'expired';
}

export function browserActionVisualState(action: BrowserActionLogEntry): {
  status: 'queued' | 'running' | 'done' | 'error' | 'expired';
  pending: boolean;
  failed: boolean;
} {
  const status = action.status ?? (action.ok ? 'done' : 'error');
  return {
    status,
    pending: status === 'queued' || status === 'running',
    failed: status === 'error' || status === 'expired',
  };
}

export function researchSessionLabel(state: ResearchSessionState | undefined): string {
  switch (state) {
    case 'launching': return 'Launching';
    case 'active': return 'Active';
    case 'error': return 'Error';
    case 'stopped': return 'Stopped';
    default: return 'Not running';
  }
}

/** Exact status removes the workspace when entitlement is revoked. */
export function clearsResearchWorkspaceForStatus(status: number): boolean {
  return status === 403 || status === 404;
}

/**
 * Mirrors `BrowserSessionSource` from `lib/browser-control/session.ts`
 * (kept as a local literal union rather than an import — this panel takes
 * no build-time dependency on that module, matching how `StatusResponse`
 * below already shapes its own view of the `/status` JSON rather than
 * importing server types).
 */
export type BrowserSessionSource = 'extension' | 'headless';

export type ResearchSessionState = 'launching' | 'active' | 'error' | 'stopped';

interface StatusResponse {
  session: {
    id: string;
    source: 'headless';
    state: ResearchSessionState;
    startedAt: string;
    lastHeartbeatAt: string | null;
    leaseExpiresAt: string | null;
    error?: string;
  } | null;
}

interface LiveFrameData {
  image: string;
  pageUrl?: string;
  pageTitle?: string;
  at: string;
}

interface LiveFrameResponse {
  sessionId: string | null;
  source: 'headless' | null;
  frame: LiveFrameData | null;
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
const BROWSER_ACTION_TYPES = new Set([
  'navigate', 'click', 'type', 'press', 'scroll', 'read_dom', 'screenshot', 'wait',
]);

export function BrowserControlPanel({
  actions = [],
  sources: incomingSources = [],
  className,
}: {
  /** Recent control_browser tool results for this conversation, newest last. */
  actions?: BrowserActionLogEntry[];
  /** Public page links returned by completed browser actions, newest last. */
  sources?: ResearchSourceLink[];
  className?: string;
}) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [historyActions, setHistoryActions] = useState<BrowserActionLogEntry[]>([]);
  const [historySources, setHistorySources] = useState<ResearchSourceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);

  const [frame, setFrame] = useState<LiveFrameData | null>(null);
  const [frameChecked, setFrameChecked] = useState(false);
  const [frameError, setFrameError] = useState(false);

  // Compatibility fallback: an older deployment may not expose the dedicated
  // stop endpoint yet. Learn that once rather than promising a Stop that fails.
  const [headlessStopUnavailable, setHeadlessStopUnavailable] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      // Never reuse general browser status here: a newer paired extension can
      // coexist with a cloud research run. This endpoint is exact-source.
      const res = await fetch('/api/browser-control/headless/status');
      if (res.ok) {
        setStatus((await res.json()) as StatusResponse);
      } else if (clearsResearchWorkspaceForStatus(res.status)) {
        // An entitlement can be removed while this panel is open. Do not keep
        // a stale green "Active" state or its last frame after that removal.
        setStatus(null);
        setFrame(null);
        setFrameChecked(true);
        setFrameError(false);
      }
    } catch {
      // Keep last-known status on a transient failure — the indicator below
      // only ever reflects a CONFIRMED fetch, so this never flips optimistic.
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/browser-control/actions');
      if (!res.ok) return;
      const body = (await res.json()) as { actions?: unknown };
      if (!Array.isArray(body.actions)) return;
      const rows = body.actions.flatMap((raw): Array<BrowserActionLogEntry & { source: ResearchSourceLink | null }> => {
        if (!raw || typeof raw !== 'object') return [];
        const row = raw as Record<string, unknown>;
        if (
          typeof row.id !== 'string' ||
          typeof row.type !== 'string' ||
          !BROWSER_ACTION_TYPES.has(row.type) ||
          typeof row.summary !== 'string' ||
          typeof row.timestamp !== 'string' ||
          typeof row.ok !== 'boolean' ||
          (row.status !== 'queued' && row.status !== 'running' && row.status !== 'done' && row.status !== 'error' && row.status !== 'expired')
        ) return [];
        return [{
          id: row.id,
          type: row.type as BrowserActionType,
          summary: row.summary,
          timestamp: row.timestamp,
          ok: row.ok,
          status: row.status as BrowserActionLogEntry['status'],
          source: toResearchSourceLink({
            id: `${row.id}:source`,
            pageUrl: row.pageUrl,
            pageTitle: row.pageTitle,
            timestamp: row.timestamp,
          }),
        }];
      });
      setHistoryActions(rows.map(({ source: _source, ...action }) => action));
      setHistorySources(boundedResearchSources(rows.flatMap(({ source }) => source ? [source] : [])));
    } catch {
      // Keep the most recent verified timeline through a transient failure.
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    const id = setInterval(() => {
      fetchStatus();
      fetchHistory();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchHistory, fetchStatus]);

  const researchState = status?.session?.state;
  const active = researchState === 'active';
  const sessionSource = status?.session?.source;
  const source = sourceLabel(sessionSource);

  const fetchFrame = useCallback(async () => {
    try {
      const res = await fetch('/api/browser-control/headless/frame');
      if (!res.ok) {
        setFrame(null);
        setFrameError(true);
        return;
      }
      const data = (await res.json()) as LiveFrameResponse;
      // A frame for a different browser session is not a research frame. Do
      // not display it optimistically while sessions are overlapping/stopping.
      if (data.source !== 'headless' || data.sessionId !== status?.session?.id) {
        setFrame(null);
        setFrameError(false);
        return;
      }
      setFrameError(false);
      setFrame(data.frame);
    } catch {
      setFrameError(true);
    } finally {
      setFrameChecked(true);
    }
  }, [status?.session?.id]);

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
  // The cloud browser has no user-tab kill switch. On older deployments the
  // dedicated endpoint can be absent; the compatibility state below says so.
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

  const recent = [...historyActions, ...actions]
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-8)
    .reverse();
  const sources = boundedResearchSources([...historySources, ...incomingSources]);

  return (
    <div className={cn('rounded-2xl bg-muted/50 p-4 space-y-3', className)}>
      {/* ── Status row ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <p className={SECTION_LABEL}>Research workspace</p>
        {loading ? (
          <Loader2 aria-hidden className="h-3 w-3 animate-spin motion-reduce:animate-none text-muted-foreground" />
        ) : (
          <span
            aria-live="polite"
            className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium',
              researchState === 'error' ? 'text-destructive' : active ? 'text-[#F25A00]' : 'text-muted-foreground')}
          >
            <Circle
              aria-hidden
              className={cn(
                'h-2 w-2',
                researchState === 'error'
                  ? 'fill-destructive text-destructive'
                  : active ? 'fill-[#F25A00] text-[#F25A00]' : 'fill-muted-foreground/40 text-muted-foreground/40',
              )}
            />
            {researchSessionLabel(researchState)}
          </span>
        )}
      </div>

      {/* Exact headless-status endpoint guarantees this is never a paired,
          logged-in extension session. Show it through launch/error/stopped,
          not only after a live frame arrives. */}
      {status?.session && (
        <div
          className="flex items-center gap-2 rounded-lg bg-[#F25A00]/10 px-2.5 py-1.5 text-xs text-[#F25A00]"
        >
          <Cloud aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium">{source.label}</p>
            {source.description && <p className={cn(CAPTION, 'truncate')}>{source.description}</p>}
          </div>
        </div>
      )}
      {researchState === 'error' && status?.session?.error && (
        <p className={cn(CAPTION, 'text-destructive')}>{status.session.error}</p>
      )}
      {researchState === 'launching' && (
        <p className={CAPTION}>Creating the cloud research browser…</p>
      )}
      {researchState === 'stopped' && <p className={CAPTION}>The cloud research browser has stopped.</p>}

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
        <p className={SECTION_LABEL}>Recent actions</p>
        {recent.length === 0 ? (
          <p className={cn(CAPTION, 'py-1')}>No browser actions yet.</p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {recent.map((a) => {
              const { status, pending, failed } = browserActionVisualState(a);
              return (
                <li key={a.id} className="flex items-start gap-2">
                  {pending ? (
                    <Loader2 aria-label={status === 'queued' ? 'Queued' : 'In progress'} className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none text-muted-foreground" />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        failed ? 'bg-destructive' : 'bg-emerald-500',
                      )}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn(BODY_COMPACT, 'truncate')}>{a.summary}</p>
                    <p className={CAPTION}>
                      {a.type} · {new Date(a.timestamp).toLocaleTimeString()}
                      {status === 'queued' && <span> · Queued</span>}
                      {status === 'running' && <span> · In progress</span>}
                      {/* Failure is never color-only — the dot above is decorative
                          (aria-hidden), this text is the real signal for both
                          screen-reader and colorblind-safe reading. */}
                      {failed && <span className="font-medium text-destructive"> · Failed</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* A compact provenance trail: these are page URLs reported by completed
          browser actions, not inferred citations and never raw page content. */}
      {sources.length > 0 && (
        <div className="space-y-1.5">
          <p className={SECTION_LABEL}>Sources visited</p>
          <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {sources.map((source) => (
              <li key={source.id}>
                <a
                  href={source.href}
                  target="_blank"
                  rel="noreferrer"
                  title={source.href}
                  className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/[0.035] hover:text-foreground"
                >
                  <ExternalLink aria-hidden className="h-3 w-3 shrink-0" />
                  <span className="truncate">{source.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Stop ───────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <p className={CAPTION}>
          Stop ends this cloud research session. It does not affect a paired browser.
        </p>
        <button
          type="button"
          onClick={handleStopHeadless}
          disabled={!status?.session || researchState === 'stopped' || researchState === 'error' || stopping || headlessStopUnavailable}
          title={
            headlessStopUnavailable
              ? 'This deployment does not expose cloud-browser stopping on demand.'
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
            This deployment does not expose cloud-browser stopping on demand.
          </p>
        )}
      </div>
    </div>
  );
}
