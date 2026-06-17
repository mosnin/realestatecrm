"use client";

/**
 * Opening moment. On every app/PWA open, the original Chippi preloader plays:
 * the Chippi wordmark DRAWS ITSELF ON (the Apple "hello" effect, restored from
 * the first splash), then Chippi greets the realtor by name (a different line
 * each time — picked SERVER-side and passed in, so server and client render the
 * same text; doing the random pick in the client caused a hydration mismatch),
 * reveals a snapshot of what changed while they were away, signs off with the
 * small Chippi mark, then the whole thing swipes up to reveal the dashboard.
 *
 * Sequence: logo draw-on → greeting → what's-new snapshot → swipe up.
 *
 * Theme-driven (bg-background / text-foreground + the BrandLogo's own
 * light/dark swap; the draw-on renders in currentColor). Honors
 * prefers-reduced-motion (skips the draw-on, plain fades). A safety timeout
 * guarantees it can never trap the app.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

import { BrandLogo } from "@/components/brand-logo";
import { ChippiHelloEffect } from "@/components/ui/chippi-hello-effect";

// One-shot, per-page-load gate. Module state lives for the lifetime of the JS
// bundle: it survives client-side navigation (so switching between the realtor
// and broker dashboards does NOT replay the heavy splash) but resets on a full
// page reload (so a first open or hard refresh plays it again). The lighter
// Chippi-logo account-switch swipe is a separate component and is unaffected.
let splashPlayed = false;

export interface ChippiSnapshot {
  newLeads: number;
  followUpsDue: number;
  draftsReady: number;
}

type Stage = "logo" | "greeting" | "snapshot" | "gone";

// Apple-ish ease-out (expo-like): fast start, long gentle settle.
const EASE = [0.22, 1, 0.36, 1] as const;

// Timeline (ms).
// Logo draws on (~1.2s) → hold a beat → greet → reveal what's new → swipe up.
const T_LOGO_HOLD = 650; // hold the finished wordmark before the greeting
const T_TO_SNAPSHOT = 1700; // greeting visible, then reveal the snapshot
const T_TO_GONE = 4100; // from greeting start to swipe-up
const T_SAFETY = 9000; // absolute backstop so the overlay can never trap the app

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
  // Decide ONCE, on first render, whether this mount should play the splash.
  // Skip it ONLY when it has already played this page load (client-side
  // navigation, e.g. switching dashboards). It plays on every fresh open / PWA
  // launch / hard refresh. Deliberately NOT gated on the account-switch flag:
  // that flag lives in sessionStorage, which survives reloads within a tab, so
  // a stale flag from an earlier switch used to stick on and wrongly suppress
  // the splash on later opens — the regression this restore fixes.
  const [shouldPlay] = useState(() => !splashPlayed);
  const reduce = useReducedMotion();
  // Reduced motion skips the draw-on and opens on the greeting directly.
  const [stage, setStage] = useState<Stage>(
    !shouldPlay ? "gone" : reduce ? "greeting" : "logo"
  );
  const items = useMemo(() => buildItems(snapshot), [snapshot]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!shouldPlay) return;
    // Mark played so later client-side navigations skip the splash. A full page
    // reload resets this module, which is exactly the first-load / hard-refresh
    // behavior we want.
    splashPlayed = true;
    const list = timers.current;
    // Absolute backstop, covering the full logo → overview sequence.
    list.push(setTimeout(() => setStage("gone"), T_SAFETY));
    // With reduced motion there's no draw-on to chain off, so run the overview
    // timeline immediately (the greeting is already on screen).
    if (reduce) {
      list.push(setTimeout(() => setStage("snapshot"), T_TO_SNAPSHOT));
      list.push(setTimeout(() => setStage("gone"), T_TO_GONE));
    }
    return () => {
      list.forEach(clearTimeout);
      timers.current = [];
    };
  }, [shouldPlay, reduce]);

  // The logo finished drawing → hold a beat, then run the day overview:
  // greeting → snapshot → swipe up. (All timers tracked for unmount cleanup.)
  const handleLogoDone = () => {
    timers.current.push(
      setTimeout(() => {
        setStage("greeting");
        timers.current.push(setTimeout(() => setStage("snapshot"), T_TO_SNAPSHOT));
        timers.current.push(setTimeout(() => setStage("gone"), T_TO_GONE));
      }, T_LOGO_HOLD)
    );
  };

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
            {stage === "logo" ? (
              <motion.div
                key="logo"
                className="flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)" }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                {/* The original draw-on: the Chippi wordmark traces itself in. */}
                <ChippiHelloEffect
                  className="h-16 w-auto px-8 sm:h-24"
                  onAnimationComplete={handleLogoDone}
                />
              </motion.div>
            ) : stage === "greeting" ? (
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
