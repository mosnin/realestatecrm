"""Tests for db._coerce_param — the asyncpg bind-time type coercion.

The regression these guard: asyncpg refuses to bind a `str` to a
`timestamp`/`timestamptz` column ("expected a datetime.date or
datetime.datetime instance, got 'str'"). Every date-ish column the agent
writes — followUpAt, lastContactedAt, scheduledAt, the Tour reminder columns
— is `timestamptz` (supabase/schema.sql). A bare-date string like
'2026-06-18' (which the model produces for followUpAt) was previously NOT
coerced, so the write raised, the tool reported a VALIDATION_ERROR, the model
retried the identical call, and the chat turn burned its whole step budget
("Max turns exceeded"). _coerce_param must turn that bare date into a
midnight-UTC datetime while leaving full datetimes and non-date strings alone.

Run from `agent/` with:

    NEXT_PUBLIC_SUPABASE_URL=stub SUPABASE_SERVICE_ROLE_KEY=stub \\
      python -m pytest tests/test_db_coerce_param.py -v
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime

os.environ.setdefault("NEXT_PUBLIC_SUPABASE_URL", "stub")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "stub")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from db import _coerce_param  # noqa: E402

# ── Date-only → midnight-UTC datetime (the bug this PR fixes) ──────────────────


def test_date_only_becomes_midnight_utc_datetime() -> None:
    out = _coerce_param("2026-06-18")
    assert isinstance(out, datetime)
    assert out == datetime(2026, 6, 18, 0, 0, 0, tzinfo=UTC)
    # Must be tz-aware so asyncpg binds it to a timestamptz column.
    assert out.tzinfo is not None
    assert out.utcoffset() == UTC.utcoffset(None)


def test_date_only_is_not_left_as_str() -> None:
    # The precise failure mode: a bare-date STR reaching asyncpg raised.
    assert not isinstance(_coerce_param("2026-01-01"), str)


# ── Full ISO datetime still coerces (unchanged behaviour) ─────────────────────


def test_full_iso_datetime_with_z() -> None:
    out = _coerce_param("2026-06-18T09:30:00Z")
    assert isinstance(out, datetime)
    assert out == datetime(2026, 6, 18, 9, 30, 0, tzinfo=UTC)


def test_full_iso_datetime_with_offset() -> None:
    out = _coerce_param("2026-06-18T09:30:00+02:00")
    assert isinstance(out, datetime)
    assert out.utcoffset().total_seconds() == 2 * 3600


def test_naive_iso_datetime_treated_as_utc() -> None:
    out = _coerce_param("2026-06-18T09:30:00")
    assert isinstance(out, datetime)
    assert out == datetime(2026, 6, 18, 9, 30, 0, tzinfo=UTC)


def test_iso_datetime_minute_precision() -> None:
    # The regex allows seconds-optional; minute precision must still parse.
    out = _coerce_param("2026-06-18T09:30")
    assert isinstance(out, datetime)
    assert out == datetime(2026, 6, 18, 9, 30, 0, tzinfo=UTC)


# ── Plain non-date strings pass through unchanged ─────────────────────────────


def test_plain_string_unchanged() -> None:
    assert _coerce_param("hello world") == "hello world"


def test_uuid_like_string_unchanged() -> None:
    val = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    assert _coerce_param(val) == val


def test_partial_or_malformed_date_unchanged() -> None:
    # Wrong shape (no day) — must not be mistaken for a date.
    assert _coerce_param("2026-06") == "2026-06"
    # Right shape, impossible calendar date — fromisoformat raises, so the
    # original string is returned rather than crashing the bind.
    assert _coerce_param("2026-13-40") == "2026-13-40"


def test_non_string_values_pass_through() -> None:
    assert _coerce_param(42) == 42
    assert _coerce_param(None) is None
    assert _coerce_param([1, 2, 3]) == [1, 2, 3]
    existing = datetime(2026, 6, 18, tzinfo=UTC)
    assert _coerce_param(existing) is existing
