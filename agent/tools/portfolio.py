"""Portfolio analysis tool — synthesise cross-contact signals into space-level insights."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from memory.store import save_memory
from security.context import AgentContext


@function_tool(strict_mode=False)
async def analyze_portfolio(
    ctx: RunContextWrapper[AgentContext],
) -> dict[str, Any]:
    """Analyse the workspace portfolio (contacts + active deals); persists summary memory."""
    space_id = ctx.context.space_id
    db = await supabase()

    # --- Concurrent fetch -------------------------------------------------------
    contacts_query = (
        db.table("Contact")
        .select("id,leadScore,leadType,lastContactedAt,followUpAt,tags,type")
        .eq("spaceId", space_id)
    )
    deals_query = (
        db.table("Deal")
        .select("id,value,closeDate,status,probability")
        .eq("spaceId", space_id)
        .eq("status", "active")
    )
    # Won deals across the last 60 days — split into this-30 vs prior-30 so the
    # KPI card can show an honest period-over-period change. closedAt is set
    # when a deal transitions to a terminal status (migration deal_close_metrics).
    cutoff_60d_iso = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    won_query = (
        db.table("Deal")
        .select("closedAt")
        .eq("spaceId", space_id)
        .eq("status", "won")
        .gte("closedAt", cutoff_60d_iso)
    )

    try:
        contacts_res, deals_res, won_res = await asyncio.gather(
            contacts_query.execute(),
            deals_query.execute(),
            won_query.execute(),
        )
    except Exception as exc:
        return {"error": f"Portfolio analysis failed: {exc}"}

    contacts: list[dict[str, Any]] = contacts_res.data or []
    deals: list[dict[str, Any]] = deals_res.data or []
    won_deals: list[dict[str, Any]] = won_res.data or []

    now = datetime.now(timezone.utc)
    cutoff_30d = now - timedelta(days=30)
    cutoff_14d = now - timedelta(days=14)
    closing_cutoff = (now + timedelta(days=14)).date().isoformat()

    # --- Contact metrics --------------------------------------------------------
    contact_count = len(contacts)

    high_score_count = sum(
        1 for c in contacts if (c.get("leadScore") or 0) >= 70
    )

    def _is_overdue(c: dict[str, Any]) -> bool:
        follow_up = c.get("followUpAt")
        if follow_up:
            try:
                fu_dt = datetime.fromisoformat(follow_up.replace("Z", "+00:00"))
                return fu_dt < now
            except ValueError:
                pass
        # Fallback: no followUpAt but haven't been contacted in 30+ days
        last = c.get("lastContactedAt")
        if last is None:
            return True
        try:
            last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
            return last_dt < cutoff_30d
        except ValueError:
            return False

    overdue_followup_count = sum(1 for c in contacts if _is_overdue(c))

    # Contacts are stored lowercase ("rental" / "buyer") per the LeadType
    # Literal in schemas.py and the TS contract — uppercase comparison
    # silently zeroed both counts on every run.
    rental_count = sum(1 for c in contacts if (c.get("leadType") or "").lower() == "rental")
    buyer_count = sum(1 for c in contacts if (c.get("leadType") or "").lower() == "buyer")
    rental_pct = round(rental_count / contact_count * 100, 1) if contact_count else 0.0
    buyer_pct = round(buyer_count / contact_count * 100, 1) if contact_count else 0.0

    scores = [c.get("leadScore") or 0 for c in contacts]
    avg_lead_score = round(sum(scores) / len(scores), 1) if scores else 0.0

    engaged_count = 0
    for c in contacts:
        last = c.get("lastContactedAt")
        if last:
            try:
                last_dt = datetime.fromisoformat(last.replace("Z", "+00:00"))
                if last_dt >= cutoff_14d:
                    engaged_count += 1
            except ValueError:
                pass
    engagement_rate_pct = round(engaged_count / contact_count * 100, 1) if contact_count else 0.0

    # Top 3 contacts by leadScore
    sorted_contacts = sorted(contacts, key=lambda c: c.get("leadScore") or 0, reverse=True)
    hot_leads = [
        {"id": c["id"], "leadScore": c.get("leadScore") or 0}
        for c in sorted_contacts[:3]
    ]

    # --- Deal metrics -----------------------------------------------------------
    pipeline_value = sum(
        (d.get("value") or 0) * ((d.get("probability") or 0) / 100)
        for d in deals
    )
    pipeline_value = round(pipeline_value, 2)

    deals_closing_14d = sum(
        1
        for d in deals
        if d.get("closeDate") and d["closeDate"] <= closing_cutoff
    )

    # Open-pipeline gross (sum of active deal values) for the KPI card — distinct
    # from probability-weighted pipeline_value above, which the narrative uses.
    open_pipeline_value = round(sum((d.get("value") or 0) for d in deals), 2)

    # --- Won-this-period (KPI diff) ---------------------------------------------
    cutoff_30d_iso = cutoff_30d.isoformat()
    won_this_30 = 0
    won_prior_30 = 0
    for w in won_deals:
        closed = w.get("closedAt")
        if not closed:
            continue
        if closed >= cutoff_30d_iso:
            won_this_30 += 1
        else:
            won_prior_30 += 1
    # StatsDisplay renders diff.value as a PERCENT; only meaningful with a
    # non-zero prior window, else omit (never divide-by-zero or fake a count).
    won_diff_pct = (
        round((won_this_30 - won_prior_30) / won_prior_30 * 100)
        if won_prior_30 > 0
        else None
    )

    # KPI card payload (StatsDisplay shape) — surfaced via display:'stats'.
    stats: list[dict[str, Any]] = [
        {"key": "contacts", "label": "Active contacts", "value": contact_count,
         "format": {"kind": "number"}},
        {"key": "deals", "label": "Open deals", "value": len(deals),
         "format": {"kind": "number"}},
        {"key": "pipeline", "label": "Pipeline value", "value": round(open_pipeline_value),
         "format": {"kind": "currency", "currency": "USD", "decimals": 0}},
        {
            "key": "won",
            "label": "Won (30d)",
            "value": won_this_30,
            "format": {"kind": "number"},
            **(
                {"diff": {"value": won_diff_pct, "decimals": 0, "label": "vs prior 30d"}}
                if won_diff_pct is not None
                else {}
            ),
        },
    ]

    # --- Narrative insights -----------------------------------------------------
    insights: list[str] = []

    if engagement_rate_pct < 30:
        insights.append(
            f"Only {engagement_rate_pct}% of contacts have been touched in the past 14 days"
            " — consider activating the Long-Term Nurture agent."
        )

    if deals_closing_14d > 0:
        insights.append(
            f"{deals_closing_14d} deal(s) closing within 14 days need priority attention."
        )

    if high_score_count > 5:
        insights.append(
            f"{high_score_count} hot leads (score ≥ 70) are in the pipeline"
            " — prioritize these for personal outreach."
        )

    if avg_lead_score < 40 and not insights:
        # Only surface this if no higher-priority insight was generated
        insights.append(
            f"Portfolio average score is low ({avg_lead_score}/100)"
            " — a scoring pass could surface hidden opportunities."
        )

    # Ensure at least one insight is always returned
    if not insights:
        if overdue_followup_count > 0:
            insights.append(
                f"{overdue_followup_count} contact(s) have overdue follow-ups"
                " — review and reschedule to keep the pipeline healthy."
            )
        else:
            insights.append(
                f"Portfolio looks healthy: {contact_count} contacts,"
                f" avg score {avg_lead_score}/100,"
                f" pipeline value ${pipeline_value:,.0f}."
            )

    # --- Persist space-level memory ---------------------------------------------
    summary = (
        f"Portfolio snapshot: {contact_count} contacts, avg score {avg_lead_score}/100, "
        f"{high_score_count} hot leads, engagement {engagement_rate_pct}%, "
        f"pipeline ${pipeline_value:,.0f}, {deals_closing_14d} deal(s) closing in 14d."
    )
    await save_memory(
        space_id=space_id,
        entity_type="space",
        entity_id=space_id,
        memory_type="observation",
        content=f"Portfolio analysis: {summary}",
        importance=0.6,
    )

    return {
        "contact_count": contact_count,
        "high_score_count": high_score_count,
        "overdue_followup_count": overdue_followup_count,
        "rental_pct": rental_pct,
        "buyer_pct": buyer_pct,
        "pipeline_value": pipeline_value,
        "open_pipeline_value": open_pipeline_value,
        "deals_closing_14d": deals_closing_14d,
        "won_last_30d": won_this_30,
        "avg_lead_score": avg_lead_score,
        "hot_leads": hot_leads,
        "engagement_rate_pct": engagement_rate_pct,
        "insights": insights,
        # KPI card (StatsDisplay shape) — the chat surface renders this when
        # display == 'stats'. Envelope fields (id/title) live alongside `stats`.
        "id": "workspace-stats",
        "title": "Workspace snapshot",
        "stats": stats,
        "display": "stats",
    }
