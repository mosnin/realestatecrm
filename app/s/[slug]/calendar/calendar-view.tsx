'use client';

/**
 * /s/[slug]/calendar — thin reading view of the realtor's external
 * calendar.
 *
 * Chippi doesn't own a calendar. The realtor already lives in Google
 * Calendar (or Outlook); this surface mirrors what's there. Events
 * Chippi creates write THROUGH to the same calendar — the source of
 * truth stays single.
 *
 * Three states:
 *   1. Not connected → calm prompt, one primary action (connect).
 *   2. Connected, events present → grouped-by-day list. Click an event
 *      to open it in the provider (the htmlLink).
 *   3. Connected, no events in window → empty-state card with a quiet
 *      Chippi-voice line.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Calendar as CalendarIcon, Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  BODY,
  SECTION_LABEL,
  PRIMARY_PILL,
  META,
} from '@/lib/typography';

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
  /** 'googlecalendar' | 'outlook_calendar' | null */
  initialProvider: string | null;
}

function providerLabel(provider: string | null): string {
  if (provider === 'googlecalendar') return 'Google Calendar';
  if (provider === 'outlook_calendar') return 'Outlook Calendar';
  return 'your calendar';
}

function formatDateKey(iso: string): string {
  // Local-day grouping. Realtor reads "tomorrow" as their wall clock,
  // not UTC midnight.
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayHeading(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const eventDay = new Date(y, m - 1, d);
  const today = new Date();
  const todayKey = formatDateKey(today.toISOString());
  if (dateKey === todayKey) return 'Today';
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow.toISOString());
  if (dateKey === tomorrowKey) return 'Tomorrow';
  return eventDay.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return 'All day';
  const startD = new Date(start);
  const endD = new Date(end);
  const fmt: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  return `${startD.toLocaleTimeString(undefined, fmt)} — ${endD.toLocaleTimeString(undefined, fmt)}`;
}

export function CalendarView({
  slug,
  initialConnected,
  initialProvider,
}: CalendarViewProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [provider, setProvider] = useState<string | null>(initialProvider);
  const [events, setEvents] = useState<CalendarEventOut[]>([]);
  const [loading, setLoading] = useState(initialConnected); // only spin when fetching
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch events whenever the surface lands in connected state. The
  // server pass already told us whether to expect events; the client
  // does the actual provider hit so the page paints first.
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
        if (!res.ok) {
          throw new Error(`Fetch failed (${res.status})`);
        }
        const data = (await res.json()) as FetchPayload;
        if (cancelled) return;
        if (!data.connected) {
          // Connection flipped off between server pass and client fetch
          // — treat as the not-connected state.
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

  // Group events by local day so the page reads as a timeline, not a list.
  const grouped = new Map<string, CalendarEventOut[]>();
  for (const ev of events) {
    const key = formatDateKey(ev.start);
    const arr = grouped.get(key) ?? [];
    arr.push(ev);
    grouped.set(key, arr);
  }
  const dayKeys = Array.from(grouped.keys()).sort();

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-3xl mx-auto chat-content-wrap pt-10 sm:pt-14 pb-24 space-y-10">
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

        {connected && !loading && !errorMessage && events.length === 0 && (
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <p className={BODY}>Nothing on the books in the next 30 days.</p>
            <p className={`${BODY_MUTED} mt-1`}>Quiet stretch.</p>
          </div>
        )}

        {connected && !loading && !errorMessage && events.length > 0 && (
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
        )}
      </div>
    </div>
  );
}

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

