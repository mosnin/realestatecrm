/**
 * Hardcoded calendar events for the backend-free demo.
 *
 * The real surface fetches a 30-day window from Google/Outlook via
 * /api/calendar/events. Here we synthesize an equivalent payload in memory —
 * no network, no auth. Events are anchored to the CURRENT local week (computed
 * at module load) so they always land visibly in the default Month/Week/Day
 * cursor, which initializes to today. Each event matches the real
 * CalendarEventOut shape exactly.
 */

import { startOfWeek, addDays } from '@/lib/calendar/date';

export interface DemoCalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
  attendees: { email: string; name: string | null; responseStatus: string | null }[];
  __justCreated?: boolean;
}

/** ISO timestamp for a given day-of-week offset + wall-clock time, this week. */
function at(dayOffset: number, hour: number, minute = 0): string {
  const base = startOfWeek(new Date()); // Sunday of the current week
  const d = addDays(base, dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function allDayAt(dayOffset: number): string {
  const base = startOfWeek(new Date());
  const d = addDays(base, dayOffset);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/* Day offsets are Sunday=0 .. Saturday=6, matching weekDays()/monthGridDays(). */
export const DEMO_EVENTS: DemoCalendarEvent[] = [
  {
    id: 'demo-tour-pine',
    title: 'Tour @ 1420 Pine St',
    description: 'Buyer tour. Three-bed craftsman, recently updated kitchen.',
    start: at(1, 10, 0), // Monday 10:00a
    end: at(1, 11, 0),
    allDay: false,
    htmlLink: '#',
    attendees: [
      { email: 'sarah.chen@example.com', name: 'Sarah Chen', responseStatus: 'accepted' },
    ],
  },
  {
    id: 'demo-callback-morning',
    title: 'Follow-up call-back',
    description: 'Finish the Maple Ave offer paperwork.',
    start: at(1, 14, 30), // Monday 2:30p
    end: at(1, 15, 0),
    allDay: false,
    htmlLink: null,
    attendees: [],
  },
  {
    id: 'demo-showing-priya',
    title: 'Showing with Priya Patel',
    description: 'Listing walkthrough at 88 Birch Court.',
    start: at(2, 9, 30), // Tuesday 9:30a
    end: at(2, 10, 30),
    allDay: false,
    htmlLink: '#',
    attendees: [
      { email: 'priya.patel@example.com', name: 'Priya Patel', responseStatus: 'accepted' },
    ],
  },
  {
    id: 'demo-consult-marcus',
    title: 'Buyer consult: Marcus Webb',
    description: 'First-time buyer intro. Budget review and area shortlist.',
    start: at(3, 13, 0), // Wednesday 1:00p
    end: at(3, 14, 0),
    allDay: false,
    htmlLink: '#',
    attendees: [
      { email: 'marcus.webb@example.com', name: 'Marcus Webb', responseStatus: 'needsAction' },
    ],
  },
  {
    id: 'demo-callback-afternoon',
    title: 'Follow-up call-back',
    description: 'Check inspection scheduling for the Pine St buyers.',
    start: at(4, 11, 0), // Thursday 11:00a
    end: at(4, 11, 30),
    allDay: false,
    htmlLink: null,
    attendees: [],
  },
  {
    id: 'demo-tour-sarah-second',
    title: 'Second tour @ 1420 Pine St',
    description: 'Sarah Chen revisit before drafting an offer.',
    start: at(5, 16, 0), // Friday 4:00p
    end: at(5, 17, 0),
    allDay: false,
    htmlLink: '#',
    attendees: [
      { email: 'sarah.chen@example.com', name: 'Sarah Chen', responseStatus: 'accepted' },
      { email: 'devon.lee@example.com', name: 'Devon Lee', responseStatus: 'tentative' },
    ],
  },
  {
    id: 'demo-openhouse',
    title: 'Open house: 1420 Pine St',
    description: 'Host open house, 12-3pm. Sign-in sheet ready.',
    start: allDayAt(6), // Saturday, all day
    end: allDayAt(6),
    allDay: true,
    htmlLink: '#',
    attendees: [],
  },
];
