"use client";

/**
 * QuickCaptureDock — a branded adaptation of cult-ui's MorphSurface.
 *
 * A small pill that lives fixed in a corner and morphs into a compose box for
 * jotting a thought without leaving the current page. The realtor is mid-call,
 * remembers "the Hendersons want a bigger yard," hits the dock, types one line,
 * ⌘-Enter, and it's captured — no navigation, no modal, no lost context.
 *
 * Adaptations over the raw primitive:
 *   - `dockLabel` (a prop we added upstream) brands the dock instead of the
 *     registry's hardcoded "Morph Surface".
 *   - Fixed-position, corner-docked shell with a safe z-index below the app's
 *     command palette / toasts.
 *   - `onCapture(text)` — a plain string callback instead of raw FormData, so
 *     call sites don't parse form fields.
 *
 * This is intentionally presentational + a single callback: persistence is the
 * caller's job (POST to a notes endpoint, optimistic toast, etc.), keeping the
 * dock reusable for notes, feedback, or an agent prompt.
 */

import { PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { MorphSurface } from "@/components/ui/morph-surface";

interface QuickCaptureDockProps {
  /** Called with the trimmed text on submit. Throw to signal failure. */
  onCapture: (text: string) => void | Promise<void>;
  dockLabel?: string;
  triggerLabel?: string;
  placeholder?: string;
  /** Corner to dock into. Defaults to bottom-right. */
  position?: "bottom-right" | "bottom-left";
  onSuccess?: () => void;
  className?: string;
}

export function QuickCaptureDock({
  onCapture,
  dockLabel = "Quick note",
  triggerLabel = "Capture",
  placeholder = "Jot a thought — it'll be saved to this record…",
  position = "bottom-right",
  onSuccess,
  className,
}: QuickCaptureDockProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-5 z-40",
        position === "bottom-right" ? "right-5" : "left-5",
        className,
      )}
    >
      <div className="pointer-events-auto">
        <MorphSurface
          dockLabel={dockLabel}
          triggerLabel={triggerLabel}
          triggerIcon={<PenLine className="h-4 w-4" />}
          placeholder={placeholder}
          collapsedWidth="auto"
          expandedWidth={360}
          expandedHeight={200}
          onSuccess={onSuccess}
          onSubmit={async (data) => {
            const text = String(data.get("message") ?? "").trim();
            if (!text) throw new Error("empty");
            await onCapture(text);
          }}
        />
      </div>
    </div>
  );
}

export default QuickCaptureDock;
