"use client";

/**
 * Opening moment. When the realtor OPENS the app, Chippi greets them by name
 * (a different line each time — picked SERVER-side and passed in, so the
 * server and client always render the same text; doing the random pick in the
 * client caused a hydration mismatch), reveals a snapshot of what changed while
 * they were away, signs off with the small Chippi mark, then the whole thing
 * swipes up to reveal the dashboard beneath it.
 *
 * It plays on every real "open", not just the very first mount — which is the
 * bug that made it feel gone on an installed PWA. An installed PWA usually
 * RESUMES (the page stays alive in memory) instead of reloading, so a
 * mount-only splash only ever played on the very first cold launch. This
 * version triggers on the browser's open/resume lifecycle:
 *   - initial load / hard refresh / cold PWA launch  → the server paints the
 *     greeting and the client runs the timeline;
 *   - bfcache restore (back/forward, some PWA resumes) → `pageshow.persisted`;
 *   - the app is brought back to the foreground after being away a while
 *     (re-opening the PWA for the day) → `visibilitychange`.
 * In-app navigation does NOT replay it (the dashboard layout persists, so the
 * component never remounts and nothing re-fires).
 *
 * Theme-driven (bg-background / text-foreground + the BrandLogo's own
 * light/dark swap). Honors prefers-reduced-motion. A safety timeout guarantees
 * it can never trap the app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

import { BrandLogo } from "@/components/brand-logo";

export interface ChippiSnapshot {
  newLeads: number;
  followUpsDue: number;
  draftsReady: number;
}

// Apple-ish ease-out (expo-like): fast start, long gentle settle.
const EASE = [0.22, 1, 0.36, 1] as const;

// Timeline (ms). Greet → reveal what's new + mark → swipe up.
const T_TO_SNAPSHOT = 1700;
const T_TO_GONE = 4100;
const T_SAFETY = 7000;

// Coming back to the app after this long away counts as a fresh "open" and
// replays the splash (the "open the PWA for the day → here's your brief"
// moment). Short tab-switches stay under it, so it never nags mid-task.
const REOPEN_AFTER_MS = 30 * 60 * 1000;
const LAST_PLAYED_KEY = "chippi:splash:lastPlayed";

function buildItems(s: ChippiSnapshot): { n: number; label: string }[] {
  const out: { n: number; label: string }[] = [];
  if (s.newLeads > 0)
    out.push({ n: s.newLeads, label: s.newLeads === 1 ? "new lead" : "new leads" });
  if (s.followUpsDue > 0)
    out.push({
      n: s.followUpsDue,
      label: s.followUpsDue === 1 ? "follow-up due" : "follow-ups due",
    });
  if (s.draftsReady > 0)
    out.push({
      n: s.draftsReady,
      label: s.draftsReady === 1 ? "draft ready" : "drafts ready",
    });
  return out;
}

export function ChippiSplash({
  greeting,
  snapshot,
}: {
  /** Pre-chosen greeting line (computed server-side so it can't mismatch). */
  greeting: string;
  snapshot: ChippiSnapshot;
}) {
  // Start on the greeting so the server paints it immediately on every full
  // load (no blank flash before hydration). The client then runs the timeline.
  const [stage, setStage] = useState<"greeting" | "snapshot" | "gone">("greeting");
  const reduce = useReducedMotion();
  const items = useMemo(() => buildItems(snapshot), [snapshot]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  // Run greeting → snapshot → swipe up, and stamp when it last played.
  const runTimeline = useCallback(() => {
    clearTimers();
    timers.current.push(setTimeout(() => setStage("snapshot"), T_TO_SNAPSHOT));
    timers.current.push(setTimeout(() => setStage("gone"), T_TO_GONE));
    timers.current.push(setTimeout(() => setStage("gone"), T_SAFETY));
    try {
      sessionStorage.setItem(LAST_PLAYED_KEY, String(Date.now()));
    } catch {
      /* sessionStorage can be unavailable; the splash still plays. */
    }
  }, [clearTimers]);

  // Restart the whole splash (used when the app is re-opened / resumed).
  const replay = useCallback(() => {
    setStage("greeting");
    runTimeline();
  }, [runTimeline]);

  useEffect(() => {
    // Initial open: the greeting is already on screen (SSR) — run the timeline.
    runTimeline();

    // Restored from bfcache (back/forward, some PWA resumes) → a real re-open.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) replay();
    };
    // App brought back to the foreground after being away → re-open for the day.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(LAST_PLAYED_KEY)) || 0;
      } catch {
        /* ignore */
      }
      if (Date.now() - last >= REOPEN_AFTER_MS) replay();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimers();
    };
  }, [runTimeline, replay, clearTimers]);

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (stage === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stage]);

  // Shared blur-rise (plain fade under reduced motion).
  const rise = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 18, filter: "blur(12px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -18, filter: "blur(12px)" },
      };

  const list: Variants = {
    show: { transition: { staggerChildren: 0.09, delayChildren: 0.06 } },
  };
  const line: Variants = reduce
    ? { hidden: { opacity: 0 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 14, filter: "blur(8px)" },
        show: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: 0.6, ease: EASE },
        },
      };

  return (
    <AnimatePresence>
      {stage !== "gone" && (
        <motion.div
          key="chippi-splash"
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-6 text-foreground"
          initial={{ opacity: 1 }}
          // Swipe the whole overlay up to reveal the dashboard beneath it.
          exit={reduce ? { opacity: 0 } : { y: "-100%" }}
          transition={{ duration: 0.8, ease: EASE }}
          aria-hidden
        >
          <AnimatePresence mode="wait">
            {stage === "greeting" ? (
              <motion.h1
                key="greeting"
                className="text-center text-3xl tracking-tight sm:text-5xl"
                style={{ fontFamily: "var(--font-title)" }}
                transition={{ duration: 0.8, ease: EASE }}
                {...rise}
              >
                {greeting}
              </motion.h1>
            ) : (
              <motion.div
                key="snapshot"
                className="flex flex-col items-center gap-7 text-center"
                transition={{ duration: 0.7, ease: EASE }}
                {...rise}
              >
                <div className="flex flex-col items-center gap-6">
                  {items.length > 0 ? (
                    <>
                      <motion.p
                        className="text-[12px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
                        initial={rise.initial}
                        animate={rise.animate}
                        transition={{ duration: 0.6, ease: EASE }}
                      >
                        While you were away
                      </motion.p>
                      <motion.ul
                        className="flex flex-col items-center gap-3"
                        variants={list}
                        initial="hidden"
                        animate="show"
                      >
                        {items.map((it, i) => (
                          <motion.li
                            key={i}
                            variants={line}
                            className="text-2xl sm:text-3xl"
                            style={{ fontFamily: "var(--font-title)" }}
                          >
                            <span className="tabular-nums">{it.n}</span>{" "}
                            <span className="text-muted-foreground">{it.label}</span>
                          </motion.li>
                        ))}
                      </motion.ul>
                    </>
                  ) : (
                    <motion.p
                      className="text-2xl sm:text-3xl"
                      style={{ fontFamily: "var(--font-title)" }}
                      initial={rise.initial}
                      animate={rise.animate}
                      transition={{ duration: 0.7, ease: EASE }}
                    >
                      You&apos;re all caught up.
                    </motion.p>
                  )}
                </div>

                {/* Small Chippi mark — the sign-off the overlay swipes up with. */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.55 }}
                >
                  <BrandLogo className="h-5 opacity-80" alt="Chippi" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
