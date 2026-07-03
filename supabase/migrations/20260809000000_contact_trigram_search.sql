-- Trigram search indexes for the People list's substring search.
--
-- GET /api/contacts?search=… runs, per token, an OR of
--   name ILIKE '%tok%' OR email ILIKE '%tok%' OR phone ILIKE '%tok%'
--   OR preferences ILIKE '%tok%'
-- scoped to one space. A leading-wildcard ILIKE can't use a b-tree, so today
-- each search is a scan of every Contact in the space — fine at 200 rows,
-- linearly worse as a brokerage's book grows into the tens of thousands. A GIN
-- trigram index turns '%tok%' into an index probe.
--
-- pg_trgm ships with Supabase; CREATE EXTENSION IF NOT EXISTS is a no-op when
-- it's already present. Indexes are created CONCURRENTLY (no table lock) and
-- IF NOT EXISTS (idempotent / safe to re-run). Additive and reversible
-- (DROP INDEX) — no application change required to benefit.
--
-- Only name and email get trigram indexes: they're the high-selectivity,
-- high-traffic search fields. phone matches are usually exact-prefix (a
-- separate concern) and preferences is a low-cardinality free-text blob where
-- a scan of the already-space-filtered set is acceptable.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "contact_name_trgm_idx"
  ON "Contact" USING gin ("name" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "contact_email_trgm_idx"
  ON "Contact" USING gin ("email" gin_trgm_ops);
