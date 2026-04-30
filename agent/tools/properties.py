"""Property write tools — agent-callable mutations for the Property table.

Tenant boundary: spaceId is taken from RunContextWrapper, never from LLM
arguments. Same pattern as every other write tool in this package.
"""

from __future__ import annotations

import uuid
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from security.context import AgentContext

_ALLOWED_PROPERTY_TYPES = {
    "single_family",
    "condo",
    "townhouse",
    "multi_family",
    "land",
    "commercial",
    "other",
}

_ALLOWED_LISTING_STATUS = {
    "active",
    "pending",
    "sold",
    "off_market",
    "owned",
}


@function_tool
async def add_property(
    ctx: RunContextWrapper[AgentContext],
    address: str,
    list_price: float | None = None,
    property_type: str | None = None,
    listing_status: str | None = None,
    beds: int | None = None,
    baths: float | None = None,
    square_feet: int | None = None,
    mls_number: str | None = None,
    listing_url: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Add a property to the realtor's inventory.

    Use this when the realtor asks to add a listing, register a property
    they're working on, or save an address for later use. The property
    can later be linked to deals and tour bookings.

    Required: address.
    Optional everything else — capture what the realtor mentions, leave
    the rest null. Don't ask follow-up questions just to fill the form.

    list_price is in dollars (number). $850,000 → 850000.

    property_type, when provided, must be one of: 'single_family',
    'condo', 'townhouse', 'multi_family', 'land', 'commercial', 'other'.

    listing_status, when provided, must be one of: 'active', 'pending',
    'sold', 'off_market', 'owned'. Defaults to 'active' if omitted.

    Returns {id, address, list_price, listing_status} on success, or
    {error: "..."} on validation/insert failure.
    """
    space_id = ctx.context.space_id
    db = await supabase()

    address_clean = (address or "").strip()
    if not address_clean:
        return {"error": "address is required"}
    if len(address_clean) > 500:
        return {"error": "address must be 500 characters or fewer"}

    if list_price is not None and (not isinstance(list_price, (int, float)) or list_price < 0):
        return {"error": "list_price must be a non-negative number"}

    if property_type is not None and property_type not in _ALLOWED_PROPERTY_TYPES:
        return {
            "error": "property_type must be one of: " + ", ".join(sorted(_ALLOWED_PROPERTY_TYPES)),
        }

    status = listing_status or "active"
    if status not in _ALLOWED_LISTING_STATUS:
        return {
            "error": "listing_status must be one of: " + ", ".join(sorted(_ALLOWED_LISTING_STATUS)),
        }

    property_id = str(uuid.uuid4())
    row = {
        "id": property_id,
        "spaceId": space_id,
        "address": address_clean,
        "listPrice": list_price,
        "propertyType": property_type,
        "listingStatus": status,
        "beds": beds,
        "baths": baths,
        "squareFeet": square_feet,
        "mlsNumber": mls_number,
        "listingUrl": listing_url,
        "notes": notes,
    }

    try:
        result = await db.table("Property").insert(row).execute()
    except Exception as exc:  # noqa: BLE001 — surface DB error to the agent
        return {"error": f"insert failed: {exc}"}

    if not result.data:
        return {"error": "insert returned no row"}

    return {
        "id": property_id,
        "address": address_clean,
        "list_price": list_price,
        "listing_status": status,
    }
