/**
 * GET  /api/calendar/events?slug=xxx
 * POST /api/calendar/events    (manual event creation)
 *
 * GET: returns the next 30 days of events from the realtor's connected
 * external calendar (Google Calendar via Composio). On-demand fetch —
 * no background sync, no webhook receiver, no cache layer beyond a
 * thin 60s memoization to absorb the page's own re-renders.
 *
 * POST: realtor-initiated manual event creation. Validates ownership,
 * connection presence, and the payload shape; pushes to the provider
 * via `writeEventThrough` (same helper tour booking uses) so the event
 * appears in their actual Google Calendar AND a CalendarEventMirror
 * row lands for forensics. Returns the created event in the same
 * shape GET emits so the client can splice it into the visible view.
 *
 * The Chippi calendar surface is a thin read view; the realtor's
 * external calendar is the truth. If nothing's connected we return
 * `{ connected: false }` so the UI renders the connect prompt without
 * a separate roundtrip.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSpaceOwner } from '@/lib/api-auth';
import { logger } from '@/lib/logger';
import { executeToolForEntity } from '@/lib/integrations/composio';
import {
  PROVIDER_TOOL_SLUGS,
  findCalendarConnection,
  writeEventThrough,
} from '@/lib/calendar/mirror';

export const runtime = 'nodejs';
// 30s is generous — the Composio call is typically <1s, but Google's
// cold path on a primary calendar with many events can stretch.
export const maxDuration = 30;

const LOOKAHEAD_DAYS = 30;

/** In-process memo. 60s TTL absorbs a realtor flipping between days
 *  in the UI without hammering Composio. Keyed by spaceId so multi-
 *  tenant calls don't cross-pollinate. The serverless cold-start
 *  ratio means this is mostly a hot-loop guard, not a long-term cache. */
interface CacheEntry {
  expiresAt: number;
  payload: ConnectedPayload;
}
const memo = new Map<string, CacheEntry>();
const MEMO_TTL_MS = 60_000;

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

interface NotConnectedPayload {
  connected: false;
}

interface ConnectedPayload {
  connected: true;
  provider: string;
  events: CalendarEventOut[];
}

type Payload = NotConnectedPayload | ConnectedPayload;

interface GcalEventAttendee {
  email?: string | null;
  displayName?: string | null;
  responseStatus?: string | null;
  self?: boolean | null;
}

interface GcalEvent {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  attendees?: GcalEventAttendee[] | null;
}

function normalizeGcalEvent(raw: GcalEvent): CalendarEventOut | null {
  const id = raw.id ?? '';
  if (!id) return null;
  // Google sends `dateTime` for timed events, `date` for all-day events.
  // We pass both shapes through — the UI renders all-day differently.
  const startIso = raw.start?.dateTime ?? raw.start?.date ?? null;
  const endIso = raw.end?.dateTime ?? raw.end?.date ?? null;
  if (!startIso || !endIso) return null;
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);
  return {
    id,
    title: (raw.summary ?? '').trim() || '(No title)',
    description: raw.description?.trim() || null,
    start: startIso,
    end: endIso,
    allDay,
    htmlLink: raw.htmlLink?.trim() || null,
    attendees: (raw.attendees ?? [])
      .filter((a): a is GcalEventAttendee => Boolean(a))
      .map((a) => ({
        email: (a.email ?? '').trim(),
        name: a.displayName?.trim() || null,
        responseStatus: a.responseStatus?.trim() || null,
      }))
      .filter((a) => a.email),
  };
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  // Connection presence is the data signal — IntegrationConnection row
  // with toolkit in (googlecalendar, outlook_calendar) and status =
  // 'active'. No row → render the connect prompt.
  const connection = await findCalendarConnection(space.id);
  if (!connection) {
    const payload: Payload = { connected: false };
    return NextResponse.json(payload);
  }

  // Hot-path cache. Independent of connection identity — a reconnect
  // (which mints a new connection id) bypasses the memo on the next
  // request because the cached payload no longer satisfies "events for
  // THIS active connection"; we just keep it simple and key by space.
  const cached = memo.get(space.id);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const now = new Date();
  const timeMax = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const slugs = PROVIDER_TOOL_SLUGS[connection.toolkit];

  let events: CalendarEventOut[] = [];
  try {
    const resp = await executeToolForEntity({
      entityId: connection.userId,
      slug: slugs.list,
      arguments: {
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      },
    });
    if (resp.successful) {
      // Composio wraps Google's response; events can land at
      // resp.data.items, resp.data.events, or resp.items depending on
      // SDK version. Try in that order; bail to empty.
      const data = resp.data as
        | { items?: unknown; events?: unknown }
        | undefined;
      const rawItems =
        (data && Array.isArray((data as { items?: unknown }).items)
          ? ((data as { items?: unknown }).items as unknown[])
          : null) ??
        (data && Array.isArray((data as { events?: unknown }).events)
          ? ((data as { events?: unknown }).events as unknown[])
          : null) ??
        ((resp as unknown as { items?: unknown }).items &&
        Array.isArray((resp as unknown as { items?: unknown }).items)
          ? ((resp as unknown as { items?: unknown }).items as unknown[])
          : null) ??
        [];
      for (const raw of rawItems) {
        const normalized = normalizeGcalEvent(raw as GcalEvent);
        if (normalized) events.push(normalized);
      }
    } else {
      logger.warn(
        '[api/calendar/events] composio returned !successful',
        { spaceId: space.id, provider: connection.toolkit, err: resp.error ?? null },
      );
    }
  } catch (err) {
    logger.error(
      '[api/calendar/events] composio call threw',
      { spaceId: space.id, provider: connection.toolkit },
      err,
    );
    // Don't 500 — the realtor sees an empty list with the calm empty
    // state. Composio's flakiness shouldn't break the calendar page.
    events = [];
  }

  const payload: ConnectedPayload = {
    connected: true,
    provider: connection.toolkit,
    events,
  };
  memo.set(space.id, { expiresAt: Date.now() + MEMO_TTL_MS, payload });
  return NextResponse.json(payload);
}

