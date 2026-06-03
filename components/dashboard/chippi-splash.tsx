"use client";

/**
 * Opening moment. On every app/PWA open, Chippi greets the realtor by name
 * (a different line each time — picked SERVER-side and passed in, so the
 * server and client always render the same text; doing the random pick in the
 * client caused a hydration mismatch), reveals a snapshot of what changed while
 * they were away, signs off with the small Chippi mark, then the whole thing
 * swipes up to reveal the dashboard beneath it.
 *
 * Theme-driven (bg-background / text-foreground + the BrandLogo's own
 * light/dark swap). Honors prefers-reduced-motion. A safety timeout guarantees
 * it can never trap the app.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

import { BrandLogo } from "@/components/brand-logo";
import { peekSwitchFlag } from "@/components/dashboard/account-switch";

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
  const [stage, setStage] = useState<"greeting" | "snapshot" | "gone">("greeting");
  // When the user is switching accounts, the account-switch swipe owns the
  // arrival moment — read the flag at render time (before effects) so we step
  // aside cleanly instead of stacking two overlays.
  const [skip] = useState(() => peekSwitchFlag());
  const reduce = useReducedMotion();
  const items = useMemo(() => buildItems(snapshot), [snapshot]);

  useEffect(() => {
    if (skip) return;
    const a = setTimeout(() => setStage("snapshot"), T_TO_SNAPSHOT);
    const b = setTimeout(() => setStage("gone"), T_TO_GONE);
    const safety = setTimeout(() => setStage("gone"), T_SAFETY);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(safety);
    };
  }, [skip]);

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (skip || stage === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stage, skip]);

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

  // Switching accounts → the swipe handles the moment; render nothing here.
  if (skip) return null;

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
