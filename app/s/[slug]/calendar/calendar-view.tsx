'use client';

/**
 * /s/[slug]/calendar — the realtor's calendar, here.
 *
 * Chippi doesn't own a calendar. The realtor already lives in Google
 * Calendar (or Outlook); this surface mirrors what's there AND lets
 * them add events that write THROUGH to the same calendar.
 *
 * Four views — Month (default), Week, Day, Agenda — backed by the
 * same /api/calendar/events GET. View mode persists per slug in
 * localStorage so the realtor's preferred lens sticks.
 *
 * Three connection states still hold:
 *   1. Not connected → calm prompt, one primary action (connect).
 *   2. Connected, events present → render in the selected view.
 *   3. Connected, no events in window → Month/Week/Day still render
 *      their grids (empty days are useful — tap to add); Agenda shows
 *      the "Quiet stretch" empty state.
 *
 * Manual add: + New event in the header always opens the modal;
 * tapping an empty Day/Week slot pre-fills the date+time; tapping a
 * Month cell opens that day in Day view, where empty slots are the
 * tappable surface. Save → POST /api/calendar/events → optimistic
 * splice into the visible view + toast.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ExternalLink, Calendar as CalendarIcon, Plug, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  BODY,
  SECTION_LABEL,
  PRIMARY_PILL,
  GHOST_PILL,
  META,
  CAPTION,
} from '@/lib/typography';
import {
  addDays,
  addMonths,
  localDayKey,
  monthGridDays,
  parseLocalDayKey,
  startOfLocalDay,
  startOfMonth,
  weekDays,
} from '@/lib/calendar/date';

interface CalendarEventOut {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string | null;
  attendees: { email: string; name: string | null; responseStatus: string | null }[];
}

interface ConnectedPayload {
  connected: true;
  provider: string;
  events: CalendarEventOut[];
}

interface NotConnectedPayload {
  connected: false;
}

type FetchPayload = ConnectedPayload | NotConnectedPayload;

interface CalendarViewProps {
  slug: string;
  initialConnected: boolean;
  initialProvider: string | null;
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
const VIEW_MODES: ViewMode[] = ['month', 'week', 'day', 'agenda'];

function isViewMode(v: string | null): v is ViewMode {
  return v === 'month' || v === 'week' || v === 'day' || v === 'agenda';
}

function viewStorageKey(slug: string) {
  return `chippi:calendar:view:${slug}`;
}

function providerLabel(provider: string | null): string {
  if (provider === 'googlecalendar') return 'Google Calendar';
  if (provider === 'outlook_calendar') return 'Outlook Calendar';
  return 'your calendar';
}

function formatTimeRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return 'All day';
  const fmt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  return `${new Date(start).toLocaleTimeString(undefined, fmt)} — ${new Date(end).toLocaleTimeString(undefined, fmt)}`;
}

function shortEventLabel(ev: CalendarEventOut): string {
  if (ev.allDay) return ev.title;
  const d = new Date(ev.start);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'p' : 'a';
  const hour12 = ((h + 11) % 12) + 1;
  const time = m === 0 ? `${hour12}${ampm}` : `${hour12}:${String(m).padStart(2, '0')}${ampm}`;
  return `${time} ${ev.title}`;
}

function eventsForDayKey(events: CalendarEventOut[], key: string): CalendarEventOut[] {
  return events
    .filter((ev) => localDayKey(new Date(ev.start)) === key)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

const HOUR_START = 6; // 6am
const HOUR_END = 21; // 9pm (inclusive label, exclusive bound for math)
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

export function CalendarView({
  slug,
  initialConnected,
  initialProvider,
}: CalendarViewProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [provider, setProvider] = useState<string | null>(initialProvider);
  const [events, setEvents] = useState<CalendarEventOut[]>([]);
  const [loading, setLoading] = useState(initialConnected);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // View mode — defaults to Month; rehydrate from localStorage post-mount
  // so SSR-and-hydration agree (we can't read localStorage on the server).
  const [view, setView] = useState<ViewMode>('month');
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(viewStorageKey(slug));
      if (isViewMode(stored)) setView(stored);
    } catch {
      // localStorage unavailable (private mode, SSR edge); fall back to default.
    }
  }, [slug]);
  const setViewPersisted = useCallback(
    (next: ViewMode) => {
      setView(next);
      try {
        window.localStorage.setItem(viewStorageKey(slug), next);
      } catch {
        /* noop */
      }
    },
    [slug],
  );

  // The grid's focal date — drives Month/Week/Day cursors. Today on mount.
  const [cursor, setCursor] = useState<Date>(() => startOfLocalDay(new Date()));

  // Add-event modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrefill, setModalPrefill] = useState<{ date: Date; hour?: number } | null>(null);

  const openAddModal = useCallback((date: Date, hour?: number) => {
    setModalPrefill({ date, hour });
    setModalOpen(true);
  }, []);

  // Fetch on connect. Same shape as before.
  useEffect(() => {
    if (!connected) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    fetch(`/api/calendar/events?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = (await res.json()) as FetchPayload;
        if (cancelled) return;
        if (!data.connected) {
          setConnected(false);
          setProvider(null);
          setEvents([]);
          return;
        }
        setProvider(data.provider);
        setEvents(data.events);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMessage(err.message || 'Could not reach your calendar.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, slug]);

  // Splice the created event into local state — optimistic, no refetch.
  const handleEventCreated = useCallback((ev: CalendarEventOut) => {
    setEvents((curr) => [...curr, ev]);
  }, []);

  // For Month/Week cursors that need to step.
  const goPrev = useCallback(() => {
    setCursor((c) => {
      if (view === 'month') return addMonths(c, -1);
      if (view === 'week') return addDays(c, -7);
      if (view === 'day') return addDays(c, -1);
      return c;
    });
  }, [view]);
  const goNext = useCallback(() => {
    setCursor((c) => {
      if (view === 'month') return addMonths(c, 1);
      if (view === 'week') return addDays(c, 7);
      if (view === 'day') return addDays(c, 1);
      return c;
    });
  }, [view]);
  const goToday = useCallback(() => setCursor(startOfLocalDay(new Date())), []);

  const headerLabel = useMemo(() => {
    if (view === 'month') {
      return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const start = weekDays(cursor)[0];
      const end = weekDays(cursor)[6];
      const sameMonth = start.getMonth() === end.getMonth();
      const monthFmt: Intl.DateTimeFormatOptions = { month: 'short' };
      if (sameMonth) {
        return `${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
      }
      return `${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()} – ${end.toLocaleDateString(undefined, monthFmt)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (view === 'day') {
      return cursor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return 'Next 30 days';
  }, [cursor, view]);

  // Width: month/week need more room than the reading column.
  const wide = view === 'month' || view === 'week';

  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          // Bottom padding clears the mobile chat bar (~90px) + the floating
          // bottom nav (~90px) — without it the last week of the month grid
          // disappears behind that chrome. Desktop has neither, so pb-24 is
          // enough above the safe-area inset.
          'w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8',
          wide ? 'max-w-6xl' : 'max-w-3xl',
        )}
      >
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>Calendar.</p>
          <h1 className={H1} style={TITLE_FONT}>
            Your calendar, in here.
          </h1>
          <p className={BODY_MUTED}>
            {connected
              ? `Reading from ${providerLabel(provider)}.`
              : 'Connect your calendar so I can see your day and put tours on it.'}
          </p>
        </header>

        {!connected && <NotConnectedState slug={slug} />}

        {connected && (
          <ToggleRow
            view={view}
            onViewChange={setViewPersisted}
            headerLabel={headerLabel}
            showNav={view !== 'agenda'}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onAdd={() => openAddModal(startOfLocalDay(new Date()))}
          />
        )}

        {connected && loading && (
          <p className={BODY_MUTED}>One moment — pulling your events.</p>
        )}

        {connected && !loading && errorMessage && (
          <Card>
            <CardContent className="p-5 space-y-2">
              <p className={BODY}>I couldn&apos;t reach your calendar just now.</p>
              <p className={BODY_MUTED}>{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {connected && !loading && !errorMessage && (
          <>
            {view === 'month' && (
              <MonthView
                cursor={cursor}
                events={events}
                onCellTap={(day) => {
                  setCursor(day);
                  setViewPersisted('day');
                }}
              />
            )}
            {view === 'week' && (
              <WeekView
                cursor={cursor}
                events={events}
                onSlotTap={(day, hour) => openAddModal(day, hour)}
              />
            )}
            {view === 'day' && (
              <DayView
                cursor={cursor}
                events={events}
                onSlotTap={(hour) => openAddModal(cursor, hour)}
              />
            )}
            {view === 'agenda' && <AgendaView events={events} />}
          </>
        )}

        {connected && (
          <AddEventModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            prefill={modalPrefill}
            slug={slug}
            onCreated={handleEventCreated}
          />
        )}
      </div>
    </div>
  );
}

/* ── Toggle row ─────────────────────────────────────────────────────── */

function ToggleRow({
  view,
  onViewChange,
  headerLabel,
  showNav,
  onPrev,
  onNext,
  onToday,
  onAdd,
}: {
  view: ViewMode;
  onViewChange: (next: ViewMode) => void;
  headerLabel: string;
  showNav: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div
        role="tablist"
        aria-label="Calendar view"
        className="inline-flex items-center rounded-full border border-border/70 p-0.5"
      >
        {VIEW_MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={view === m}
            onClick={() => onViewChange(m)}
            className={cn(
              'px-3 h-7 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors duration-150',
              view === m
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {showNav && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
              aria-label="Previous"
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <span className={cn(BODY, 'min-w-[180px] text-center')}>{headerLabel}</span>
            <button
              type="button"
              onClick={onNext}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150"
              aria-label="Next"
            >
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
            <button type="button" onClick={onToday} className={cn(GHOST_PILL, 'h-7 px-3 text-xs')}>
              Today
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onAdd}
          className={cn(PRIMARY_PILL, 'whitespace-nowrap shrink-0')}
          aria-label="New event"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New event</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>
    </div>
  );
}

/* ── Month view ─────────────────────────────────────────────────────── */

function MonthView({
  cursor,
  events,
  onCellTap,
}: {
  cursor: Date;
  events: CalendarEventOut[];
  onCellTap: (day: Date) => void;
}) {
  const days = useMemo(() => monthGridDays(cursor), [cursor]);
  const monthIndex = startOfMonth(cursor).getMonth();
  const todayKey = localDayKey(new Date());
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventOut[]>();
    for (const ev of events) {
      const k = localDayKey(new Date(ev.start));
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [events]);

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20">
        {weekdayLabels.map((w) => (
          <div key={w} className={cn(SECTION_LABEL, 'px-3 py-2 text-left')}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((day, i) => {
          const key = localDayKey(day);
          const isCurrentMonth = day.getMonth() === monthIndex;
          const isToday = key === todayKey;
          const dayEvents = eventsByDay.get(key) ?? [];
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;
          // Hairline border between cells — top and left borders so the
          // outer frame doesn't double up.
          const borderRules = cn(
            i >= 7 ? 'border-t border-border/60' : '',
            i % 7 !== 0 ? 'border-l border-border/60' : '',
          );
          return (
            <button
              key={key + i}
              type="button"
              onClick={() => onCellTap(day)}
              className={cn(
                'min-h-[96px] text-left p-2 hover:bg-muted/30 transition-colors duration-150 flex flex-col gap-1',
                borderRules,
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center h-6 w-6 rounded-full text-xs tabular-nums',
                  isToday && 'ring-1 ring-foreground/30',
                  isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 min-w-0">
                {visible.map((ev) => (
                  <span
                    key={ev.id}
                    className="text-[11px] truncate rounded bg-muted/40 px-1.5 py-0.5 text-foreground"
                    title={shortEventLabel(ev)}
                  >
                    {shortEventLabel(ev)}
                  </span>
                ))}
                {overflow > 0 && (
                  <span className={cn(CAPTION, 'truncate px-1.5')}>+{overflow} more</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Week view ──────────────────────────────────────────────────────── */

function WeekView({
  cursor,
  events,
  onSlotTap,
}: {
  cursor: Date;
  events: CalendarEventOut[];
  onSlotTap: (day: Date, hour: number) => void;
}) {
  const days = useMemo(() => weekDays(cursor), [cursor]);
  const todayKey = localDayKey(new Date());
  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-muted/20 sticky top-0 z-10">
        <div />
        {days.map((d) => {
          const key = localDayKey(d);
          const isToday = key === todayKey;
          return (
            <div key={key} className="px-2 py-2">
              <p className={cn(SECTION_LABEL)}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</p>
              <p
                className={cn(
                  'text-sm tabular-nums mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full',
                  isToday && 'ring-1 ring-foreground/30',
                )}
              >
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
        {HOURS.map((hour) => (
          <HourRow
            key={hour}
            hour={hour}
            days={days}
            events={events}
            onSlotTap={onSlotTap}
          />
        ))}
      </div>
    </div>
  );
}

function HourRow({
  hour,
  days,
  events,
  onSlotTap,
}: {
  hour: number;
  days: Date[];
  events: CalendarEventOut[];
  onSlotTap: (day: Date, hour: number) => void;
}) {
  return (
    <>
      <div className="border-t border-border/60 px-2 py-1.5 text-right">
        <span className={META}>{formatHourLabel(hour)}</span>
      </div>
      {days.map((d) => {
        const key = localDayKey(d);
        const slotEvents = eventsForDayKey(events, key).filter((ev) => {
          if (ev.allDay) return hour === HOUR_START; // pin all-day to first row
          return new Date(ev.start).getHours() === hour;
        });
        return (
          <button
            key={key + hour}
            type="button"
            onClick={() => onSlotTap(d, hour)}
            className="border-t border-l border-border/60 min-h-[44px] hover:bg-muted/30 transition-colors duration-150 text-left p-1 flex flex-col gap-0.5"
          >
            {slotEvents.map((ev) => (
              <span
                key={ev.id}
                className="text-[11px] truncate rounded bg-muted/40 px-1.5 py-0.5 text-foreground"
                title={ev.title}
                onClick={(e) => e.stopPropagation()}
              >
                {ev.title}
              </span>
            ))}
          </button>
        );
      })}
    </>
  );
}

function formatHourLabel(hour: number): string {
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}${ampm}`;
}

/* ── Day view ───────────────────────────────────────────────────────── */

function DayView({
  cursor,
  events,
  onSlotTap,
}: {
  cursor: Date;
  events: CalendarEventOut[];
  onSlotTap: (hour: number) => void;
}) {
  const key = localDayKey(cursor);
  const dayEvents = eventsForDayKey(events, key);
  const allDayEvents = dayEvents.filter((ev) => ev.allDay);
  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="border-b border-border/60 bg-muted/20 px-3 py-2 space-y-1">
          <p className={SECTION_LABEL}>All day</p>
          {allDayEvents.map((ev) => (
            <EventChip key={ev.id} event={ev} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-[72px_minmax(0,1fr)]">
        {HOURS.map((hour) => {
          const slotEvents = dayEvents.filter(
            (ev) => !ev.allDay && new Date(ev.start).getHours() === hour,
          );
          return (
            <div key={hour} className="contents">
              <div className="border-t border-border/60 px-3 py-2 text-right">
                <span className={META}>{formatHourLabel(hour)}</span>
              </div>
              <button
                type="button"
                onClick={() => onSlotTap(hour)}
                className="border-t border-l border-border/60 min-h-[52px] hover:bg-muted/30 transition-colors duration-150 text-left p-2 flex flex-col gap-1"
              >
                {slotEvents.map((ev) => (
                  <EventChip key={ev.id} event={ev} />
                ))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({ event }: { event: CalendarEventOut }) {
  const body = (
    <span
      className="block text-xs rounded bg-muted/40 px-2 py-1 text-foreground truncate"
      title={event.title}
    >
      <span className="font-medium">{event.title}</span>
      {!event.allDay && (
        <span className={cn(META, 'ml-2')}>
          {formatTimeRange(event.start, event.end, event.allDay)}
        </span>
      )}
    </span>
  );
  if (event.htmlLink) {
    return (
      <a
        href={event.htmlLink}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block"
      >
        {body}
      </a>
    );
  }
  return body;
}

/* ── Agenda view (preserves original list rendering) ────────────────── */

function AgendaView({ events }: { events: CalendarEventOut[] }) {
  // Group by local day so the page reads as a timeline.
  const grouped = new Map<string, CalendarEventOut[]>();
  for (const ev of events) {
    const key = localDayKey(new Date(ev.start));
    const arr = grouped.get(key) ?? [];
    arr.push(ev);
    grouped.set(key, arr);
  }
  const dayKeys = Array.from(grouped.keys()).sort();

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
        <p className={BODY}>Nothing on the books in the next 30 days.</p>
        <p className={`${BODY_MUTED} mt-1`}>Quiet stretch.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {dayKeys.map((dayKey) => (
        <section key={dayKey} className="space-y-3">
          <p className={SECTION_LABEL}>{formatDayHeading(dayKey)}</p>
          <ul className="divide-y divide-border/60 border-y border-border/60">
            {grouped.get(dayKey)!.map((ev) => (
              <li key={ev.id} className="py-4">
                <EventRow event={ev} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatDayHeading(dayKey: string): string {
  const eventDay = parseLocalDayKey(dayKey);
  const todayKey = localDayKey(new Date());
  if (dayKey === todayKey) return 'Today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = localDayKey(tomorrow);
  if (dayKey === tomorrowKey) return 'Tomorrow';
  return eventDay.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function EventRow({ event }: { event: CalendarEventOut }) {
  const others = event.attendees.filter((a) => a.email);
  const attendeeLine =
    others.length === 0
      ? null
      : others.length <= 2
        ? others.map((a) => a.name || a.email).join(', ')
        : `${others.length} people`;

  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <p className={`${BODY} font-medium truncate`}>{event.title}</p>
        <p className={META}>
          {formatTimeRange(event.start, event.end, event.allDay)}
          {attendeeLine && <span> &middot; with {attendeeLine}</span>}
        </p>
      </div>
      {event.htmlLink && (
        <ExternalLink
          size={14}
          strokeWidth={1.75}
          className="mt-0.5 text-muted-foreground shrink-0"
        />
      )}
    </div>
  );

  if (event.htmlLink) {
    return (
      <a
        href={event.htmlLink}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-muted/30 -mx-3 px-3 py-0.5 rounded transition-colors"
      >
        {body}
      </a>
    );
  }
  return body;
}

/* ── Not connected state (preserved) ────────────────────────────────── */

function NotConnectedState({ slug }: { slug: string }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 w-9 h-9 rounded-lg bg-foreground/[0.04] flex items-center justify-center shrink-0">
            <CalendarIcon size={16} strokeWidth={1.75} className="text-muted-foreground" />
          </div>
          <div className="space-y-1.5">
            <p className={BODY}>
              Connect your calendar and I&apos;ll put tours on it, watch for
              conflicts, and pull your day into the brief.
            </p>
            <p className={BODY_MUTED}>
              Google Calendar is the fast path. Outlook works too.
            </p>
          </div>
        </div>
        <div>
          <Link href={`/s/${slug}/integrations`} className={PRIMARY_PILL}>
            <Plug className="h-4 w-4" />
            Connect calendar
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Add event modal ────────────────────────────────────────────────── */

function dateInputValue(d: Date): string {
  return localDayKey(d);
}

function timeInputValue(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function AddEventModal({
  open,
  onClose,
  prefill,
  slug,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  prefill: { date: Date; hour?: number } | null;
  slug: string;
  onCreated: (ev: CalendarEventOut) => void;
}) {
  // Initial values rebuild each time the modal opens so prefill applies.
  const initialDate = useMemo(() => prefill?.date ?? new Date(), [prefill]);
  const initialHour = prefill?.hour ?? 9; // sensible default for new events
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(dateInputValue(initialDate));
  const [endDate, setEndDate] = useState(dateInputValue(initialDate));
  const [startTime, setStartTime] = useState(timeInputValue(initialHour));
  const [endTime, setEndTime] = useState(timeInputValue(initialHour + 1));
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState('');
  const [attendeesStr, setAttendeesStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rehydrate fields when the modal re-opens with a new prefill.
  useEffect(() => {
    if (!open) return;
    const d = prefill?.date ?? new Date();
    const h = prefill?.hour ?? 9;
    setTitle('');
    setStartDate(dateInputValue(d));
    setEndDate(dateInputValue(d));
    setStartTime(timeInputValue(h));
    setEndTime(timeInputValue(h + 1));
    setAllDay(false);
    setDescription('');
    setAttendeesStr('');
    setError(null);
  }, [open, prefill]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError(null);

      const attendees = attendeesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        slug,
        title,
        description: description.trim() || undefined,
        allDay,
        startDate,
        endDate,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
        attendees,
      };

      setSubmitting(true);
      try {
        const res = await fetch('/api/calendar/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data: { event?: CalendarEventOut; error?: string } = await res
          .json()
          .catch(() => ({}));
        if (!res.ok || !data.event) {
          const msg = data.error || `Could not save (${res.status}).`;
          setError(msg);
          toastError(msg);
          return;
        }
        onCreated(data.event);
        toastSuccess('Added to your calendar.');
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error.';
        setError(msg);
        toastError(msg);
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      attendeesStr,
      slug,
      title,
      description,
      allDay,
      startDate,
      endDate,
      startTime,
      endTime,
      onCreated,
      onClose,
    ],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New event</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tour @ 456 Oak"
              autoFocus
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="event-allday"
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="event-allday" className="cursor-pointer">
              All day
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-startdate">Start date</Label>
              <Input
                id="event-startdate"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-enddate">End date</Label>
              <Input
                id="event-enddate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            {!allDay && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="event-starttime">Start time</Label>
                  <Input
                    id="event-starttime"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-endtime">End time</Label>
                  <Input
                    id="event-endtime"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-description">Description</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-attendees">Attendees</Label>
            <Input
              id="event-attendees"
              value={attendeesStr}
              onChange={(e) => setAttendeesStr(e.target.value)}
              placeholder="sam@example.com, jordan@example.com"
            />
            <p className={CAPTION}>Comma-separated emails. Optional.</p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className={GHOST_PILL}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className={PRIMARY_PILL} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