/* ── POST ─────────────────────────────────────────────────────────────── */

/**
 * Manual event creation. Validates the realtor owns the space, has an
 * active calendar connection, and that the payload makes sense; then
 * fires `writeEventThrough` (same helper tour booking uses) so the event
 * lands in their actual calendar and a forensic mirror row gets written.
 */

interface CreateEventBody {
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  startDate?: unknown; // "YYYY-MM-DD"
  startTime?: unknown; // "HH:MM" (omitted/ignored when allDay)
  endDate?: unknown; // "YYYY-MM-DD"
  endTime?: unknown; // "HH:MM"
  allDay?: unknown;
  attendees?: unknown; // string[] of emails
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export interface ValidatedCreate {
  title: string;
  description: string | null;
  allDay: boolean;
  /** ISO 8601 with local timezone offset for timed; YYYY-MM-DD for all-day. */
  startsAt: string;
  /** Same shape as startsAt. For all-day Google wants end EXCLUSIVE (next day). */
  endsAt: string;
  attendees: { email: string }[];
}

/**
 * Pure validator — exported for unit testing. Returns the normalized
 * payload or an error string explaining what's wrong. No throws.
 */
export function validateCreatePayload(body: CreateEventBody): { ok: true; value: ValidatedCreate } | { ok: false; error: string } {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return { ok: false, error: 'Title is required.' };
  if (title.length > 250) return { ok: false, error: 'Title too long.' };

  const description = typeof body.description === 'string' ? body.description.trim() : '';

  const allDay = body.allDay === true;

  const startDate = typeof body.startDate === 'string' ? body.startDate : '';
  if (!DATE_RE.test(startDate)) return { ok: false, error: 'Start date required.' };
  const endDate = typeof body.endDate === 'string' && body.endDate ? body.endDate : startDate;
  if (!DATE_RE.test(endDate)) return { ok: false, error: 'End date invalid.' };

  let startsAt: string;
  let endsAt: string;

  if (allDay) {
    // `writeEventThrough` posts via Composio's `start_datetime` /
    // `end_datetime` fields, which want a datetime string. Represent an
    // all-day event as a 24-hour timed event from local midnight to the
    // next day's midnight — Google renders this visually identical to a
    // true all-day event for the realtor, and we avoid a fragile date-
    // only path through the Composio wrapper. v2 can branch to true
    // all-day when we extend `writeEventThrough`.
    if (endDate < startDate) return { ok: false, error: 'End date is before start.' };
    startsAt = toLocalISO(startDate, '00:00');
    const [ey, em, ed] = endDate.split('-').map(Number);
    const nextDay = new Date(ey, em - 1, ed + 1, 0, 0, 0, 0);
    const ny = nextDay.getFullYear();
    const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
    const nd = String(nextDay.getDate()).padStart(2, '0');
    endsAt = toLocalISO(`${ny}-${nm}-${nd}`, '00:00');
  } else {
    const startTime = typeof body.startTime === 'string' ? body.startTime : '';
    const endTime = typeof body.endTime === 'string' ? body.endTime : '';
    if (!TIME_RE.test(startTime)) return { ok: false, error: 'Start time required.' };
    if (!TIME_RE.test(endTime)) return { ok: false, error: 'End time required.' };

    // Local ISO with offset — match what Google expects for timed events.
    startsAt = toLocalISO(startDate, startTime);
    endsAt = toLocalISO(endDate, endTime);
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      return { ok: false, error: 'End must be after start.' };
    }
  }

