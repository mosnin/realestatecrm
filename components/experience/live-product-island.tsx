"use client";

/**
 * LiveProductIsland — a marketing showpiece built on cult-ui's DynamicIsland.
 *
 * A self-contained, display-only island that cycles through the things Chippi
 * does in the background — reads a lead, drafts a reply, books a tour, moves a
 * deal — morphing its shape between each beat. It exists to make the hero feel
 * ALIVE: the product is working while you read the headline.
 *
 * Design notes:
 *   - Purely presentational; no props, no data, safe to drop anywhere (it takes
 *     nothing across the server→client boundary — mount it in a client section).
 *   - Respects `prefers-reduced-motion`: it renders a single static beat and
 *     never cycles, so it won't spin for motion-sensitive visitors.
 *   - Renders its OWN AnimatePresence keyed by step index rather than leaning on
 *     the primitive's size-diff opacity logic, so each beat's content is always
 *     fully visible (that internal logic is the island's classic footgun).
 *   - The island is `bg-black` by design (from the primitive) — it's tuned for
 *     the dark cinematic hero.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Mail, CalendarCheck, Sparkles, TrendingUp } from "lucide-react";
import {
  DynamicIsland,
  DynamicIslandProvider,
  useDynamicIslandSize,
  type SizePresets,
} from "@/components/ui/dynamic-island";

interface Beat {
  size: SizePresets;
  icon: React.ReactNode;
  title: string;
  detail: string;
}

const BEATS: Beat[] = [
  {
    size: "long",
    icon: <Mail className="h-4 w-4 text-white/80" />,
    title: "New lead read",
    detail: "Sarah • 3BR in Oak Hill",
  },
  {
    size: "long",
    icon: <Sparkles className="h-4 w-4 text-white/80" />,
    title: "Reply sent, in your voice",
    detail: "Seconds after the lead",
  },
  {
    size: "long",
    icon: <CalendarCheck className="h-4 w-4 text-white/80" />,
    title: "Tour booked",
    detail: "Saturday, 2:00 PM",
  },
  {
    size: "long",
    icon: <TrendingUp className="h-4 w-4 text-white/80" />,
    title: "Deal advanced",
    detail: "Under contract",
  },
];

const BEAT_MS = 2600;

function IslandCycle() {
  const { setSize } = useDynamicIslandSize();
  const [index, setIndex] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % BEATS.length);
    }, BEAT_MS);
    return () => clearInterval(id);
  }, [reduce]);

  const beat = BEATS[index];

  // Keep the island shape in sync with the active beat.
  useEffect(() => {
    setSize(beat.size);
  }, [beat.size, setSize]);

  return (
    <DynamicIsland id="chippi-live-island">
      <div className="flex h-full w-full items-center px-4">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: [0.42, 0, 0.58, 1] }}
            className="flex w-full items-center gap-3"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
              {beat.icon}
            </span>
            <span className="flex min-w-0 flex-col text-left leading-tight">
              <span className="truncate text-[13px] font-medium text-white">
                {beat.title}
              </span>
              <span className="truncate text-[11px] text-white/50">
                {beat.detail}
              </span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </DynamicIsland>
  );
}

export function LiveProductIsland() {
  return (
    <DynamicIslandProvider initialSize="long">
      <IslandCycle />
    </DynamicIslandProvider>
  );
}

export default LiveProductIsland;
