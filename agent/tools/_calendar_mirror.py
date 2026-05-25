"""Mirror Google Calendar events back into Chippi's local `CalendarEvent`
table so the realtor sees them on `/s/[slug]/calendar` immediately after
Chippi books a tour. One-way only: GCal -> Chippi.

Why a separate file (and not inlined into tours.py): the mirror is the
seam between two systems (the realtor's Google Calendar via Composio,
and Chippi's day-view UI). Keeping it isolated means tours.py stays a
pure tour-booking flow, and a future caller (a Composio
GOOGLECALENDAR_CREATE_EVENT path, a manual sync button, etc.) can pull
this helper without dragging tour-specific logic in.

The mirror is *best-effort*. A failure here must not break the
upstream tool — the tour is still booked, the GCal invite still went
out. Callers wrap this in try/except and move on.

Not a function_tool — internal helper, called from inside a tool. Name
intentionally underscore-prefixed to signal that, matching the tools/
module convention (peer of base.py).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog

from db import supabase

log = structlog.get_logger(__name__)


# Color the calendar page renders for tour-shaped events. Hardcoded
# "blue" so realtors can scan the day view and see "Chippi-booked"
# vs. their own manual CalendarEvents (default "gray"). The day view's
# valid palette is gray/orange/blue/purple/green/red — see
# app/api/calendar/events/route.ts:54.
_TOUR_COLOR = "blue"


def _calendar_event_id(google_event_id: str | None, tour_id: str) -> str:
    """Deterministic CalendarEvent.id derived from the source.

    Re-running the same booking (e.g. a retried tool call, or a routine
    that fires twice) produces the same id, so the upsert collapses to
    a no-op on the second hit instead of duplicating the day view.

    Prefer the Google event id when present — that's the truly stable
    cross-system anchor. Fall back to the Tour id when the booking has
    no GCal sync yet, which still keeps Chippi's day view single-row.
    """
    if google_event_id:
        return f"gcal-{google_event_id}"
    return f"tour-{tour_id}"


def _format_time_label(starts: datetime) -> str:
    """`HH:MM` 24-hour string — matches what the manual /api/calendar
    /events POST stores. Calendar UI shows it under the event title.
    """
    return starts.astimezone(timezone.utc).strftime("%H:%M")


async def mirror_tour_to_calendar(
    *,
    space_id: str,
    tour_id: str,
    guest_name: str,
    starts_at: datetime,
    google_event_id: str | None = None,
    property_address: str | None = None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    """Upsert a `CalendarEvent` row mirroring one booked tour.

    Parameters mirror what's in hand inside `book_tour` after the Tour
    row is written. We deliberately do NOT re-fetch from Google — the
    payload we already have is the canonical source.

    Returns the inserted row dict on success, or None on failure (in
    which case the caller's try/except will swallow it). Failure is
    logged but never raised — the mirror is best-effort.

    Field mapping (column on `CalendarEvent` <- source):
      id            <- deterministic `gcal-{gid}` or `tour-{tid}` (idempotent)
      spaceId       <- agent context's space
      title         <- `Tour: {guestName}` (matches /api/tours/gcal:119)
      description   <- composed string with address + notes (same shape)
      date          <- starts_at converted to UTC date (`YYYY-MM-DD`)
      time          <- starts_at converted to UTC time (`HH:MM`)
      color         <- `_TOUR_COLOR` ("blue")
    """
    if starts_at.tzinfo:
        starts_utc = starts_at.astimezone(timezone.utc)
    else:
        starts_utc = starts_at.replace(tzinfo=timezone.utc)

    description_parts: list[str] = []
    if property_address:
        description_parts.append(f"Property: {property_address}")
    if notes:
        description_parts.append(f"Notes: {notes}")
    description = "\n".join(description_parts) if description_parts else None

    row = {
        "id": _calendar_event_id(google_event_id, tour_id),
        "spaceId": space_id,
        "title": f"Tour: {guest_name}",
        "description": description,
        "date": starts_utc.date(),
        "time": _format_time_label(starts_utc),
        "color": _TOUR_COLOR,
    }

    try:
        db = await supabase()
        result = await (
            db.table("CalendarEvent")
            .upsert(row, on_conflict="id")
            .execute()
        )
    except Exception as exc:  # noqa: BLE001 — best-effort mirror
        log.warning(
            "calendar_mirror_failed",
            space_id=space_id,
            tour_id=tour_id,
            google_event_id=google_event_id,
            error=str(exc)[:300],
        )
        return None

    log.info(
        "calendar_mirror_ok",
        space_id=space_id,
        tour_id=tour_id,
        google_event_id=google_event_id,
        calendar_event_id=row["id"],
    )
    return result.data[0] if result.data else row
