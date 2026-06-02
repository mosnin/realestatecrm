"use client";

/**
 * Opening moment. On every app/PWA open, Chippi greets the realtor by name
 * (a different line each time so it never feels canned), reveals a snapshot of
 * what changed while they were away, then dissolves into the dashboard.
 *
 * One fluid take: greeting blurs in → swaps up to the "what's new" snapshot →
 * the whole overlay scales + blurs out, revealing the workspace beneath it
 * (the sidebar/dashboard are already rendered behind this fixed layer).
 *
 * Theme-driven (bg-background / text-foreground), so it matches whatever the
 * realtor's Chippi is set to. Honors prefers-reduced-motion (plain fades, no
 * blur/translate). A safety timeout guarantees it can never trap the app.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";

export interface ChippiSnapshot {
  newLeads: number;
  followUpsDue: number;
  draftsReady: number;
}

// Apple-ish ease-out (expo-like): fast start, long gentle settle.
const EASE = [0.22, 1, 0.36, 1] as const;

// Timeline (ms). Greet → reveal what's new → dissolve. Tune here.
const T_TO_SNAPSHOT = 1700;
const T_TO_GONE = 4000;
const T_SAFETY = 7000;

/** A different greeting each open so it never reads like a template. */
function pickGreeting(name: string): string {
  const n = name.trim();
  const hour = new Date().getHours();
  const tod = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const pool = n
    ? [
        `Welcome back, ${n}.`,
        `Good ${tod}, ${n}.`,
        `Hey, ${n}.`,
        `Good to see you, ${n}.`,
        `${n}, let's get into it.`,
        `Back at it, ${n}.`,
        `Ready when you are, ${n}.`,
      ]
    : [
        "Welcome back.",
        `Good ${tod}.`,
        "Good to see you.",
        "Let's get into it.",
        "Ready when you are.",
      ];
  return pool[Math.floor(Math.random() * pool.length)];
}

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
  firstName,
  snapshot,
}: {
  firstName: string;
  snapshot: ChippiSnapshot;
}) {
  const [stage, setStage] = useState<"greeting" | "snapshot" | "gone">("greeting");
  const reduce = useReducedMotion();
  const greeting = useMemo(() => pickGreeting(firstName), [firstName]);
  const items = useMemo(() => buildItems(snapshot), [snapshot]);

  useEffect(() => {
    const a = setTimeout(() => setStage("snapshot"), T_TO_SNAPSHOT);
    const b = setTimeout(() => setStage("gone"), T_TO_GONE);
    const safety = setTimeout(() => setStage("gone"), T_SAFETY);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(safety);
    };
  }, []);

  // Lock body scroll while the overlay is up.
  useEffect(() => {
    if (stage === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [stage]);

  // Shared blur-rise transition (plain fade under reduced motion).
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
          exit={
            reduce
              ? { opacity: 0 }
              : { opacity: 0, scale: 1.03, filter: "blur(10px)" }
          }
          transition={{ duration: 0.75, ease: EASE }}
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
                className="flex flex-col items-center gap-6 text-center"
                transition={{ duration: 0.7, ease: EASE }}
                {...rise}
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
