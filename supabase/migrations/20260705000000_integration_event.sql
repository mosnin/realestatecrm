-- Persisted record of every Composio trigger delivery we accept.
--
-- The webhook receiver (app/api/webhooks/composio) verifies + dedupes a
-- delivery and hands it to Inngest; handleComposioTrigger resolves the
-- connection/trigger and dispatches it to Modal. Until now the raw event
-- was never stored — so a fired trigger was invisible after the fact and
-- unusable as context. This table is the durable record: one row per
-- accepted delivery, written BEFORE the dispatch/cap logic runs so the
-- event is captured even when dispatch is later skipped (paused trigger,
-- rate-cap, daily-cap) or fails.
--
-- It feeds the activity feature (a chronological "here's what Chippi
-- noticed in your connected apps" view) and gives the agent recallable
-- context about recent inbound events.
--
-- status:
--   captured   — persisted; dispatch not (yet) attempted or short-circuited
--                pre-dispatch by a cap/paused check
--   dispatched — a DRAFT/etc. dispatch was invoked and returned ok
--   skipped    — a cap/paused/thin-payload short-circuit meant no dispatch
--   failed     — dispatch was attempted and errored
--
-- Conventions mirror 20260607000014_integration_trigger.sql (quoted
-- camelCase columns, gen_random_uuid()::text PKs, ON DELETE behaviour) and
-- the RLS shape from 20260618000000_integration_rls_policies.sql.

CREATE TABLE IF NOT EXISTS "IntegrationEvent" (
  "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "spaceId"       TEXT NOT NULL REFERENCES "Space"(id) ON DELETE CASCADE,
  "connectionId"  TEXT NOT NULL REFERENCES "IntegrationConnection"(id) ON DELETE CASCADE,
  -- Nullable + ON DELETE SET NULL: an event outlives the trigger row that
  -- captured it (a realtor can delete/re-register triggers; the history stays).
  "triggerId"     TEXT REFERENCES "IntegrationTrigger"(id) ON DELETE SET NULL,
  "toolkit"       TEXT NOT NULL,
  "eventType"     TEXT NOT NULL,                    -- the trigger slug, e.g. 'GMAIL_NEW_GMAIL_MESSAGE'
  "title"         TEXT,                             -- normalized one-line summary
  "actor"         TEXT,                             -- from / sender / name, when the payload has one
  "snippet"       TEXT,                             -- short body/preview, when present
  "occurredAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "payload"       JSONB,                            -- raw delivery payload for full context
  "status"        TEXT NOT NULL DEFAULT 'captured'
                    CHECK ("status" IN ('captured', 'dispatched', 'skipped', 'failed')),
  -- The Modal draft is produced asynchronously; correlating it back onto the
  -- event is a follow-up. Left NULL on capture for now.
  "draftId"       TEXT,
  -- Composio's webhook delivery id. The dedupe anchor — see the partial
  -- unique index below.
  "deliveryId"    TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Feed query: most-recent events for a space, newest first.
CREATE INDEX IF NOT EXISTS "IntegrationEvent_space_occurredAt_idx"
  ON "IntegrationEvent" ("spaceId", "occurredAt" DESC);

-- Idempotency: one row per Composio delivery. Partial so rows without a
-- deliveryId (shouldn't happen today, but keeps the column honest) don't
-- collide on a single NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationEvent_deliveryId_unique"
  ON "IntegrationEvent" ("deliveryId")
  WHERE "deliveryId" IS NOT NULL;

ALTER TABLE "IntegrationEvent" ENABLE ROW LEVEL SECURITY;

-- ── RLS — defense-in-depth, mirrors the other integration tables ────────────
-- All app access is via the service-role key (lib/supabase.ts), which BYPASSES
-- RLS. This SELECT policy exists for least-privilege posture and to protect
-- against a future browser/anon path; it buys zero security for the current
-- server flow and cannot break it. Scope by space ownership through Clerk's
-- userId, exactly like integration_connection_authenticated_select.
DROP POLICY IF EXISTS "integration_event_authenticated_select" ON "IntegrationEvent";
CREATE POLICY "integration_event_authenticated_select" ON "IntegrationEvent"
  FOR SELECT TO authenticated
  USING (
    "spaceId" IN (
      SELECT s.id FROM "Space" s
      JOIN "User" u ON u.id = s."ownerId"
      WHERE u."clerkId" = auth.jwt() ->> 'sub'
    )
  );
REVOKE ALL ON "IntegrationEvent" FROM anon, authenticated;
GRANT SELECT ON "IntegrationEvent" TO authenticated;
