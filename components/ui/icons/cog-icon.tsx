"use client";

import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

import { cn } from "@/lib/utils";

export interface CogIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface CogIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
  /** Auto-rotate forever on mount. Use when the icon is a status indicator. */
  autoPlay?: boolean;
}

// Continuous-rotation variant for status-indicator usage. Slow, deliberate —
// "the agent is working" not "loading spinner."
const SPIN_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: 360,
    transition: {
      repeat: Number.POSITIVE_INFINITY,
      duration: 4,
      ease: "linear",
    },
  },
};

// Hover variant — the original behaviour: a single spring rotation to 180.
const HOVER_VARIANTS: Variants = {
  normal: { rotate: 0 },
  animate: { rotate: 180 },
};

const CogIcon = forwardRef<CogIconHandle, CogIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, autoPlay, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;
      return {
        startAnimation: () => controls.start("animate"),
        stopAnimation: () => controls.start("normal"),
      };
    });

    useEffect(() => {
      if (autoPlay) {
        controls.start("animate");
      }
    }, [autoPlay, controls]);

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e);
        } else if (!autoPlay) {
          controls.start("animate");
        }
      },
      [autoPlay, controls, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e);
        } else if (!autoPlay) {
          controls.start("normal");
        }
      },
      [autoPlay, controls, onMouseLeave]
    );

    const variants = autoPlay ? SPIN_VARIANTS : HOVER_VARIANTS;
    const transition = autoPlay
      ? undefined
      : { type: "spring" as const, stiffness: 50, damping: 10 };

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <motion.svg
          animate={controls}
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          transition={transition}
          variants={variants}
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
          <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          <path d="M12 2v2" />
          <path d="M12 22v-2" />
          <path d="m17 20.66-1-1.73" />
          <path d="M11 10.27 7 3.34" />
          <path d="m20.66 17-1.73-1" />
          <path d="m3.34 7 1.73 1" />
          <path d="M14 12h8" />
          <path d="M2 12h2" />
          <path d="m20.66 7-1.73 1" />
          <path d="m3.34 17 1.73-1" />
          <path d="m17 3.34-1 1.73" />
          <path d="m11 13.73-4 6.93" />
        </motion.svg>
      </div>
    );
  }
);

CogIcon.displayName = "CogIcon";

export { CogIcon };