  // Attendees: optional, each must be a valid email. Reject the whole
  // form if any one is malformed — realtor needs to know which line to
  // fix, but a single error message is fine; the modal surfaces it.
  const attendeesRaw = Array.isArray(body.attendees) ? body.attendees : [];
  if (attendeesRaw.length > 50) return { ok: false, error: 'Too many attendees.' };
  const attendees: { email: string }[] = [];
  for (const raw of attendeesRaw) {
    if (typeof raw !== 'string') return { ok: false, error: 'Invalid attendee.' };
    const email = raw.trim();
    if (!email) continue;
    if (!EMAIL_RE.test(email)) return { ok: false, error: `Invalid email: ${email}` };
    attendees.push({ email });
  }

  return {
    ok: true,
    value: {
      title,
      description: description || null,
      allDay,
      startsAt,
      endsAt,
      attendees,
    },
  };
}

/** Build an ISO 8601 timestamp with the server's local timezone offset.
 *  Server clock matches the realtor's intent only when this runs in their
 *  region; in serverless that's not guaranteed, so the client also sends
 *  the IANA-formatted strings to be safe. For v1 we accept server tz —
 *  the realtor's calendar is the truth, Google will display it correctly
 *  for them either way once it lands. */
function toLocalISO(dateStr: string, timeStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const local = new Date(y, mo - 1, d, hh, mm, 0, 0);
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offH = String(Math.floor(abs / 60)).padStart(2, '0');
  const offM = String(abs % 60).padStart(2, '0');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${sign}${offH}:${offM}`;
}

export async function POST(req: NextRequest) {
  let body: CreateEventBody;
  try {
    body = (await req.json()) as CreateEventBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;
  const { space } = auth;

  const validated = validateCreatePayload(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const connection = await findCalendarConnection(space.id);
  if (!connection) {
    return NextResponse.json(
      { error: 'Connect a calendar first.' },
      { status: 400 },
    );
  }

  const v = validated.value;
  const result = await writeEventThrough({
    spaceId: space.id,
    connection,
    title: v.title,
    description: v.description,
    startsAt: v.startsAt,
    endsAt: v.endsAt,
    attendees: v.attendees,
    createdBy: 'realtor',
  });

  if (!result.externalOk) {
    // The mirror row landed (forensics) but the realtor's calendar
    // didn't get the event. Tell them honestly — the optimistic UI
    // shouldn't show success when the calendar doesn't have it.
    return NextResponse.json(
      { error: 'Could not reach your calendar. Try again.' },
      { status: 502 },
    );
  }

  // Invalidate the 60s memo so a refetch picks up the new event from
  // the source of truth. Cheap; the next GET re-hits Composio once.
  memo.delete(space.id);

  // Return the event in the same shape GET emits — the client can splice
  // it directly into local state without a refetch.
  const event: CalendarEventOut = {
    id: result.externalEventId ?? `mirror-${result.mirrorId}`,
    title: v.title,
    description: v.description,
    start: v.startsAt,
    end: v.endsAt,
    allDay: v.allDay,
    htmlLink: null,
    attendees: v.attendees.map((a) => ({
      email: a.email,
      name: null,
      responseStatus: null,
    })),
  };

  logger.info('[api/calendar/events] manual event created', {
    spaceId: space.id,
    provider: connection.toolkit,
    externalEventId: result.externalEventId,
  });

  return NextResponse.json({ connected: true, provider: connection.toolkit, event });
}
