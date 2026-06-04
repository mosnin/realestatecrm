'use client';

/**
 * /demo-app/calendar — backend-free clone of /s/[slug]/calendar's CalendarView.
 *
 * Pixel-identical to the real surface, but with the data layer torn out:
 *   - No fetch on mount; events come from DEMO_EVENTS (hardcoded, anchored to
 *     the current local week so they always land in the default cursor).
 *   - "New event" optimistically splices a locally-built event into state —
 *     no POST, no /api/calendar/events, no toast-on-network.
 *   - Always connected; no Supabase, no [slug], no integrations route.
 *
 * The markup, motion constants, and view logic are copied verbatim from the
 * real component so the two stay visually in lockstep. If the real view
 * changes, mirror it here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { ChevronLeft, ChevronRight, ExternalLink, Plus, RotateCcw, Search, X } from 'lucide-react';
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
import { toastSuccess } from '@/lib/toast-helpers';
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
import { DEMO_EVENTS } from './demo-data';

/* ── Motion constants ───────────────────────────────────────────────── */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const DUR_QUICK = 0.18;
const DUR_PRESS = 0.18;
const DUR_PULSE = 0.2;
const DUR_RING = 0.24;

const STAGGER_ROW_DELAY = 0.04;
const MONTH_CELL_VARIANTS: Variants = {
  initial: { opacity: 0, y: 4 },
  enter: (row: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: DUR_QUICK, ease: EASE, delay: row * STAGGER_ROW_DELAY },
  }),
};

const CHIP_ENTER_VARIANTS: Variants = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR_QUICK, ease: EASE } },
};

const CHIP_OPTIMISTIC_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: DUR_RING, ease: EASE } },
};

