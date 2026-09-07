"""Resolve unattended brokerage authority from the database, never caller roles."""

async def resolve_broker_run_owner(db, brokerage_id: str, space_id: str) -> str | None:
    if not isinstance(brokerage_id, str) or not brokerage_id:
        return None
    brokerage = await db.table("Brokerage").select("ownerId").eq("id", brokerage_id).maybe_single().execute()
    if not brokerage.data or not brokerage.data.get("ownerId"):
        return None
    owner_id = brokerage.data["ownerId"]
    space = await db.table("Space").select("id").eq("id", space_id).eq("ownerId", owner_id).maybe_single().execute()
    if not space.data:
        return None
    owner = await db.table("User").select("clerkId").eq("id", owner_id).maybe_single().execute()
    return owner.data.get("clerkId") if owner.data else None
