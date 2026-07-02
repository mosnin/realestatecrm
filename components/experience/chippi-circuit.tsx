"use client";

/**
 * ChippiCircuit — the "how Chippi works" wiring diagram.
 *
 * A branded configuration of the componentry circuit-board primitive: lead
 * sources on the left feed the Chippi core, which fans out into the actions it
 * takes — with "You approve" as the terminal node, because trust-before-send
 * is the product's spine. Electricity pulses along the traces, so the system
 * reads as alive without a word of copy.
 *
 * Purely presentational, no data. Two intended homes (keep this list current):
 *   - Marketing homepage, between the AgentCanvas feature section and the
 *     showcases ("see the machine" moment).
 *   - The /chippi product page.
 *
 * The board is tuned for the dark cinematic marketing surfaces (variant="dark");
 * pass variant="light" if it ever lands on a light page.
 */

import {
  Mail,
  MessageSquare,
  PhoneMissed,
  Sparkles,
  PenLine,
  CalendarCheck,
  KanbanSquare,
  BadgeCheck,
} from "lucide-react";
import { CircuitBoard } from "@/components/ui/circuit-board";

const NODES = [
  // Inputs — where business actually arrives from.
  { id: "lead", x: 90, y: 70, label: "New lead", icon: <MessageSquare className="h-4 w-4" />, status: "active" as const },
  { id: "email", x: 90, y: 180, label: "Email", icon: <Mail className="h-4 w-4" />, status: "active" as const },
  { id: "call", x: 90, y: 290, label: "Missed call", icon: <PhoneMissed className="h-4 w-4" />, status: "active" as const },
  // The core.
  { id: "chippi", x: 330, y: 180, label: "Chippi", icon: <Sparkles className="h-5 w-5" />, status: "processing" as const, size: "lg" as const },
  // What it does.
  { id: "draft", x: 560, y: 70, label: "Draft, in your voice", icon: <PenLine className="h-4 w-4" />, status: "active" as const },
  { id: "tour", x: 560, y: 180, label: "Tour booked", icon: <CalendarCheck className="h-4 w-4" />, status: "active" as const },
  { id: "deal", x: 560, y: 290, label: "Deal moved", icon: <KanbanSquare className="h-4 w-4" />, status: "active" as const },
  // The spine: nothing sends without you.
  { id: "you", x: 760, y: 180, label: "You approve", icon: <BadgeCheck className="h-4 w-4" />, status: "active" as const, size: "md" as const },
];

const CONNECTIONS = [
  { from: "lead", to: "chippi", animated: true },
  { from: "email", to: "chippi", animated: true },
  { from: "call", to: "chippi", animated: true },
  { from: "chippi", to: "draft", animated: true },
  { from: "chippi", to: "tour", animated: true },
  { from: "chippi", to: "deal", animated: true },
  { from: "draft", to: "you", animated: true },
  { from: "tour", to: "you", animated: true },
  { from: "deal", to: "you", animated: true },
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
      width={860}
      height={360}
      variant={variant}
      pulseSpeed={2.6}
      className={className}
    />
  );
}

export default ChippiCircuit;
