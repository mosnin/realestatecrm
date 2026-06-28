-- Security: harden database functions (advisor: function_search_path_mutable,
-- *_security_definer_function_executable).
--
-- Two hardening passes, both verified safe against the live catalog:
--
-- 1. Pin an explicit search_path on the 20 functions that had a mutable one.
--    All 20 are SECURITY INVOKER (no privilege escalation), but a pinned path
--    is defense-in-depth: the function can't be made to resolve to attacker
--    objects via a crafted session search_path. The superset
--    `public, extensions, pg_catalog` matches what they already resolve against
--    (the match_* functions need `extensions` for the pgvector operators); a
--    catalog scan confirmed none reference storage/vault/net/cron/graphql/
--    realtime, so the superset is complete.
--
-- 2. Lock the 5 INTERNAL SECURITY DEFINER functions to service_role only. They
--    were executable by anon/authenticated via the default PUBLIC grant; a
--    SECURITY DEFINER function runs with the definer's rights, so exposing it
--    to the public API is needless attack surface. None is referenced by an RLS
--    policy (current_user_internal_id IS — used by 32 policies — so it is
--    deliberately left untouched). service_role keeps execute, which is how the
--    app (service-role key) calls them.

-- ── 1. Pin search_path ───────────────────────────────────────────────────────
ALTER FUNCTION public.book_tour_atomic(p_id text, p_space_id text, p_contact_id text, p_guest_name text, p_guest_email text, p_guest_phone text, p_property_address text, p_notes text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_property_profile_id text, p_manage_token text) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.broker_routine_set_next_run() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.charge_credits_for_chat_usage() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.cleanup_agent_data() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.create_brokerage_with_owner(p_name text, p_owner_id text) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.create_space_with_defaults(p_space_id text, p_slug text, p_name text, p_emoji text, p_owner_id text, p_settings_id text, p_intake_title text, p_intake_intro text, p_business_name text, p_stages jsonb) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.match_agent_memory(query_embedding vector, match_space_id text, match_count integer, filter_memory_type text, filter_entity_type text, filter_entity_id text, min_similarity double precision) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.match_documents(query_embedding vector, match_space_id text, match_count integer) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.match_documents_hybrid(query_embedding vector, query_text text, match_space_id text, match_count integer, rrf_k integer) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.normalize_invite_code() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.purge_credit_rows_for_account() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.redeem_invite_code_atomic(p_code text, p_space_id text, p_user_clerk_id text) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.reorder_deal(p_deal_id text, p_new_stage_id text, p_new_position integer) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.resolve_billing_account_for_space(p_space_id text) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.routine_next_run_at(p_cadence text, p_hour integer, p_from timestamp with time zone, p_day_of_month integer, p_days_of_week text[]) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.routine_next_run_at(p_cadence text, p_hour integer, p_from timestamp with time zone) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.routine_set_next_run() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.search_knowledge_docs(query_text text, filter_category text, result_limit integer) SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.stamp_brief_enabled_at() SET search_path = public, extensions, pg_catalog;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, extensions, pg_catalog;

-- ── 2. Lock internal SECURITY DEFINER functions to service_role ──────────────
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.ensure_agent_settings_for_space() FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.ensure_agent_settings_for_space() TO service_role;

  REVOKE EXECUTE ON FUNCTION public.merge_contacts(text, text[], text, text) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.merge_contacts(text, text[], text, text) TO service_role;

  REVOKE EXECUTE ON FUNCTION public.offboard_brokerage_member(text, text, text, boolean) FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.offboard_brokerage_member(text, text, text, boolean) TO service_role;

  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

  REVOKE EXECUTE ON FUNCTION public.sync_commission_ledger() FROM PUBLIC, anon, authenticated;
  GRANT  EXECUTE ON FUNCTION public.sync_commission_ledger() TO service_role;
END $$;
