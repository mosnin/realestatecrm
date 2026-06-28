# Database audit — findings & follow-ups (2026-06)

Live audit of the **chippi** prod project (`yomlpfhlbphvxepsjttm`) via the Supabase
Management API advisors + catalog queries. Everything below was derived from the live
schema; migrations are committed under `supabase/migrations/2026080500*`.

## ⚠️ CRITICAL (committed, must be applied to prod)

**Anon role could read all tenant data.** Permissive RLS policies granted the `anon`
role `USING (true)` SELECT on `Contact`, `Deal`, `DealStage`, `Tour`. The public anon
key ships to every browser (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), so anyone could read every
tenant's contacts/deals/tours via PostgREST — a cross-tenant PII leak.

- Root cause: `20260409_fix_realtime_rls.sql` fixed this **but was never applied** (its
  `deny_anon_*` policies are absent live; the `USING(true)` policies remain). No migration
  tracking → the unapplied critical fix went unnoticed.
- Fix: `20260805000400_security_close_anon_tenant_reads.sql` (self-sufficient: drops the
  permissive anon policies + installs explicit deny). Authenticated realtime and
  service-role access are unaffected.
- **ACTION: apply to prod ASAP** (`supabase db push --linked`, or re-run the audit apply
  with a fresh management token).

## Applied & verified (earlier audit session, advisor-confirmed)
- `20260805000000` — 38 FK covering indexes
- `20260805000100` — drop 4 duplicate indexes
- `20260805000200` — pin search_path on 20 functions; lock 5 SECURITY DEFINER funcs to service_role
- `20260805000300` — wrap `auth.*()` in 14 RLS policies (initplan)

Advisor deltas (prod, after apply): function_search_path_mutable 20→0; security-definer
exec-able 11→2 (the 2 left are `current_user_internal_id`, required by 32 RLS policies);
unindexed_foreign_keys 45→7; duplicate_index 4→0; auth_rls_initplan 14→0.

## Committed, pending apply (this session)
- `20260805000400` — CRITICAL anon-read fix (above)
- `20260805000500` — index the last 7 unindexed FKs (resolves unindexed_foreign_keys 7→0)

## Deferred — need a live management token to do SAFELY (not done blind)
The audit token expired mid-session, so these were intentionally NOT applied blind:

1. **Staging (`chippistaging`)** — apply all `2026080500*` migrations via the pipeline.
2. **`multiple_permissive_policies` (authenticated)** — after the anon fix, the remaining
   duplicates are the authenticated pair (`"<x>: space owner only"` + `realtime_authenticated_<x>_select`)
   on Contact/Deal/DealStage. They use *different* auth mechanisms (`current_user_internal_id()`
   vs `auth.jwt()->>'sub'`), so consolidating must be validated against live data, not merged blind.
3. **Unused indexes (~124 flagged)** — DO NOT drop blindly. Many are on `spaceId`/common
   filter columns that the app relies on but that simply weren't scanned in the advisor's
   window; dropping those would hurt prod. The 38+7 FK indexes just added also read as
   "unused" until queries warm them. Safe approach: reset index stats, observe over a real
   window, then drop only zero-scan, non-constraint, non-FK-covering indexes. List of
   flagged names captured during the audit.
4. **Migration tracking** — prod has no `supabase_migrations.schema_migrations`, which is
   how a CRITICAL fix silently never shipped. Adopt `supabase db push`/`migration list` in
   CI (or `migration repair` to backfill history) so "what's applied" is always answerable.
   This is the highest-leverage process fix — it would have caught the anon-read exposure.
