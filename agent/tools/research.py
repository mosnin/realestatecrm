"""Property IQ — area research tool.

The Tavily + Firecrawl + LLM pipeline lives in the Next.js app
(lib/area-analysis.ts), so this tool calls back into the app's internal
endpoint rather than re-implementing it in Python. Tenant boundary: spaceId
comes from the RunContext, never the model.

Returns a `display: "area"` payload so the chat renders the Area IQ card, the
same as the TypeScript runtime's research_area tool.
"""

from __future__ import annotations

from typing import Any

import httpx
from agents import RunContextWrapper, function_tool

from config import settings
from security.context import AgentContext

# Generous client timeout: the server budget is ~55s (search + scrape + LLM).
_TIMEOUT = 70.0


@function_tool(strict_mode=False)
async def research_area(
    ctx: RunContextWrapper[AgentContext],
    location: str,
    for_buyer: str | None = None,
) -> dict[str, Any]:
    """Research a neighborhood/area (ZIP, "City, ST", or address): schools, safety,
    walkability, local market, lifestyle. Returns a grounded Area IQ card with sources.
    Pass for_buyer (a short description of the buyer and what they care about, e.g.
    "family with two kids, budget 600k, wants good schools") whenever you know who it's
    for, so the verdict is tailored to them."""
    where = (location or "").strip()
    if not where:
        return {"error": "location is required (a ZIP, city + state, or address)"}

    if not settings.agent_internal_secret or not settings.app_url:
        return {
            "summary": "Area research is not configured on this deployment.",
            "display": "warning",
        }

    payload: dict[str, Any] = {"spaceId": ctx.context.space_id, "query": where}
    buyer = (for_buyer or "").strip()
    if buyer:
        payload["forBuyer"] = buyer

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            res = await client.post(
                f"{settings.app_url}/api/internal/area-research",
                json=payload,
                headers={"Authorization": f"Bearer {settings.agent_internal_secret}"},
            )
    except Exception as exc:  # network/timeout — fail soft
        return {"error": f"area research failed: {exc}"}

    if res.status_code >= 500:
        return {"error": "area research is temporarily unavailable"}

    try:
        body = res.json()
    except Exception:
        return {"error": "area research returned an unreadable response"}

    status = body.get("status")
    if status == "not_configured":
        return {
            "summary": "Area research is not configured on this workspace yet.",
            "display": "warning",
        }
    if status == "no_evidence":
        return {
            "summary": (
                f"I researched {where} but couldn't find enough public data to brief you on it."
            ),
            "display": "plain",
        }
    if status != "ok" or not body.get("report"):
        return {
            "summary": body.get("error") or "I couldn't research that area right now.",
            "display": "plain",
        }

    report = body["report"]
    intel = report.get("intelligence", {})
    fields = intel.get("fields", {})

    # Build the same flat AreaCardData the TypeScript tool returns so the chat
    # renders an identical Area IQ card regardless of runtime.
    metrics: list[dict[str, str]] = []
    def push(label: str, value: Any) -> None:
        if value not in (None, "", []):
            metrics.append({"label": label, "value": str(value)})

    push("Schools", fields.get("schoolRating"))
    push("Safety", fields.get("crimeLevel"))
    push("Walk Score", fields.get("walkScore"))
    push("Transit", fields.get("transitScore"))
    push("Bike Score", fields.get("bikeScore"))
    if fields.get("medianListPrice") is not None:
        push("Median list", f"${int(fields['medianListPrice']):,}")
    if fields.get("medianSalePrice") is not None:
        push("Median sale", f"${int(fields['medianSalePrice']):,}")
    push("Market", (fields.get("marketTrend") or "").title() or None)
    push("Days on market", fields.get("medianDaysOnMarket"))

    section_specs = [
        ("Schools", "schoolsSummary"),
        ("Safety", "safetySummary"),
        ("Walkability & transit", "walkabilitySummary"),
        ("Market", "marketSummary"),
        ("Amenities", "amenitiesSummary"),
        ("Lifestyle", "lifestyleSummary"),
        ("Commute", "commuteSummary"),
    ]
    sources_map = intel.get("fieldSources", {})
    sections = [
        {"title": title, "body": fields[key], "source": sources_map.get(key)}
        for title, key in section_specs
        if fields.get(key)
    ]

    verdict = intel.get("verdict", "")
    label = report.get("label", where)
    area_card = {
        "label": label,
        "verdict": verdict,
        "summary": intel.get("summary", ""),
        "marketAsOf": fields.get("marketAsOf"),
        "generatedAt": report.get("generatedAt", ""),
        "cached": bool(body.get("cached")),
        "metrics": metrics,
        "sections": sections,
        "highlights": fields.get("highlights") or [],
        "sources": intel.get("sources") or [],
    }

    # Lead the transcript line with the verdict (the judgment), not a label.
    summary_line = f"Area IQ for {label}: {verdict}" if verdict else f"Area IQ for {label}."
    return {
        "summary": summary_line,
        "display": "area",
        "data": {"ok": True, "area": area_card},
    }
