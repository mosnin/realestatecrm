"use client";

/**
 * ContextPanel — a branded adaptation of cult-ui's SidePanel.
 *
 * A left-anchored rail that stays as a slim strip and expands sideways into a
 * wide contextual surface, animating its own height to fit content. Good for a
 * persistent "context rail" beside a workspace — collapsed it's a button strip;
 * expanded it reveals filters, a mini-agenda, or record detail without a route
 * change or a modal that steals the whole screen.
 *
 * Adaptations over the raw primitive:
 *   - Self-manages open state (uncontrolled by default, or drive it via
 *     `open`/`onOpenChange`), so callers don't wire boolean + toggle by hand.
 *   - Theme-aware surface (`bg-card`, `border`) instead of the registry's
 *     hardcoded `bg-neutral-900`, so it adapts to light/dark.
 *   - A default toggle button; override with `renderButton` for a custom trigger.
 */

import { useState, type ReactNode } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidePanel } from "@/components/ui/side-panel";

interface ContextPanelProps {
  children: ReactNode;
  /** Controlled open state. Omit for uncontrolled (self-managed). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger; receives a toggle fn. Defaults to a chevron button. */
  renderButton?: (toggle: () => void, open: boolean) => ReactNode;
  className?: string;
}

export function ContextPanel({
  children,
  open: controlledOpen,
  onOpenChange,
  renderButton,
  className,
}: ContextPanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;

  const toggle = () => {
    const next = !open;
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <SidePanel
      panelOpen={open}
      handlePanelOpen={toggle}
      className={cn(
        // Theme-aware surface instead of the registry's hardcoded dark tone.
        "border border-l-0 border-border bg-card text-card-foreground",
        className,
      )}
      renderButton={(handleToggle) =>
        renderButton ? (
          renderButton(handleToggle, open)
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={open}
            aria-label={open ? "Collapse panel" : "Expand panel"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open ? (
              <PanelRightClose className="h-5 w-5" />
            ) : (
              <PanelRightOpen className="h-5 w-5" />
            )}
          </button>
        )
      }
    >
      <div className="px-4 pb-4 pt-1">{children}</div>
    </SidePanel>
  );
}

export default ContextPanel;
