"use client";

/**
 * First-paint splash: the Chippi wordmark draws itself on, then fades into the
 * dashboard. Plays on every fresh load — i.e. every time the PWA is opened.
 *
 * It's mounted in the dashboard layout, which persists across in-app
 * (soft) navigations, so it draws ONCE per open rather than on every route
 * change. A full reload / launching the installed PWA remounts it → it plays
 * again, which is the intended "open the app, say chippi" moment.
 *
 * No session gate by design (the ask was: every open). A 6s safety timeout
 * guarantees the overlay can never trap the app if the animation callback
 * doesn't fire.
 */

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

import { ChippiHelloEffect } from "@/components/ui/chippi-hello-effect";

export function ChippiSplash() {
  const [show, setShow] = useState(true);

  // Lock body scroll while the splash covers the screen.
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  // Safety net: never leave the overlay up if the draw callback misfires.
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 6000);
    return () => clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="chippi-splash"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          aria-hidden
        >
          <ChippiHelloEffect
            className="h-16 w-auto px-8 text-foreground sm:h-24"
            onAnimationComplete={() => {
              // Hold the finished wordmark for a beat, then fade out.
              setTimeout(() => setShow(false), 550);
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
