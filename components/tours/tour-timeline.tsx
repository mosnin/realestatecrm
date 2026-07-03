'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  Briefcase,
  ChevronDown,
  AlertTriangle,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion';

interface TimelineEvent {
  label: string;
  icon: typeof Clock;
  color: string;
  time?: string;
  active: boolean;
  completed: boolean;
}

interface TourTimelineProps {
  status: string;
  createdAt?: string;
  startsAt: string;
  googleEventId: string | null;
  sourceDealId: string | null;
  feedbackRating?: number | null;
}

export function TourTimeline({ status, createdAt, startsAt, googleEventId, sourceDealId, feedbackRating }: TourTimelineProps) {
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const events: TimelineEvent[] = [];

  // 1. Booked
  events.push({
    label: 'Booked',
    icon: CalendarDays,
    color: 'text-muted-foreground',
    time: createdAt ? new Date(createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : undefined,
    active: status === 'scheduled',
    completed: status !== 'scheduled',
  });

  // 2. Confirmed
  if (status !== 'cancelled') {
    events.push({
      label: 'Confirmed',
      icon: UserCheck,
      color: 'text-muted-foreground',
      active: status === 'confirmed',
      completed: ['completed', 'no_show'].includes(status),
    });
  }

  // 3. Status-dependent final events
  if (status === 'completed') {
    events.push({
      label: 'Completed',
      icon: CheckCircle2,
      color: 'text-muted-foreground',
      time: new Date(startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      active: !sourceDealId && feedbackRating == null,
      completed: true,
    });
    if (feedbackRating != null) {
      events.push({
        label: `Feedback (${feedbackRating}/5)`,
        icon: Star,
        color: 'text-muted-foreground',
        active: false,
        completed: true,
      });
    }
    if (sourceDealId) {
      events.push({
        label: 'Deal created',
        icon: Briefcase,
        color: 'text-muted-foreground',
        active: false,
        completed: true,
      });
    }
  } else if (status === 'cancelled') {
    events.push({
      label: 'Cancelled',
      icon: XCircle,
      color: 'text-muted-foreground',
      active: true,
      completed: false,
    });
  } else if (status === 'no_show') {
    events.push({
      label: 'No show',
      icon: AlertTriangle,
      color: 'text-muted-foreground',
      active: true,
      completed: false,
    });
  } else {
    // Upcoming milestones for scheduled/confirmed
    events.push({
      label: 'Tour day',
      icon: Clock,
      color: 'text-muted-foreground',
      time: new Date(startsAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      active: false,
      completed: false,
    });
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {/* Mini dots preview — the active step pulses gently so the eye is
         *  drawn to where the tour is *right now* in its lifecycle. */}
        <div className="flex items-center gap-0.5">
          {events.map((e, i) => (
            <motion.span
              key={i}
              animate={
                reduced || !e.active
                  ? undefined
                  : { opacity: [1, 0.45, 1] }
              }
              transition={
                reduced || !e.active
                  ? undefined
                  : { duration: 1.8, ease: 'easeInOut', repeat: Infinity }
              }
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                e.completed ? 'bg-foreground' : e.active ? 'bg-foreground/50' : 'bg-muted-foreground/30'
              )}
            />
          ))}
        </div>
        <span className="ml-1">{events.length} steps</span>
        <motion.span
          animate={reduced ? undefined : { rotate: expanded ? 180 : 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
          className="flex"
        >
          <ChevronDown size={10} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_APPLE }}
          className="overflow-hidden"
        >
        <div className="mt-2 pl-1 space-y-0">
          {events.map((event, i) => {
            const Icon = event.icon;
            const isLast = i === events.length - 1;
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                    event.completed ? 'bg-foreground/10' :
                    event.active ? 'bg-foreground/[0.06]' : 'bg-muted'
                  )}>
                    <Icon size={10} className={cn(event.completed ? 'text-foreground' : event.active ? 'text-foreground' : 'text-muted-foreground/50')} />
                  </div>
                  {!isLast && (
                    <div className={cn('w-px h-3', event.completed ? 'bg-foreground/20' : 'bg-border')} />
                  )}
                </div>
                <div className="flex items-center gap-2 -mt-0.5 pb-1">
                  <span className={cn(
                    'text-[11px] font-medium',
                    event.completed ? 'text-foreground' : event.active ? 'text-foreground' : 'text-muted-foreground/50'
                  )}>
                    {event.label}
                  </span>
                  {event.time && (
                    <span className="text-[10px] text-muted-foreground">{event.time}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
