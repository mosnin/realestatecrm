"use client";

/**
 * FooterReveal — scroll-driven footer reveal (pixel-perfect technique, made
 * generic; the registry drop was a fixed demo scaffold).
 *
 * The footer sits pinned at the viewport bottom (`sticky bottom-0 z-0`) while
 * the page content — stacked above it with `z-10` and an opaque background —
 * slides up to uncover it on the final stretch of scroll. Pure CSS sticky:
 * no JS, no scroll listeners, inherently respects reduced motion (it's scroll
 * position, not animation).
 *
 * The content wrapper MUST be opaque (pass the page background via
 * `contentClassName`), otherwise the pinned footer shows through mid-page.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FooterReveal({
  children,
  footer,
  className,
  contentClassName,
}: {
  /** The page content that slides up to uncover the footer. */
  children: ReactNode;
  /** The footer that stays pinned and gets revealed. */
  footer: ReactNode;
  /**
   * Classes for the outer wrapper. When this sits inside a flex column that
   * previously stretched the content (e.g. a `flex-1` main), pass the flex
   * classes through here AND via contentClassName — otherwise short pages
   * lose the "footer pinned to viewport bottom" behavior.
   */
  className?: string;
  /** Must include an opaque background matching the page shell. */
  contentClassName?: string;
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <div className={cn("relative z-10", contentClassName)}>{children}</div>
      <div className="sticky bottom-0 z-0">{footer}</div>
    </div>
  );
}

export default FooterReveal;
