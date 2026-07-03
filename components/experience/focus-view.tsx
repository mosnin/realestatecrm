"use client";

/**
 * FocusView — a branded adaptation of cult-ui's ExpandableScreen for Chippi.
 *
 * A `trigger` (any card, chart, or tile) morphs — via a shared `layoutId` — into
 * a centered, full-screen "focus" surface, then morphs back on close. Use it
 * anywhere a dense element deserves a distraction-free expansion: a KPI card
 * into a full report, a property tile into a gallery, a cramped chart into a
 * readable one.
 *
 * Why a wrapper instead of raw ExpandableScreen:
 *   - Themes the morphing surface to our design system (`bg-card`, border,
 *     ring) instead of the registry's bare defaults, so it reads as ours.
 *   - Collapses the four-part compound API (Root/Trigger/Content/…) into a
 *     single declarative component so call sites stay one JSX block.
 *   - Forces a UNIQUE `layoutId` per instance. Two FocusViews sharing a
 *     layoutId would morph into each other — this is the #1 footgun, so the
 *     prop is required, not optional. See docs/ui/experience-components.md.
 *
 * Accessibility: the trigger is a real button (keyboard-activatable); Escape and
 * the close button both collapse. Body scroll is locked while expanded.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ExpandableScreen,
  ExpandableScreenTrigger,
  ExpandableScreenContent,
} from "@/components/ui/expandable-screen";

interface FocusViewProps {
  /**
   * Stable, page-unique morph id. Reuse the same value for a trigger+content
   * pair; NEVER share it across two different FocusViews on one screen.
   */
  layoutId: string;
  /** The collapsed element users click to expand. */
  trigger: ReactNode;
  /** The full-screen content shown while expanded. */
  children: ReactNode;
  /** Extra classes for the expanded surface (e.g. `max-w-5xl` to cap width). */
  contentClassName?: string;
  /** Extra classes for the collapsed trigger wrapper. */
  triggerClassName?: string;
  onExpandChange?: (expanded: boolean) => void;
}

export function FocusView({
  layoutId,
  trigger,
  children,
  contentClassName,
  triggerClassName,
  onExpandChange,
}: FocusViewProps) {
  return (
    <ExpandableScreen
      layoutId={layoutId}
      onExpandChange={onExpandChange}
      triggerRadius="16px"
      contentRadius="24px"
    >
      <ExpandableScreenTrigger className={triggerClassName}>
        {trigger}
      </ExpandableScreenTrigger>
      <ExpandableScreenContent
        className={cn(
          // Themed morph surface: our card background + a hairline ring, capped
          // to a readable width and centered rather than edge-to-edge.
          "mx-auto max-w-4xl border border-border bg-card text-card-foreground shadow-2xl",
          contentClassName,
        )}
        closeButtonClassName="text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <div className="h-full w-full overflow-y-auto p-6 sm:p-8">{children}</div>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export default FocusView;
