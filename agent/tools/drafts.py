"""Draft message tool — Chippi never sends, only drafts.

Every contact-facing message lands in the realtor's approval inbox as an
AgentDraft. The realtor approves before anything ships. There is no "send"
mode, no autonomy override, no confidence gate. One trust boundary.

The tool auto-dedupes: if a draft for the same contact + channel was created
in the last 48 hours and is still pending, the existing draft is returned
instead of a new one. Prevents the agent from burying the realtor in copies
when it loops.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from agents import RunContextWrapper, function_tool

from db import supabase
from errors import from_supabase_error, from_exception
from security.context import AgentContext
from tools.activities import persist_log
from tools.base import idempotent_tool, with_retry
from tools.streaming import publish_event

_VALID_CHANNELS = {"sms", "email", "note"}
_DEDUPE_WINDOW_HOURS = 48


@function_tool(strict_mode=False)
@idempotent_tool
async def draft_message(
    ctx: RunContextWrapper[AgentContext],
    channel: str,
    content: str,
    reasoning: str,
    contact_id: str | None = None,
    recipient_email: str | None = None,
    recipient_phone: str | None = None,
    subject: str | None = None,
    deal_id: str | None = None,
    priority: int = 0,
) -> dict[str, Any]:
    """Draft a message for the realtor's approval. THE canonical outreach tool.

    Use this for ANY person-facing message — known CRM lead, fresh email
    address, SMS to a phone the realtor names. The realtor reviews and
    approves; on approval the system routes through their connected inbox
    (Gmail / Outlook via Composio) or SMS provider automatically.

    Identify the recipient ONE of these three ways — provide whichever the
    realtor named, and the tool finds the existing contact or auto-creates
    a stub Contact row so the draft has somewhere to live:

      contact_id        — when you already have it from find_contacts.
      recipient_email   — when the realtor typed a raw address ("send
                          jane@acme.com an email"). The tool looks for an
                          existing contact with that email in the space;
                          if none, creates a minimal stub (name derived
                          from the email, leadType 'buyer', tagged
                          'auto-created') so the draft lands somewhere.
      recipient_phone   — same as email but for SMS.

    channel: 'sms' | 'email' | 'note'.
    subject: required when channel == 'email'.
    content: message body. Keep SMS under 160 chars.
    reasoning: why this outreach is warranted (visible to the realtor).
    priority: 0 (normal) to 100 (urgent) — affects inbox ordering.

    Auto-dedup: if a pending draft exists for the same contact+channel
    from the last 48h, returns it instead of creating a duplicate.

    Returns: { "action": "drafted" | "deduped", "draftId": "...",
              "contactId": "...", "channel": "...",
              "autoCreatedContact": bool?, "nextStep": "..." }

    `nextStep` is a one-sentence, realtor-facing line the model should
    quote or paraphrase in its reply so the trust boundary stays visible:
    something was drafted, it's awaiting approval, and if a contact was
    auto-stubbed the realtor is told.
    """
    space_id = ctx.context.space_id

    if channel not in _VALID_CHANNELS:
        agent_err = from_supabase_error({"message": f"channel must be one of {_VALID_CHANNELS}", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
    if channel == "email" and not subject:
        agent_err = from_supabase_error({"message": "subject is required for email channel", "code": None})
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    if not contact_id and not recipient_email and not recipient_phone:
        return {
            "error": "Provide one of: contact_id, recipient_email, recipient_phone",
            "code": "MISSING_RECIPIENT",
            "retryable": False,
        }

    db = await supabase()

    # ── Resolve recipient → contactId ────────────────────────────────────
    # If contact_id was passed, verify it. Otherwise look up by email or
    # phone in this space; auto-create a stub if missing so the realtor's
    # explicit "send X to Y" never gets blocked on contact bookkeeping.
    auto_created = False
    contact_name: str | None = None

    if contact_id:
        check = await (
            db.table("Contact")
            .select("id,name")
            .eq("id", contact_id)
            .eq("spaceId", space_id)
            .maybe_single()
            .execute()
        )
        if not check.data:
            agent_err = from_supabase_error({"message": "Contact not found in space", "code": None})
            return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}
        contact_name = check.data.get("name", "contact")
    else:
        # Look up by email or phone first.
        clean_email = (recipient_email or "").strip().lower() or None
        clean_phone = (recipient_phone or "").strip() or None
        lookup = db.table("Contact").select("id,name").eq("spaceId", space_id)
        if clean_email:
            lookup = lookup.ilike("email", clean_email)
        elif clean_phone:
            lookup = lookup.eq("phone", clean_phone)
        found = await lookup.limit(1).maybe_single().execute()
        if found and found.data:
            contact_id = found.data["id"]
            contact_name = found.data.get("name", "contact")
        else:
            # Auto-create a minimal stub. Name guessed from the email local
            # part ("jane.doe" → "Jane Doe") so the realtor sees something
            # readable in their inbox. The realtor can edit later.
            new_id = str(uuid.uuid4())
            if clean_email:
                local = clean_email.split("@", 1)[0]
                guessed_name = local.replace(".", " ").replace("_", " ").replace("-", " ").title()
            else:
                guessed_name = (clean_phone or "Unknown").strip()
            # The Contact table has DEFAULT now() on createdAt/updatedAt.
            # Don't pass them from Python — the underlying asyncpg pool
            # rejects ISO strings for TIMESTAMPTZ columns (`expected a
            # datetime.date or datetime.datetime instance, got 'str'`),
            # which broke every auto-stub insert. Let Postgres own the
            # timestamps.
            stub: dict[str, Any] = {
                "id": new_id,
                "spaceId": space_id,
                "name": guessed_name[:200] or "Unknown",
                "leadType": "buyer",
                "type": "QUALIFICATION",
                "properties": [],
                "tags": ["auto-created"],
            }
            if clean_email:
                stub["email"] = clean_email[:320]
            if clean_phone:
                stub["phone"] = clean_phone[:40]
            try:
                await db.table("Contact").insert(stub).execute()
            except Exception as e:
                agent_err = from_exception(e)
                return {"error": f"auto-create contact failed: {agent_err.message}", "code": agent_err.code, "retryable": agent_err.retryable}
            contact_id = new_id
            contact_name = stub["name"]
            auto_created = True

    # ── Dedup: existing pending draft for same contact+channel in window ──
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=_DEDUPE_WINDOW_HOURS)).isoformat()
    existing = await (
        db.table("AgentDraft")
        .select("id,channel,content,createdAt")
        .eq("spaceId", space_id)
        .eq("contactId", contact_id)
        .eq("channel", channel)
        .eq("status", "pending")
        .gte("createdAt", cutoff)
        .order("createdAt", desc=True)
        .limit(1)
        .execute()
    )
    if existing.data:
        prior = existing.data[0]
        return {
            "action": "deduped",
            "draftId": prior["id"],
            "contactId": contact_id,
            "channel": channel,
            "note": "A pending draft for this contact already exists from the last 48h.",
            "nextStep": (
                f"Already had a pending draft for {contact_name} from the last 48h — "
                "open your inbox to send or edit it."
            ),
        }

    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    draft = {
        "id": str(uuid.uuid4()),
        "spaceId": space_id,
        "contactId": contact_id,
        "dealId": deal_id,
        "channel": channel,
        "subject": subject,
        "content": content,
        "reasoning": reasoning,
        "priority": max(0, min(100, priority)),
        "status": "pending",
        "expiresAt": expires_at,
    }

    try:
        result = await with_retry(lambda: db.table("AgentDraft").insert(draft).execute())
    except Exception as e:
        agent_err = from_exception(e)
        return {"error": agent_err.message, "code": agent_err.code, "retryable": agent_err.retryable}

    await publish_event(
        ctx.context,
        "draft",
        f"Draft {channel.upper()} for {contact_name} — awaiting your approval",
        metadata={"contactId": contact_id, "channel": channel},
    )

    try:
        await persist_log(
            ctx.context,
            action_type="message_drafted",
            outcome="queued_for_approval",
            reasoning=f"{channel}: {reasoning[:200]}",
            contact_id=contact_id,
            deal_id=deal_id,
        )
    except Exception:
        # The AgentDraft row already committed — logging is best-effort.
        pass

    created = result.data[0] if result.data else draft
    if auto_created:
        next_step = (
            "Drafted — review and approve in your inbox to send. "
            f"(Auto-created a contact stub for {contact_name} since they "
            "weren't in your CRM yet — edit the name in Contacts if you'd like.)"
        )
    else:
        next_step = "Drafted — review and approve in your inbox to send. I never send for you without approval."
    return {
        "action": "drafted",
        "draftId": created.get("id", ""),
        "contactId": contact_id,
        "channel": channel,
        "autoCreatedContact": auto_created,
        "nextStep": next_step,
    }
