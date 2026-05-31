"""Broker read tools — response-time benchmarking across the team.

One tool: audit_response_times(). Computes the per-realtor median hours
from Contact.createdAt to first outbound activity, then bands realtors as
'fast' / 'on_pace' / 'slow' against the team median.

The classification is intentionally band-based, not absolute. The chief-of-
staff voice (see `agent/chippi_broker.py:BROKER_INSTRUCTIONS`) frames every
realtor's number against the team benchmark — never as a judgment. "Alice's
median is 28h vs team median 6h" is OK. "Alice is slow" is not.

Definition of "outbound" matches the rest of the broker side: ContactActivity
rows of type 'call', 'email', or 'meeting'. Type 'note' / 'follow_up' are
private memory, not contact with the human.
"""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext

from ._guards import require_broker_role


# Outbound activity types — single source of truth here so team.py and
# performance.py can't drift apart. (They define their own _OUTBOUND_TYPES
# for the same reason — co-locating tuples next to the queries that use them
# beats a shared "constants.py" no-one finds.)
_OUTBOUND_TYPES: tuple[str, ...] = ("call", "email", "meeting")

# Window for the median calc. Contacts created in this window are the only
# ones we compute response speed for — older contacts may have legitimate
# long-tail nurture cycles that aren't "response speed."
_WINDOW_DAYS = 30


# Band multipliers against the team median:
#   fast:    median ≤ team_median × 0.5
#   slow:    median ≥ team_median × 2.0
#   on_pace: anything in between
# Picked deliberately wide so the bands only catch real outliers.
_FAST_MULTIPLIER = 0.5
_SLOW_MULTIPLIER = 2.0


@function_tool(strict_mode=False)
async def audit_response_times(
    ctx: RunContextWrapper[AgentContext],
) -> dict[str, Any]:
    """Per-realtor median first-touch response time over 30d, banded vs team median."""
    # Bands relative to team_median: fast (<=0.5x), on_pace (mid), slow (>=2x).
    # Realtors with no outbound in window surface as no_data, not slow.
    require_broker_role(ctx)
    brokerage_id = ctx.context.brokerage_id

    db = await supabase()
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=_WINDOW_DAYS)

    spaces_res = await (
        db.table("Space")
        .select("id,ownerId,name")
        .eq("brokerageId", brokerage_id)
        .execute()
    )
    spaces = spaces_res.data or []
    if not spaces:
        return {
            "ok": True,
            "team_median_hours": None,
            "fast": [],
            "slow": [],
            "on_pace": [],
            "no_data": [],
        }

    owner_ids = [s["ownerId"] for s in spaces if s.get("ownerId")]
    users_res = await (
        db.table("User")
        .select("id,name,email")
        .in_("id", owner_ids)
        .execute()
    ) if owner_ids else None
    users_by_id = {u["id"]: u for u in ((users_res.data if users_res else []) or [])}

    per_realtor: list[dict[str, Any]] = []
    all_hours: list[float] = []
    for space in spaces:
        space_id = space["id"]
        owner_id = space.get("ownerId")
        if not owner_id:
            continue
        user = users_by_id.get(owner_id) or {}
        name = user.get("name") or user.get("email") or "Realtor"

        # Contacts created in the window.
        contacts_res = await (
            db.table("Contact")
            .select("id,createdAt")
            .eq("spaceId", space_id)
            .gte("createdAt", since)
            .limit(2000)
            .execute()
        )
        contacts = contacts_res.data or []
        if not contacts:
            per_realtor.append({
                "id": owner_id,
                "name": name,
                "median_hours": None,
                "sample_size": 0,
            })
            continue

        contact_ids = [c["id"] for c in contacts if c.get("id")]
        if not contact_ids:
            per_realtor.append({
                "id": owner_id,
                "name": name,
                "median_hours": None,
                "sample_size": 0,
            })
            continue

        # First outbound activity per contact — same shape as
        # team._response_hours_for_space, duplicated here so neither module
        # imports the other's private helper. (Single source of truth via
        # a shared module would be nice, but the realtor tools follow the
        # same pattern: a little duplication beats a tangle.)
        acts_res = await (
            db.table("ContactActivity")
            .select("contactId,createdAt")
            .in_("contactId", contact_ids)
            .in_("type", list(_OUTBOUND_TYPES))
            .execute()
        )
        acts = acts_res.data or []
        first_outbound: dict[str, datetime] = {}
        for a in acts:
            cid = a.get("contactId")
            ts = a.get("createdAt")
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if not isinstance(ts, datetime):
                continue
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            prev = first_outbound.get(cid or "")
            if prev is None or ts < prev:
                first_outbound[cid or ""] = ts

        hours: list[float] = []
        for c in contacts:
            cid = c.get("id")
            created = c.get("createdAt")
            if isinstance(created, str):
                try:
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                except ValueError:
                    continue
            if not isinstance(created, datetime):
                continue
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            first = first_outbound.get(cid or "")
            if not first:
                continue
            delta = (first - created).total_seconds() / 3600.0
            if delta < 0:
                continue
            hours.append(round(delta, 2))

        if hours:
            med = round(statistics.median(hours), 2)
            per_realtor.append({
                "id": owner_id,
                "name": name,
                "median_hours": med,
                "sample_size": len(hours),
            })
            all_hours.extend(hours)
        else:
            per_realtor.append({
                "id": owner_id,
                "name": name,
                "median_hours": None,
                "sample_size": 0,
            })

    # Team median across ALL response samples (not the median of medians —
    # the broker wants the team's "typical" response, which is best measured
    # on raw samples).
    team_median = round(statistics.median(all_hours), 2) if all_hours else None

    fast: list[dict[str, Any]] = []
    slow: list[dict[str, Any]] = []
    on_pace: list[dict[str, Any]] = []
    no_data: list[dict[str, Any]] = []

    if team_median is None:
        # No outbound across the brokerage — return everyone in no_data.
        for r in per_realtor:
            no_data.append({"id": r["id"], "name": r["name"]})
        return {
            "ok": True,
            "team_median_hours": None,
            "fast": fast,
            "slow": slow,
            "on_pace": on_pace,
            "no_data": no_data,
        }

    fast_threshold = team_median * _FAST_MULTIPLIER
    slow_threshold = team_median * _SLOW_MULTIPLIER
    for r in per_realtor:
        med = r["median_hours"]
        if med is None:
            no_data.append({"id": r["id"], "name": r["name"]})
        elif med <= fast_threshold:
            fast.append({"id": r["id"], "name": r["name"], "median_hours": med})
        elif med >= slow_threshold:
            slow.append({"id": r["id"], "name": r["name"], "median_hours": med})
        else:
            on_pace.append({"id": r["id"], "name": r["name"], "median_hours": med})

    return {
        "ok": True,
        "team_median_hours": team_median,
        "fast": fast,
        "slow": slow,
        "on_pace": on_pace,
        "no_data": no_data,
    }


PERFORMANCE_TOOLS: list = [audit_response_times]


__all__ = ["audit_response_times", "PERFORMANCE_TOOLS"]
