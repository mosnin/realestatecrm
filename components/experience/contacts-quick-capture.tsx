"use client";

/**
 * ContactsQuickCapture — the QuickCaptureDock wired to the People page.
 *
 * A floating dock that lets a realtor jot a thought and have it land as a note
 * without leaving the list or opening a record. Posts to the existing
 * /api/notes endpoint (slug + title), toasts the result, and never blocks the
 * page — failures surface as a toast, not an exception.
 *
 * Kept as a thin, self-contained client component so the (server) People page
 * can mount it with just a slug.
 */

import { toast } from "sonner";
import { QuickCaptureDock } from "@/components/experience/quick-capture-dock";

export function ContactsQuickCapture({ slug }: { slug: string }) {
  return (
    <QuickCaptureDock
      dockLabel="Quick note"
      triggerLabel="Capture"
      placeholder="Jot a thought — saved to your notes…"
      onCapture={async (text) => {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, title: text }),
        });
        if (!res.ok) {
          toast.error("Couldn't save that note. Try again.");
          throw new Error("note save failed");
        }
      }}
      onSuccess={() => toast.success("Note captured")}
    />
  );
}

export default ContactsQuickCapture;
