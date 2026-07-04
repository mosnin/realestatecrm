"use client";

/**
 * ChippiCircuit — the "how Chippi works" wiring diagram.
 *
 * A branded configuration of the componentry circuit-board primitive: lead
 * sources on the left feed the Chippi core, which fans out into the work it
 * finishes on its own — draft sent, tour booked, deal moved. Electricity
 * pulses along the traces, so the system reads as alive without a word of
 * copy.
 *
 * Purely presentational, no data. Intended home (keep this list current):
 *   - The /help Help Center, "How Chippi works" section — the one place the
 *     wiring diagram now lives, with the Chippi mark at its core.
 *
 * The board is tuned for the dark cinematic marketing surfaces (variant="dark");
 * pass variant="light" if it ever lands on a light page.
 */

import {
  Mail,
  MessageSquare,
  PhoneMissed,
  PenLine,
  CalendarCheck,
  KanbanSquare,
} from "lucide-react";
import { CircuitBoard } from "@/components/ui/circuit-board";

/* The core node is the Chippi brand mark itself (not a generic glyph) so the
   diagram reads as "everything flows through Chippi" at a glance. The square
   512×512 favicon is the mark; it keeps its own brand color inside the
   otherwise-monochrome board. */
const ChippiMark = () => (
  // eslint-disable-next-line @next/next/no-img-element
  <img src="/favicon.png" alt="Chippi" width={512} height={512} className="h-7 w-7 rounded-md" />
);

const NODES = [
  // Inputs — where business actually arrives from.
  { id: "lead", x: 90, y: 70, label: "New lead", icon: <MessageSquare className="h-4 w-4" />, status: "active" as const },
  { id: "email", x: 90, y: 180, label: "Email", icon: <Mail className="h-4 w-4" />, status: "active" as const },
  { id: "call", x: 90, y: 290, label: "Missed call", icon: <PhoneMissed className="h-4 w-4" />, status: "active" as const },
  // The core.
  { id: "chippi", x: 330, y: 180, label: "Chippi", icon: <ChippiMark />, status: "processing" as const, size: "lg" as const },
  // What it does — finished work, not proposals.
  { id: "draft", x: 580, y: 70, label: "Reply sent, in your voice", icon: <PenLine className="h-4 w-4" />, status: "active" as const },
  { id: "tour", x: 580, y: 180, label: "Tour booked", icon: <CalendarCheck className="h-4 w-4" />, status: "active" as const },
  { id: "deal", x: 580, y: 290, label: "Deal moved", icon: <KanbanSquare className="h-4 w-4" />, status: "active" as const },
];

const CONNECTIONS = [
  { from: "lead", to: "chippi", animated: true },
  { from: "email", to: "chippi", animated: true },
  { from: "call", to: "chippi", animated: true },
  { from: "chippi", to: "draft", animated: true },
  { from: "chippi", to: "tour", animated: true },
  { from: "chippi", to: "deal", animated: true },
];

export function ChippiCircuit({
  variant = "dark",
  className,
}: {
  variant?: "light" | "dark" | "auto";
  className?: string;
}) {
  return (
    <CircuitBoard
      nodes={NODES}
      connections={CONNECTIONS}
      width={720}
      height={360}
      variant={variant}
      pulseSpeed={2.6}
      className={className}
    />
  );
}

export default ChippiCircuit;