interface CalendarEventOut {
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

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
const VIEW_MODES: ViewMode[] = ['month', 'week', 'day', 'agenda'];

function isViewMode(v: string | null): v is ViewMode {
  return v === 'month' || v === 'week' || v === 'day' || v === 'agenda';
}

const VIEW_STORAGE_KEY = 'chippi:calendar:view:demo';

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

const HOUR_START = 6;
const HOUR_END = 21;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

export function CalendarView() {
  // Demo: always connected, events hardcoded. No fetch, no error/loading flow.
  const [events, setEvents] = useState<CalendarEventOut[]>(DEMO_EVENTS);

  const [view, setView] = useState<ViewMode>('month');

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      const mobile = window.innerWidth < 640;
      if (mobile && (!stored || stored === 'month' || stored === 'week')) {
        setView('day');
        return;
      }
      if (isViewMode(stored)) setView(stored);
    } catch {
      // localStorage unavailable; fall back to default.
    }
  }, []);
  const setViewPersisted = useCallback((next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  const [cursor, setCursor] = useState<Date>(() => startOfLocalDay(new Date()));

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrefill, setModalPrefill] = useState<{ date: Date; hour?: number } | null>(null);

  const openAddModal = useCallback((date: Date, hour?: number) => {
    setModalPrefill({ date, hour });
    setModalOpen(true);
  }, []);

  const handleEventCreated = useCallback((ev: CalendarEventOut) => {
    const stamped: CalendarEventOut = { ...ev, __justCreated: true };
    setEvents((curr) => [...curr, stamped]);
    window.setTimeout(() => {
      setEvents((curr) =>
        curr.map((e) => (e.id === ev.id ? { ...e, __justCreated: false } : e)),
      );
    }, 400);
  }, []);

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
      return cursor.toLocaleDateString(undefined, {
        month: 'long',
        year: isMobile ? undefined : 'numeric',
      });
    }
    if (view === 'week') {
      const start = weekDays(cursor)[0];
      const end = weekDays(cursor)[6];
      const sameMonth = start.getMonth() === end.getMonth();
      const monthFmt: Intl.DateTimeFormatOptions = { month: 'short' };
      if (isMobile) {
        return `Week of ${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()}`;
      }
      if (sameMonth) {
        return `${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
      }
      return `${start.toLocaleDateString(undefined, monthFmt)} ${start.getDate()} – ${end.toLocaleDateString(undefined, monthFmt)} ${end.getDate()}, ${end.getFullYear()}`;
    }
    if (view === 'day') {
      if (isMobile) {
        return cursor.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
      }
      return cursor.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return 'Next 30 days';
  }, [cursor, view, isMobile]);

  const wide = view === 'month' || view === 'week';

  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8',
          wide ? 'max-w-6xl' : 'max-w-3xl',
        )}
      >
        <header className="space-y-1.5">
          <p className={BODY_MUTED}>Calendar.</p>
          <h1 className={H1} style={TITLE_FONT}>
            Your calendar, in here.
          </h1>
          <p className={BODY_MUTED}>Reading from Google Calendar.</p>
        </header>

        <ToggleRow
          view={view}
          onViewChange={setViewPersisted}
          headerLabel={headerLabel}
          showNav={view !== 'agenda'}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onAdd={() => openAddModal(startOfLocalDay(new Date()))}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchInputRef={searchInputRef}
        />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={searchQuery ? `search-${searchQuery}` : view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR_QUICK, ease: EASE }}
          >
            {searchQuery ? (
              <SearchResultsView events={events} query={searchQuery} />
            ) : (
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
          </motion.div>
        </AnimatePresence>

        <AddEventModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          prefill={modalPrefill}
          onCreated={handleEventCreated}
          isMobile={isMobile}
        />
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
  searchQuery,
  onSearchChange,
  searchInputRef,
}: {
  view: ViewMode;
  onViewChange: (next: ViewMode) => void;
  headerLabel: string;
  showNav: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:flex-wrap">
      <div
        role="tablist"
        aria-label="Calendar view"
        className="inline-flex self-start items-center rounded-full border border-border/70 p-0.5"
      >
        {VIEW_MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={view === m}
            onClick={() => onViewChange(m)}
            className={cn(
              'h-7 rounded-full text-[11px] font-medium uppercase tracking-wider transition-colors duration-150',
              'px-2.5 sm:px-3',
              view === m
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto flex-wrap">
        <div className="relative flex-1 min-w-[140px] sm:min-w-[200px] max-w-[260px]">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onSearchChange('');
                searchInputRef.current?.blur();
              }
            }}
            placeholder="Search events"
            aria-label="Search events"
            className="pl-8 pr-8 h-8 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                searchInputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors duration-150 p-0.5"
            >
              <X size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {showNav && (
          <div className="flex items-center gap-1 min-w-0">
            <motion.button
              type="button"
              onClick={onPrev}
              whileTap={{ rotate: -10 }}
              transition={{ duration: DUR_PRESS, ease: EASE }}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 shrink-0"
              aria-label="Previous"
            >
              <ChevronLeft size={16} strokeWidth={1.75} />
            </motion.button>
            <span
              className={cn(
                BODY,
                'text-center truncate min-w-[110px] sm:min-w-[180px]',
              )}
            >
              {headerLabel}
            </span>
            <motion.button
              type="button"
              onClick={onNext}
              whileTap={{ rotate: 10 }}
              transition={{ duration: DUR_PRESS, ease: EASE }}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors duration-150 shrink-0"
              aria-label="Next"
            >
              <ChevronRight size={16} strokeWidth={1.75} />
            </motion.button>
            <button
              type="button"
              onClick={onToday}
              className={cn(
                GHOST_PILL,
                'shrink-0',
                'h-8 w-8 px-0 sm:h-7 sm:w-auto sm:px-3 sm:text-xs',
              )}
              aria-label="Today"
              title="Today"
            >
              <RotateCcw size={14} strokeWidth={1.75} className="sm:hidden" />
              <span className="hidden sm:inline">Today</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onAdd}
          className={cn(
            PRIMARY_PILL,
            'whitespace-nowrap shrink-0 ml-auto sm:ml-0',
            'h-9 w-9 px-0 sm:w-auto sm:px-4',
          )}
          aria-label="New event"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New event</span>
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
  const reduced = useReducedMotion();
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
      <div className="overflow-x-auto sm:overflow-visible">
        <div className="min-w-[630px] sm:min-w-0">
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
              const row = Math.floor(i / 7);
              const dayEvents = eventsByDay.get(key) ?? [];
              const visible = dayEvents.slice(0, 3);
              const overflow = dayEvents.length - visible.length;
              const borderRules = cn(
                i >= 7 ? 'border-t border-border/60' : '',
                i % 7 !== 0 ? 'border-l border-border/60' : '',
              );
              return (
                <motion.button
                  key={key + i}
                  type="button"
                  onClick={() => onCellTap(day)}
                  custom={row}
                  variants={
                    reduced
                      ? {
                          initial: { opacity: 0 },
                          enter: { opacity: 1, transition: { duration: DUR_QUICK } },
                        }
                      : MONTH_CELL_VARIANTS
                  }
                  initial="initial"
                  animate="enter"
                  className={cn(
                    'min-h-[96px] text-left p-2 hover:bg-muted/30 transition-colors duration-150 flex flex-col gap-1',
                    borderRules,
                  )}
                >
                  <span
                    className={cn(
                      'relative inline-flex items-center justify-center h-6 w-6 rounded-full text-xs tabular-nums',
                      isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/50',
                    )}
                  >
                    {isToday && (
                      <motion.span
                        aria-hidden
                        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: DUR_RING, ease: EASE }}
                        className="absolute inset-0 rounded-full ring-1 ring-foreground/30"
                      />
                    )}
                    <span className="relative">{day.getDate()}</span>
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {visible.map((ev) => (
                      <ChipInCell key={ev.id} event={ev} reduced={!!reduced} />
                    ))}
                    {overflow > 0 && (
                      <span className={cn(CAPTION, 'truncate px-1.5')}>+{overflow} more</span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Month/Week chip ────────────────────────────────────────────────── */

function ChipInCell({
  event,
  reduced,
  stopPropagation = false,
  labelMode = 'short',
}: {
  event: CalendarEventOut;
  reduced: boolean;
  stopPropagation?: boolean;
  labelMode?: 'short' | 'title';
}) {
  const variants = event.__justCreated ? CHIP_OPTIMISTIC_VARIANTS : CHIP_ENTER_VARIANTS;
  const label = labelMode === 'short' ? shortEventLabel(event) : event.title;
  return (
    <motion.span
      initial={reduced ? false : 'initial'}
      animate={reduced ? { opacity: 1 } : 'animate'}
      variants={reduced ? undefined : variants}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={reduced ? undefined : { duration: DUR_PRESS, ease: EASE }}
      className="text-[11px] truncate rounded bg-muted/40 px-1.5 py-0.5 text-foreground"
      title={event.title}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
    >
      {label}
    </motion.span>
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
  const reduced = useReducedMotion();
  const days = useMemo(() => weekDays(cursor), [cursor]);
  const todayKey = localDayKey(new Date());
  const [pulseSlot, setPulseSlot] = useState<string | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    },
    [],
  );
  const handleSlotTap = useCallback(
    (d: Date, hour: number) => {
      if (reduced) {
        onSlotTap(d, hour);
        return;
      }
      const k = `${localDayKey(d)}-${hour}`;
      setPulseSlot(k);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setPulseSlot(null), DUR_PULSE * 1000);
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      openTimerRef.current = window.setTimeout(() => onSlotTap(d, hour), 140);
    },
    [onSlotTap, reduced],
  );
  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      <div className="overflow-x-auto sm:overflow-visible">
        <div className="min-w-[694px] sm:min-w-0">
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-muted/20 sticky top-0 z-10">
            <div />
            {days.map((d) => {
              const key = localDayKey(d);
              const isToday = key === todayKey;
              return (
                <div key={key} className="px-2 py-2">
                  <p className={cn(SECTION_LABEL)}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</p>
                  <span
                    className={cn(
                      'relative text-sm tabular-nums mt-0.5 inline-flex items-center justify-center h-6 w-6 rounded-full',
                    )}
                  >
                    {isToday && (
                      <motion.span
                        aria-hidden
                        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: DUR_RING, ease: EASE }}
                        className="absolute inset-0 rounded-full ring-1 ring-foreground/30"
                      />
                    )}
                    <span className="relative">{d.getDate()}</span>
                  </span>
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
                onSlotTap={handleSlotTap}
                pulseSlot={pulseSlot}
                reduced={!!reduced}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HourRow({
  hour,
  days,
  events,
  onSlotTap,
  pulseSlot,
  reduced,
}: {
  hour: number;
  days: Date[];
  events: CalendarEventOut[];
  onSlotTap: (day: Date, hour: number) => void;
  pulseSlot: string | null;
  reduced: boolean;
}) {
  return (
    <>
      <div className="border-t border-border/60 px-2 py-1.5 text-right">
        <span className={META}>{formatHourLabel(hour)}</span>
      </div>
      {days.map((d) => {
        const key = localDayKey(d);
        const slotKey = `${key}-${hour}`;
        const isPulsing = pulseSlot === slotKey;
        const slotEvents = eventsForDayKey(events, key).filter((ev) => {
          if (ev.allDay) return hour === HOUR_START;
          return new Date(ev.start).getHours() === hour;
        });
        return (
          <button
            key={slotKey}
            type="button"
            onClick={() => onSlotTap(d, hour)}
            className="relative border-t border-l border-border/60 min-h-[44px] hover:bg-muted/30 transition-colors duration-150 text-left p-1 flex flex-col gap-0.5"
          >
            {isPulsing && !reduced && (
              <motion.span
                aria-hidden
                initial={{ opacity: 0.55 }}
                animate={{ opacity: 0 }}
                transition={{ duration: DUR_PULSE, ease: EASE }}
                className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-foreground/30"
              />
            )}
            {slotEvents.map((ev) => (
              <ChipInCell
                key={ev.id}
                event={ev}
                reduced={reduced}
                stopPropagation
                labelMode="title"
              />
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
  const reduced = useReducedMotion();
  const key = localDayKey(cursor);
  const dayEvents = eventsForDayKey(events, key);
  const allDayEvents = dayEvents.filter((ev) => ev.allDay);
  const [pulseHour, setPulseHour] = useState<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
    },
    [],
  );
  const handleSlotTap = useCallback(
    (hour: number) => {
      if (reduced) {
        onSlotTap(hour);
        return;
      }
      setPulseHour(hour);
      if (pulseTimerRef.current !== null) window.clearTimeout(pulseTimerRef.current);
      pulseTimerRef.current = window.setTimeout(() => setPulseHour(null), DUR_PULSE * 1000);
      if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
      openTimerRef.current = window.setTimeout(() => onSlotTap(hour), 140);
    },
    [onSlotTap, reduced],
  );
  return (
    <div className="border border-border/60 rounded-md overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="border-b border-border/60 bg-muted/20 px-3 py-2 space-y-1">
          <p className={SECTION_LABEL}>All day</p>
          {allDayEvents.map((ev) => (
            <EventChip key={ev.id} event={ev} reduced={!!reduced} />
          ))}
        </div>
      )}
      <div className="grid grid-cols-[72px_minmax(0,1fr)]">
        {HOURS.map((hour) => {
          const slotEvents = dayEvents.filter(
            (ev) => !ev.allDay && new Date(ev.start).getHours() === hour,
          );
          const isPulsing = pulseHour === hour;
          return (
            <div key={hour} className="contents">
              <div className="border-t border-border/60 px-3 py-2 text-right">
                <span className={META}>{formatHourLabel(hour)}</span>
              </div>
              <button
                type="button"
                onClick={() => handleSlotTap(hour)}
                className="relative border-t border-l border-border/60 min-h-[52px] hover:bg-muted/30 transition-colors duration-150 text-left p-2 flex flex-col gap-1"
              >
                {isPulsing && !reduced && (
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0.55 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: DUR_PULSE, ease: EASE }}
                    className="pointer-events-none absolute inset-0 rounded-sm ring-2 ring-foreground/30"
                  />
                )}
                {slotEvents.map((ev) => (
                  <EventChip key={ev.id} event={ev} reduced={!!reduced} />
                ))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({ event, reduced }: { event: CalendarEventOut; reduced: boolean }) {
  const variants = event.__justCreated ? CHIP_OPTIMISTIC_VARIANTS : CHIP_ENTER_VARIANTS;
  const body = (
    <motion.span
      initial={reduced ? false : 'initial'}
      animate={reduced ? { opacity: 1 } : 'animate'}
      variants={reduced ? undefined : variants}
      whileTap={reduced ? undefined : { scale: 0.97 }}
      transition={reduced ? undefined : { duration: DUR_PRESS, ease: EASE }}
      className="block text-xs rounded bg-muted/40 px-2 py-1 text-foreground truncate"
      title={event.title}
    >
      <span className="font-medium">{event.title}</span>
      {!event.allDay && (
        <span className={cn(META, 'ml-2')}>
          {formatTimeRange(event.start, event.end, event.allDay)}
        </span>
      )}
    </motion.span>
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

/* ── Search results view ─────────────────────────────────────────────── */

function matchesQuery(ev: CalendarEventOut, q: string): boolean {
  const lower = q.toLowerCase();
  if (ev.title.toLowerCase().includes(lower)) return true;
  if (ev.description && ev.description.toLowerCase().includes(lower)) return true;
  for (const a of ev.attendees) {
    if (a.email.toLowerCase().includes(lower)) return true;
    if (a.name && a.name.toLowerCase().includes(lower)) return true;
  }
  return false;
}

function SearchResultsView({ events, query }: { events: CalendarEventOut[]; query: string }) {
  const results = useMemo(
    () => events.filter((ev) => matchesQuery(ev, query))
           .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [events, query],
  );

  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
        <div className="mx-auto mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
          <Search size={16} strokeWidth={1.75} className="text-muted-foreground" />
        </div>
        <p className={BODY}>No events matched.</p>
        <p className={`${BODY_MUTED} mt-1`}>Try a different term.</p>
      </div>
    );
  }

  const grouped = new Map<string, CalendarEventOut[]>();
  for (const ev of results) {
    const key = localDayKey(new Date(ev.start));
    const arr = grouped.get(key) ?? [];
    arr.push(ev);
    grouped.set(key, arr);
  }
  const dayKeys = Array.from(grouped.keys()).sort();

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

/* ── Agenda view ────────────────────────────────────────────────────── */

function AgendaView({ events }: { events: CalendarEventOut[] }) {
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

/* ── Add event modal ────────────────────────────────────────────────── */

function dateInputValue(d: Date): string {
  return localDayKey(d);
}

function timeInputValue(hour: number, minute = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function isoFromLocalParts(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, mo - 1, d, hh, mm, 0, 0).toISOString();
}

function AddEventModal({
  open,
  onClose,
  prefill,
  onCreated,
  isMobile,
}: {
  open: boolean;
  onClose: () => void;
  prefill: { date: Date; hour?: number } | null;
  onCreated: (ev: CalendarEventOut) => void;
  isMobile: boolean;
}) {
  const initialDate = useMemo(() => prefill?.date ?? new Date(), [prefill]);
  const initialHour = prefill?.hour ?? 9;
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
    (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setError(null);

      // Demo: no network. Build the event locally and splice it in optimistically.
      const attendees = attendeesStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((email) => ({ email, name: null, responseStatus: null }));

      const ev: CalendarEventOut = {
        id: `demo-local-${Date.now()}`,
        title: title || 'New event',
        description: description.trim() || null,
        allDay,
        start: allDay
          ? isoFromLocalParts(startDate, '00:00')
          : isoFromLocalParts(startDate, startTime),
        end: allDay
          ? isoFromLocalParts(endDate, '00:00')
          : isoFromLocalParts(endDate, endTime),
        htmlLink: null,
        attendees,
      };

      setSubmitting(true);
      onCreated(ev);
      toastSuccess('Added to your calendar.');
      setSubmitting(false);
      onClose();
    },
    [
      submitting,
      attendeesStr,
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

  const dialogMotionClass = isMobile
    ? 'data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8 ' +
      'duration-[220ms]'
    : 'data-[state=open]:!zoom-in-98 data-[state=closed]:!zoom-out-98 duration-[220ms]';
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn('sm:max-w-md', dialogMotionClass)}>
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
