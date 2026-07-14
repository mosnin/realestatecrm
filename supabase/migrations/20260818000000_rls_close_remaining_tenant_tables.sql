-- Close the last anon-readable tenant tables (defense-in-depth).
--
-- Audit (2026-08) found four tables that hold tenant data but never had RLS
-- enabled — created in the Prisma baseline or in feature migrations that
-- forgot the ENABLE line — so `GET /rest/v1/<table>` with the public anon key
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY, shipped to every browser) could read across
-- tenants via PostgREST. Every server consumer uses the service-role client
-- (lib/supabase.ts), which BYPASSES RLS, so enabling deny-all here changes
-- nothing for the app and only closes the anon hole:
--
--   ContactActivity   (spaceId)      — contact PII timeline: notes, call/email/
--                                       meeting logs, inbound message bodies.
--                                       Highest priority (43 server query sites).
--   BrokerNotification (brokerageId) — broker notification feed.
--   Conversation      (spaceId)      — AI chat conversation titles/metadata.
--   AreaReport        (spaceId)      — cached area-intelligence JSON per space.
--
-- No `authenticated` SELECT policy is added: none of these is read through the
-- browser client or subscribed via Realtime, so "RLS on + no policy = deny all"
-- is the correct end state. The explicit RESTRICTIVE anon-deny policies below
-- make the denial unconditional AND keep Supabase's advisor quiet (matches the
-- style of 20260805000600_anon_deny_restrictive.sql). Idempotent throughout.

ALTER TABLE IF EXISTS "ContactActivity"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "BrokerNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "Conversation"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "AreaReport"        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public."ContactActivity"') IS NOT NULL THEN
    DROP POLICY IF EXISTS deny_anon_contactactivity_select ON "ContactActivity";
    CREATE POLICY deny_anon_contactactivity_select ON "ContactActivity"
      AS RESTRICTIVE FOR SELECT TO anon USING (false);
  END IF;

  IF to_regclass('public."BrokerNotification"') IS NOT NULL THEN
    DROP POLICY IF EXISTS deny_anon_brokernotification_select ON "BrokerNotification";
    CREATE POLICY deny_anon_brokernotification_select ON "BrokerNotification"
      AS RESTRICTIVE FOR SELECT TO anon USING (false);
  END IF;

  IF to_regclass('public."Conversation"') IS NOT NULL THEN
    DROP POLICY IF EXISTS deny_anon_conversation_select ON "Conversation";
    CREATE POLICY deny_anon_conversation_select ON "Conversation"
      AS RESTRICTIVE FOR SELECT TO anon USING (false);
  END IF;

  IF to_regclass('public."AreaReport"') IS NOT NULL THEN
    DROP POLICY IF EXISTS deny_anon_areareport_select ON "AreaReport";
    CREATE POLICY deny_anon_areareport_select ON "AreaReport"
      AS RESTRICTIVE FOR SELECT TO anon USING (false);
  END IF;
END $$;
