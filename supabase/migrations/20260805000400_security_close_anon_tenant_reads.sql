-- SECURITY (CRITICAL): close anon read access to tenant data.
--
-- Live audit of the prod DB found permissive RLS policies granting the `anon`
-- role `USING (true)` SELECT on Contact, Deal, DealStage, and Tour — meaning the
-- public anon API key (shipped to every browser as NEXT_PUBLIC_SUPABASE_ANON_KEY)
-- could read EVERY tenant's contacts, deals, deal stages, and tours via PostgREST
-- (e.g. GET /rest/v1/Contact). For a real-estate CRM that's the most sensitive
-- PII in the system — a cross-tenant data leak.
--
-- A prior migration (20260409_fix_realtime_rls.sql) was written to fix exactly
-- this but was NEVER APPLIED to prod (the deny_anon_* policies it creates are
-- absent live, while the USING(true) policies are still present). With no
-- migration tracking, the unapplied critical fix went unnoticed. This migration
-- is self-sufficient: it removes every permissive anon read policy (both the
-- "...by space" and plain variants) and installs explicit deny policies, so the
-- hole is closed whether or not 20260409 ever runs.
--
-- Legitimate realtime is UNAFFECTED: authenticated realtime (the realtor's own
-- workspace, via the Clerk JWT) is served by the scoped realtime_authenticated_*
-- policies, and all server-side access uses the service role, which bypasses RLS.
-- The anon path SHOULD see nothing — an unauthenticated browser must not read
-- tenant data.

-- Contact
DROP POLICY IF EXISTS "realtime: anon can read contacts" ON "Contact";
DROP POLICY IF EXISTS "realtime: anon can read contacts by space" ON "Contact";
DROP POLICY IF EXISTS deny_anon_contact_select ON "Contact";
CREATE POLICY deny_anon_contact_select ON "Contact" FOR SELECT TO anon USING (false);

-- Deal
DROP POLICY IF EXISTS "realtime: anon can read deals" ON "Deal";
DROP POLICY IF EXISTS "realtime: anon can read deals by space" ON "Deal";
DROP POLICY IF EXISTS deny_anon_deal_select ON "Deal";
CREATE POLICY deny_anon_deal_select ON "Deal" FOR SELECT TO anon USING (false);

-- DealStage (had two permissive anon variants)
DROP POLICY IF EXISTS "realtime: anon can read deal stages" ON "DealStage";
DROP POLICY IF EXISTS "realtime: anon can read deal stages by space" ON "DealStage";
DROP POLICY IF EXISTS "realtime: anon can read deal_stages by space" ON "DealStage";
DROP POLICY IF EXISTS deny_anon_dealstage_select ON "DealStage";
CREATE POLICY deny_anon_dealstage_select ON "DealStage" FOR SELECT TO anon USING (false);

-- Tour
DROP POLICY IF EXISTS "realtime: anon can read tours" ON "Tour";
DROP POLICY IF EXISTS "realtime: anon can read tours by space" ON "Tour";
DROP POLICY IF EXISTS deny_anon_tour_select ON "Tour";
CREATE POLICY deny_anon_tour_select ON "Tour" FOR SELECT TO anon USING (false);
