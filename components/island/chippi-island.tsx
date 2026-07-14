'use client';

/**
 * The Island — a Dynamic Island-style ambient pill for Chippi's background
 * work, floating top-center over the dashboard shell.
 *
 * Compact: breathing orange dot + one live status line
 * ("Chippi · Researching comps for 412 Elm…"). Hover or click springs it
 * open into a card: goal, plan steps ticking live, elapsed time, and a
 * "Jump in" link to the session's chat surface. Completion morphs into a
 * quiet green success state for a few seconds and retreats; failures stay
 * (red tint, linked in) until dismissed — degraded states report as degraded.
 *
 * Data flow is exactly the workspace strip's: initial REST load from
 * /api/work-sessions, then the shared Supabase Realtime channel machinery
 * (`useRealtime`, auth-bridged by SupabaseRealtimeBridge in the layout
 * shell) keeps the rows live. No new event channels. All status/timing
 * decisions live in the pure reducer (`island-state.ts`).
 *
 * Deliberately absent on the Chippi workspace itself (the strip already
 * owns that surface) and in `?embed=1` chrome-stripped mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Check, Circle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtime } from '@/hooks/use-realtime';
import type { PlanStep } from '@/lib/work-sessions/types';
import {
  deriveIslandState,
  formatElapsed,
  jumpInHref,
  trackTerminalTransitions,
  type IslandSessionRow,
} from '@/components/island/island-state';

const DISMISSED_KEY = 'chippi-island-dismissed:v1';

/** Near-critically damped — the morph settles with zero overshoot. */
const ISLAND_SPRING = { type: 'spring' as const, stiffness: 520, damping: 46, mass: 0.9 };

