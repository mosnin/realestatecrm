'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  type: string;
  data: Record<string, unknown>;
  ts: number;
}

interface SwarmTimelineProps {
  events: TimelineEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function eventDescription(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'plan_created':
      return `Plan created — ${data.taskCount} agents assigned`;
    case 'agent_started':
      return `${data.name} started`;
    case 'agent_completed':
      return `${data.name} completed`;
    case 'audit_started':
      return 'Synthesizing results...';
    case 'swarm_completed':
      return 'Swarm completed';
    case 'swarm_planning':
      return 'Planning swarm...';
    case 'agent_thinking':
      return `${data.name ?? 'Agent'} thinking...`;
    case 'agent_failed':
      return `${data.name ?? 'Agent'} failed`;
    case 'swarm_failed':
      return 'Swarm failed';
    default:
      return type.replace(/_/g, ' ');
  }
}

// ─── Per-event dot tone ───────────────────────────────────────────────────────
// Monochrome by default; failed states keep the semantic destructive token.

interface EventStyle {
  dotClass: string;
}

function getEventStyle(type: string): EventStyle {
  switch (type) {
    case 'agent_failed':
    case 'swarm_failed':
      return { dotClass: 'bg-destructive' };
    default:
      return { dotClass: 'bg-muted-foreground/40' };
  }
}

// ─── Single event row ─────────────────────────────────────────────────────────

function EventRow({
  event,
  isLast,
}: {
  event: TimelineEvent;
  isLast: boolean;
}) {
  const style = getEventStyle(event.type);
  const description = eventDescription(event.type, event.data);
  const time = relativeTime(event.ts);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex items-start gap-3"
    >
      {/* Left rail: dot + connecting line */}
      <div className="w-7 flex-shrink-0 flex flex-col items-center pt-0.5">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', style.dotClass)} />
        {!isLast && <span className="flex-1 w-px bg-border/40 min-h-[24px] mt-1" />}
      </div>

      {/* Right: description + timestamp */}
      <div className="flex-1 min-w-0 pb-4">
        <p className="text-sm text-foreground leading-snug">{description}</p>
        <p className="text-[11px] tabular-nums text-muted-foreground mt-0.5">{time}</p>
      </div>
    </motion.div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function SwarmTimeline({ events }: SwarmTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever new events arrive
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
        <p className="text-sm text-foreground">quiet — nothing in flight.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Events will appear here as the swarm runs.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-y-auto max-h-[400px] pr-2',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      <AnimatePresence initial={false}>
        {events.map((event, index) => (
          <EventRow
            key={`${event.type}-${event.ts}-${index}`}
            event={event}
            isLast={index === events.length - 1}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
