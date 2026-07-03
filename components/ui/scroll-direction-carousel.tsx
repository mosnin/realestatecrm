"use client";

/**
 * ScrollDirectionCarousel — an infinite drifting rail whose travel direction
 * follows the user's scroll and whose speed ramps with scroll velocity before
 * easing back to a gentle drift. One GSAP ticker with a scroll-signed boost.
 *
 * Adapted from the pixel-perfect drop, which was a hardcoded rainbow demo that
 * also called e.preventDefault() on wheel — a scroll trap that froze the page
 * wherever the band sat. This version:
 *   - is generic: pass `children` (each child is one card; the set is
 *     duplicated internally for the seamless loop),
 *   - listens passively (the page always scrolls; the rail just reacts),
 *   - respects prefers-reduced-motion (renders a static, scrollable row).
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Children } from "react";
import { useGSAP } from "@gsap/react";
import { useReducedMotion } from "framer-motion";
import gsap from "gsap";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

const IDLE = 1; // timeScale magnitude at rest

export function ScrollDirectionCarousel({
  children,
  speed = 60,
  className,
}: {
  children: ReactNode;
  /** Drift speed in px/second at idle. */
  speed?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const count = Children.count(children);

  useGSAP(
    () => {
      if (reduce) return;
      const track = trackRef.current;
      if (!track || track.children.length === 0) return;

      const firstCard = track.children[0] as HTMLElement;
      const cardWidth =
        firstCard.offsetWidth +
        parseFloat(getComputedStyle(firstCard).marginRight);
      const loopWidth = cardWidth * count;
      if (loopWidth <= 0) return;

      const wrapX = gsap.utils.wrap(-loopWidth, 0);
      const setX = gsap.quickSetter(track, "x", "px");
      let x = 0;
      let direction = 1;
      let boost = 0;

      const tick = (_time: number, deltaTime: number) => {
        boost *= 0.92;
        if (boost < 0.001) boost = 0;
        x -= direction * (IDLE + boost) * speed * (deltaTime / 1000);
        setX(wrapX(x));
      };
      gsap.ticker.add(tick);

      // Passive on the window: the page scrolls normally; the rail follows.
      const onWheel = (e: WheelEvent) => {
        if (e.deltaY !== 0) direction = e.deltaY > 0 ? 1 : -1;
        boost = gsap.utils.clamp(0, 30, boost + Math.abs(e.deltaY) * 0.015);
      };
      window.addEventListener("wheel", onWheel, { passive: true });

      return () => {
        gsap.ticker.remove(tick);
        window.removeEventListener("wheel", onWheel);
      };
    },
    { scope: containerRef, dependencies: [reduce, count, speed] },
  );

  if (reduce) {
    return (
      <div className={cn("w-full overflow-x-auto", className)}>
        <div className="flex w-max">{children}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("w-full select-none overflow-hidden", className)}
      style={{
        maskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <div ref={trackRef} className="flex w-max will-change-transform">
        {children}
        {children}
      </div>
    </div>
  );
}

export default ScrollDirectionCarousel;