function readDismissed(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function ChippiIsland({ slug, spaceId }: { slug: string; spaceId: string }) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const isEmbed = searchParams?.get('embed') === '1';
  // The Chippi workspace already renders the full work-sessions strip —
  // doubling it with the island would be noise.
  const onChippiSurface = pathname.startsWith(`/s/${slug}/chippi`);
  const suppressed = isEmbed || onChippiSurface;

  const [sessions, setSessions] = useState<IslandSessionRow[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [terminalSeenAt, setTerminalSeenAt] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const prevStatusesRef = useRef<Record<string, string>>({});
  const reduceMotion = useReducedMotion();

  // Dismissals survive navigation within the browser session, nothing more.
  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  // Initial load — same endpoint the strip uses; Realtime overlays from there.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-sessions?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { sessions: IslandSessionRow[] };
      setSessions(json.sessions);
    } catch {
      /* the island is ambient decoration — never let it crash the shell */
    }
  }, [slug]);

  useEffect(() => {
    if (suppressed) return;
    void load();
  }, [load, suppressed]);

  // Live overlay — identical subscription shape to WorkSessionsStrip.
  useRealtime<Record<string, unknown>>({
    table: 'WorkSession',
    event: '*',
    filter: `spaceId=eq.${spaceId}`,
    enabled: !suppressed,
    onEvent: (payload) => {
      const row = (payload.new ?? payload.old) as unknown as IslandSessionRow | null;
      if (!row?.id) return;
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== row.id);
        return payload.eventType === 'DELETE' ? rest : [row, ...rest];
      });
    },
  });

  // Record when finished states are first observed (pure logic, tested).
  useEffect(() => {
    setTerminalSeenAt((prev) =>
      trackTerminalTransitions(prev, prevStatusesRef.current, sessions, Date.now()),
    );
    prevStatusesRef.current = Object.fromEntries(sessions.map((s) => [s.id, s.status]));
  }, [sessions]);

  const state = useMemo(
    () => deriveIslandState({ sessions, dismissed, terminalSeenAt, now }),
    [sessions, dismissed, terminalSeenAt, now],
  );

  // A 1s heartbeat while visible drives the elapsed clock and the success
  // retreat; hidden costs nothing.
  const visible = !suppressed && state.mode !== 'hidden';
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  // A new session (or a fresh outcome) resets any pinned-open card.
  const sessionKey = `${state.session?.id ?? ''}:${state.mode}`;
  useEffect(() => {
    setPinned(false);
  }, [sessionKey]);

  const dismiss = useCallback(() => {
    const s = state.session;
    if (!s) return;
    setDismissed((prev) => {
      const next = { ...prev, [s.id]: s.status };
      try {
        sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        /* storage full/blocked — in-memory dismissal still works */
      }
      return next;
    });
    setPinned(false);
    setHovered(false);
  }, [state.session]);

  if (suppressed) return null;

  const expanded = pinned || hovered;
  const session = state.session;

  return (
    <div
      className="chippi-island-root pointer-events-none fixed inset-x-0 top-2.5 z-50 flex justify-center px-3"
      aria-live="polite"
    >
      <AnimatePresence>
        {state.mode !== 'hidden' && session && (
          <motion.div
            key="chippi-island"
            layout={!reduceMotion}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.9 }}
            transition={reduceMotion ? { duration: 0.15 } : ISLAND_SPRING}
            style={{ borderRadius: expanded ? 18 : 999 }}
            data-tone={state.tone}
            className={cn(
              'chippi-island pointer-events-auto w-fit max-w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden border shadow-lg backdrop-blur-md',
              'bg-background/90 supports-[backdrop-filter]:bg-background/80',
              state.tone === 'success'
                ? 'border-emerald-600/35 dark:border-emerald-400/30'
                : state.tone === 'failure'
                  ? 'border-red-600/35 dark:border-red-400/30'
                  : 'border-border',
            )}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            {/* Compact row — always present; the card grows beneath it. */}
            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse Chippi status' : 'Expand Chippi status'}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left"
            >
              <span className="chippi-island-dot" data-tone={state.tone} aria-hidden />
              <span className="shrink-0 text-[12px] font-semibold text-foreground">Chippi</span>
              <span aria-hidden className="shrink-0 text-[12px] text-muted-foreground/50">
                ·
              </span>
              <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                {state.statusLine}
              </span>
              {state.mode === 'active' && state.totalCount > 0 && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                  {state.doneCount}/{state.totalCount}
                </span>
              )}
              {state.moreCount > 0 && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                  +{state.moreCount}
                </span>
              )}
            </button>

            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="body"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.18, delay: 0.05 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  className="px-3.5 pb-3"
                >
                  <div className="flex items-start gap-2 border-t border-border/60 pt-2.5">
                    <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                      {session.goal}
                    </p>
                    {state.elapsedMs !== null && (
                      <span className="shrink-0 pt-px text-[11px] tabular-nums text-muted-foreground">
                        {formatElapsed(state.elapsedMs)}
                      </span>
                    )}
                    {state.mode !== 'active' && (
                      <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Dismiss"
                        className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {state.plan.length > 0 && (
                    <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                      {state.plan.map((step) => (
                        <li key={step.id} className="flex items-center gap-2 text-[12px]">
                          <span className="flex w-4 shrink-0 justify-center">
                            <IslandStepIcon status={step.status} />
                          </span>
                          <span
                            className={cn(
                              'min-w-0 truncate',
                              step.status === 'done' ? 'text-muted-foreground' : 'text-foreground',
                              step.status === 'skipped' &&
                                'text-muted-foreground/60 line-through',
                            )}
                          >
                            {step.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {state.detailLine && (
                    <p
                      className={cn(
                        'mt-2 text-[12px] leading-snug',
                        state.mode === 'failure'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {state.detailLine}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <Link
                      href={jumpInHref(slug, session)}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Jump in
                      <ArrowUpRight size={12} />
                    </Link>
                    {state.moreCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {state.moreCount} more session{state.moreCount === 1 ? '' : 's'} running
                      </span>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IslandStepIcon({ status }: { status: PlanStep['status'] }) {
  if (status === 'done') return <Check size={12} className="text-foreground" strokeWidth={2.5} />;
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-foreground" />;
  if (status === 'skipped') return <X size={12} className="text-muted-foreground/60" />;
  return <Circle size={8} className="text-muted-foreground/40" />;
}
